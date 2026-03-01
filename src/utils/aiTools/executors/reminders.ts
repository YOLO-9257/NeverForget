import {
    CreateReminderRequest,
    Env,
    PushConfig,
    Reminder,
    UpdateReminderRequest
} from '../../../types';
import {
    ackReminder,
    createReminder,
    deleteReminder,
    getReminder,
    listReminders,
    triggerReminder,
    updateReminder
} from '../../../handlers/reminders';
import { formatTimestamp } from '../../../utils/time';
import {
    buildInternalUrl,
    createJsonRequest,
    isRecord,
    toPositiveInt,
    unwrapApiResponse
} from './shared';
import { sendPush } from '../../../services/pusher';
import { logAiAction } from '../../../services/aiActionLogger';

const REMINDER_STATUS_SET = new Set(['active', 'paused', 'completed', 'failed']);
const UPDATE_STATUS_SET = new Set(['active', 'paused']);
const SAVED_CONFIG_CATEGORY_PUSH = 'push_config';
const SAVED_CONFIG_CATEGORY_USER = 'wxpush_userid';
const SAVED_CONFIG_CATEGORY_TEMPLATE = 'wxpush_templateid';
const DEFAULT_CONFIG_NAME_SET = new Set(['default', '默认', '默认配置', 'default_config']);

interface SavedConfigRow {
    category: string;
    name: string;
    value: string;
    created_at: number;
}

interface ResolvedPushConfigResult {
    config: PushConfig;
    targetName: string | null;
    matchedNames: string[];
    matchedTemplateName: string | null;
    usedDefaultConfig: boolean;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function normalizeLookupKey(value: unknown): string {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function extractTargetName(args: Record<string, any>): string {
    const candidates = [args.recipient, args.config_name, args.target, args.to, args.user];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }
    return '';
}

function extractTemplateHint(args: Record<string, any>): string {
    const candidates = [args.template_name, args.template, args.detail_template, args.template_alias];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }
    return '';
}

function parsePushConfigValue(raw: string): Partial<PushConfig> {
    try {
        const parsed = JSON.parse(raw);
        return sanitizePushConfig(parsed);
    } catch {
        return {};
    }
}

function pickConfigByName(rows: SavedConfigRow[], targetName: string): SavedConfigRow | null {
    const target = normalizeLookupKey(targetName);
    if (!target) {
        return null;
    }

    const normalizedRows = rows
        .map(row => ({ row, key: normalizeLookupKey(row.name) }))
        .filter(item => item.key);

    const exact = normalizedRows.find(item => item.key === target);
    if (exact) {
        return exact.row;
    }

    const partial = normalizedRows.filter(item => item.key.includes(target) || target.includes(item.key));
    return partial.length === 1 ? partial[0].row : null;
}

function pickDefaultConfig(rows: SavedConfigRow[]): SavedConfigRow | null {
    const hit = rows.find(row => DEFAULT_CONFIG_NAME_SET.has(normalizeLookupKey(row.name)));
    if (hit) {
        return hit;
    }

    // 若仅存在一条配置，默认将其视为该分类的默认项，减少“未命中默认配置”带来的失败。
    if (rows.length === 1) {
        return rows[0];
    }

    return null;
}

async function loadSavedPushRows(env: Env, userKey: string): Promise<SavedConfigRow[]> {
    try {
        const result = await env.DB.prepare(`
            SELECT category, name, value, created_at
            FROM saved_configs
            WHERE user_key = ?
              AND category IN (?, ?, ?)
            ORDER BY created_at DESC
        `).bind(
            userKey,
            SAVED_CONFIG_CATEGORY_PUSH,
            SAVED_CONFIG_CATEGORY_USER,
            SAVED_CONFIG_CATEGORY_TEMPLATE
        ).all<SavedConfigRow>();

        return result.results || [];
    } catch {
        return [];
    }
}

function mergeMissingPushConfig(base: Partial<PushConfig>, source: Partial<PushConfig>): boolean {
    let changed = false;
    if (!base.appid && source.appid) {
        base.appid = source.appid;
        changed = true;
    }
    if (!base.secret && source.secret) {
        base.secret = source.secret;
        changed = true;
    }
    if (!base.userid && source.userid) {
        base.userid = source.userid;
        changed = true;
    }
    if (!base.template_id && source.template_id) {
        base.template_id = source.template_id;
        changed = true;
    }
    if (!base.template_name && source.template_name) {
        base.template_name = source.template_name;
        changed = true;
    }
    if (!base.base_url && source.base_url) {
        base.base_url = source.base_url;
        changed = true;
    }
    if (!base.callback_url && source.callback_url) {
        base.callback_url = source.callback_url;
        changed = true;
    }
    return changed;
}

async function loadBasePushConfig(input: unknown, env: Env, userKey: string): Promise<Partial<PushConfig>> {
    const provided = sanitizePushConfig(input);
    const fallback = await loadLatestPushConfig(env, userKey);
    return { ...fallback, ...provided };
}

async function resolvePushConfigWithNamedTarget(
    args: Record<string, any>,
    env: Env,
    userKey: string
): Promise<ResolvedPushConfigResult> {
    const baseConfig = await loadBasePushConfig(args.push_config, env, userKey);
    const targetName = extractTargetName(args);
    const templateHint = extractTemplateHint(args);
    const rows = await loadSavedPushRows(env, userKey);

    const pushRows = rows.filter(row => row.category === SAVED_CONFIG_CATEGORY_PUSH);
    const userRows = rows.filter(row => row.category === SAVED_CONFIG_CATEGORY_USER);
    const templateRows = rows.filter(row => row.category === SAVED_CONFIG_CATEGORY_TEMPLATE);

    let merged: Partial<PushConfig> = { ...baseConfig };
    const matchedNames: string[] = [];
    let matchedTemplateName: string | null = null;
    let usedDefaultConfig = false;

    if (targetName) {
        const namedPush = pickConfigByName(pushRows, targetName);
        if (namedPush) {
            merged = { ...merged, ...parsePushConfigValue(namedPush.value) };
            matchedNames.push(namedPush.name);
        }

        const namedUser = pickConfigByName(userRows, targetName);
        if (namedUser && namedUser.value.trim()) {
            merged.userid = namedUser.value.trim();
            matchedNames.push(namedUser.name);
        }

        const namedTemplate = pickConfigByName(templateRows, targetName);
        if (namedTemplate && namedTemplate.value.trim()) {
            merged.template_id = namedTemplate.value.trim();
            matchedNames.push(namedTemplate.name);
        }
    }

    if (templateHint) {
        merged.template_name = templateHint;
        const namedTemplate = pickConfigByName(templateRows, templateHint);
        if (namedTemplate && namedTemplate.value.trim()) {
            merged.template_id = namedTemplate.value.trim();
            matchedTemplateName = namedTemplate.name;
            matchedNames.push(namedTemplate.name);
        }
    }

    const defaultPush = pickDefaultConfig(pushRows);
    if (defaultPush) {
        const changed = mergeMissingPushConfig(merged, parsePushConfigValue(defaultPush.value));
        if (changed) {
            usedDefaultConfig = true;
        }
    }

    const defaultUser = pickDefaultConfig(userRows);
    if (defaultUser && defaultUser.value.trim() && !merged.userid) {
        merged.userid = defaultUser.value.trim();
        usedDefaultConfig = true;
    }

    const defaultTemplate = pickDefaultConfig(templateRows);
    if (defaultTemplate && defaultTemplate.value.trim() && !merged.template_id) {
        merged.template_id = defaultTemplate.value.trim();
        usedDefaultConfig = true;
    }

    if (!hasRequiredPushConfig(merged)) {
        throw new Error('缺少完整的推送配置，请先在系统中创建过至少一个带推送配置的任务');
    }

    const dedupMatchedNames = [...new Set(matchedNames)];

    return {
        config: merged,
        targetName: targetName || null,
        matchedNames: dedupMatchedNames,
        matchedTemplateName,
        usedDefaultConfig
    };
}

function sanitizePushConfig(config: unknown): Partial<PushConfig> {
    if (!isRecord(config)) {
        return {};
    }

    const result: Partial<PushConfig> = {};
    if (typeof config.appid === 'string' && config.appid.trim()) {
        result.appid = config.appid.trim();
    }
    if (typeof config.secret === 'string' && config.secret.trim()) {
        result.secret = config.secret.trim();
    }
    if (typeof config.userid === 'string' && config.userid.trim()) {
        result.userid = config.userid.trim();
    }
    if (typeof config.template_id === 'string' && config.template_id.trim()) {
        result.template_id = config.template_id.trim();
    }
    if (typeof config.template_name === 'string' && config.template_name.trim()) {
        result.template_name = config.template_name.trim();
    }
    if (typeof config.base_url === 'string' && config.base_url.trim()) {
        result.base_url = config.base_url.trim();
    }
    if (typeof config.callback_url === 'string' && config.callback_url.trim()) {
        result.callback_url = config.callback_url.trim();
    }
    return result;
}

function hasRequiredPushConfig(config: Partial<PushConfig>): config is PushConfig {
    return Boolean(config.appid && config.secret && config.userid && config.template_id);
}

async function loadLatestPushConfig(env: Env, userKey: string): Promise<Partial<PushConfig>> {
    const rows: Array<{ push_config: string | null }> = [];

    try {
        const latestReminder = await env.DB.prepare(`
            SELECT push_config
            FROM reminders
            WHERE user_key = ? AND push_config IS NOT NULL
            ORDER BY updated_at DESC
            LIMIT 1
        `).bind(userKey).first<{ push_config: string | null }>();
        if (latestReminder?.push_config) {
            rows.push(latestReminder);
        }
    } catch {
        // ignore
    }

    try {
        const latestAccount = await env.DB.prepare(`
            SELECT push_config
            FROM email_accounts
            WHERE user_key = ? AND push_config IS NOT NULL
            ORDER BY updated_at DESC
            LIMIT 1
        `).bind(userKey).first<{ push_config: string | null }>();
        if (latestAccount?.push_config) {
            rows.push(latestAccount);
        }
    } catch {
        // ignore
    }

    try {
        const legacySettings = await env.DB.prepare(`
            SELECT push_config
            FROM user_email_settings
            WHERE user_key = ? AND push_config IS NOT NULL
            ORDER BY updated_at DESC
            LIMIT 1
        `).bind(userKey).first<{ push_config: string | null }>();
        if (legacySettings?.push_config) {
            rows.push(legacySettings);
        }
    } catch {
        // ignore
    }

    for (const row of rows) {
        if (!row.push_config) {
            continue;
        }

        try {
            const parsed = JSON.parse(row.push_config);
            const normalized = sanitizePushConfig(parsed);
            if (Object.keys(normalized).length > 0) {
                return normalized;
            }
        } catch {
            // ignore invalid json
        }
    }

    return {};
}

async function resolvePushConfig(input: unknown, env: Env, userKey: string): Promise<PushConfig> {
    const provided = sanitizePushConfig(input);
    if (hasRequiredPushConfig(provided)) {
        return provided;
    }

    const fallback = await loadLatestPushConfig(env, userKey);
    const merged: Partial<PushConfig> = { ...fallback, ...provided };

    if (!hasRequiredPushConfig(merged)) {
        throw new Error('缺少完整的推送配置，请先在系统中创建过至少一个带推送配置的任务');
    }

    return merged;
}

async function assertReminderOwnership(id: string, env: Env, userKey: string): Promise<void> {
    const result = await env.DB.prepare(`
        SELECT id FROM reminders WHERE id = ? AND user_key = ? LIMIT 1
    `).bind(id, userKey).first<{ id: string }>();

    if (!result) {
        throw new Error('提醒不存在或无权限');
    }
}

export async function queryRemindersExecutor(args: Record<string, any>, env: Env, userKey: string): Promise<any> {
    const limit = toPositiveInt(args.limit, 10, 50);
    const status = typeof args.status === 'string' && REMINDER_STATUS_SET.has(args.status)
        ? args.status
        : undefined;

    const request = new Request(buildInternalUrl('/api/reminders', {
        limit,
        status,
        type: 'reminder'
    }), { method: 'GET' });

    const response = await listReminders(request, env, userKey);
    const data = await unwrapApiResponse<{ total: number; items: Reminder[] }>(response);

    if (!data?.items || typeof args.keyword !== 'string' || !args.keyword.trim()) {
        return data;
    }

    const keyword = args.keyword.trim().toLowerCase();
    const filteredItems = data.items.filter(item =>
        item.title.toLowerCase().includes(keyword) ||
        item.content.toLowerCase().includes(keyword)
    );

    return {
        ...data,
        total: filteredItems.length,
        items: filteredItems
    };
}

export async function createReminderExecutor(args: Record<string, any>, env: Env, userKey: string): Promise<any> {
    const triggeredAt = Date.now();
    let bodyTitle = '';
    try {
        const resolvedPush = await resolvePushConfigWithNamedTarget(args, env, userKey);
        const pushConfig = resolvedPush.config;
        const scheduleType = String(args.schedule_type || '').trim().toLowerCase();

        const body: CreateReminderRequest = {
            title: String(args.title || '').trim(),
            content: String(args.content || '').trim(),
            schedule_type: scheduleType as CreateReminderRequest['schedule_type'],
            push_config: pushConfig,
            type: 'reminder'
        };
        bodyTitle = body.title;

        if (typeof args.schedule_time === 'string') {
            body.schedule_time = args.schedule_time;
        }
        if (typeof args.schedule_cron === 'string') {
            body.schedule_cron = args.schedule_cron;
        }
        if (typeof args.schedule_date === 'string') {
            body.schedule_date = args.schedule_date;
        }
        if (typeof args.schedule_weekday === 'number') {
            body.schedule_weekday = args.schedule_weekday;
        }
        if (typeof args.schedule_day === 'number') {
            body.schedule_day = args.schedule_day;
        }
        if (typeof args.timezone === 'string' && args.timezone.trim()) {
            body.timezone = args.timezone.trim();
        }
        if (typeof args.push_url === 'string') {
            body.push_url = args.push_url;
        }
        if (typeof args.template_name === 'string') {
            body.template_name = args.template_name;
        }
        if (typeof args.ack_required === 'boolean') {
            body.ack_required = args.ack_required;
        }
        if (typeof args.retry_interval === 'number' && Number.isFinite(args.retry_interval)) {
            body.retry_interval = Math.max(1, Math.floor(args.retry_interval));
        }

        const request = createJsonRequest(buildInternalUrl('/api/reminders'), 'POST', body);
        const response = await createReminder(request, env, userKey);
        const data = await unwrapApiResponse(response);

        const reminderId = isRecord(data) && typeof data.id === 'string' ? data.id : null;
        await logAiAction(env, {
            userKey,
            action: 'create_reminder',
            status: 'success',
            triggeredAt,
            reminderId,
            reminderTitle: body.title,
            reminderType: 'reminder',
            response: reminderId ? `智能管家创建任务: ${reminderId}` : '智能管家创建任务'
        });

        if (!isRecord(data)) {
            return data;
        }

        return {
            ...data,
            resolved_target: resolvedPush.targetName,
            matched_configs: resolvedPush.matchedNames,
            matched_template: resolvedPush.matchedTemplateName,
            used_default_config: resolvedPush.usedDefaultConfig
        };
    } catch (error) {
        await logAiAction(env, {
            userKey,
            action: 'create_reminder',
            status: 'failed',
            triggeredAt,
            reminderTitle: bodyTitle || null,
            reminderType: 'reminder',
            error: getErrorMessage(error)
        });
        throw error;
    }
}

export async function sendImmediateMessageExecutor(args: Record<string, any>, env: Env, userKey: string): Promise<any> {
    const triggeredAt = Date.now();
    let title = '提醒';
    let content = '';

    try {
        content = typeof args.content === 'string'
            ? args.content.trim()
            : (typeof args.message === 'string' ? args.message.trim() : '');
        if (!content) {
            throw new Error('缺少消息内容');
        }

        title = typeof args.title === 'string' && args.title.trim()
            ? args.title.trim()
            : '提醒';

        const resolvedPush = await resolvePushConfigWithNamedTarget(args, env, userKey);
        const pushServiceUrl = typeof args.push_url === 'string' && args.push_url.trim()
            ? args.push_url.trim()
            : (env.PUSH_SERVICE_URL || env.DEFAULT_PUSH_URL || env.WORKER_BASE_URL);

        const result = await sendPush(pushServiceUrl, resolvedPush.config, title, content);
        if (!result.success) {
            throw new Error(result.error || '立即发送失败');
        }

        await logAiAction(env, {
            userKey,
            action: 'send_immediate_message',
            status: 'success',
            triggeredAt,
            reminderTitle: title,
            reminderType: 'reminder',
            response: `智能管家立即发送: ${title}`,
            durationMs: result.duration ?? null
        });

        return {
            status: 'sent',
            mode: 'immediate',
            title,
            content,
            target: resolvedPush.targetName,
            matched_configs: resolvedPush.matchedNames,
            matched_template: resolvedPush.matchedTemplateName,
            used_default_config: resolvedPush.usedDefaultConfig,
            duration_ms: result.duration
        };
    } catch (error) {
        await logAiAction(env, {
            userKey,
            action: 'send_immediate_message',
            status: 'failed',
            triggeredAt,
            reminderTitle: title || null,
            reminderType: 'reminder',
            error: getErrorMessage(error)
        });
        throw error;
    }
}

export async function getReminderDetailExecutor(args: Record<string, any>, env: Env, userKey: string): Promise<any> {
    const id = String(args.id || '').trim();
    if (!id) {
        throw new Error('缺少提醒 ID');
    }
    const response = await getReminder(id, env, userKey);
    return unwrapApiResponse(response);
}

export async function updateReminderExecutor(args: Record<string, any>, env: Env, userKey: string): Promise<any> {
    const id = String(args.id || '').trim();
    if (!id) {
        throw new Error('缺少提醒 ID');
    }

    const body: UpdateReminderRequest = {};
    if (typeof args.title === 'string') {
        body.title = args.title;
    }
    if (typeof args.content === 'string') {
        body.content = args.content;
    }
    if (typeof args.status === 'string' && UPDATE_STATUS_SET.has(args.status)) {
        body.status = args.status as UpdateReminderRequest['status'];
    }
    if (typeof args.schedule_type === 'string') {
        body.schedule_type = args.schedule_type as UpdateReminderRequest['schedule_type'];
    }
    if (typeof args.schedule_time === 'string') {
        body.schedule_time = args.schedule_time;
    }
    if (typeof args.schedule_cron === 'string') {
        body.schedule_cron = args.schedule_cron;
    }
    if (typeof args.schedule_date === 'string') {
        body.schedule_date = args.schedule_date;
    }
    if (typeof args.schedule_weekday === 'number') {
        body.schedule_weekday = args.schedule_weekday;
    }
    if (typeof args.schedule_day === 'number') {
        body.schedule_day = args.schedule_day;
    }
    if (typeof args.timezone === 'string') {
        body.timezone = args.timezone;
    }
    if (isRecord(args.push_config)) {
        body.push_config = args.push_config as PushConfig;
    }
    if (typeof args.push_url === 'string') {
        body.push_url = args.push_url;
    }
    if (typeof args.template_name === 'string') {
        body.template_name = args.template_name;
    }
    if (typeof args.ack_required === 'boolean') {
        body.ack_required = args.ack_required;
    }
    if (typeof args.retry_interval === 'number' && Number.isFinite(args.retry_interval)) {
        body.retry_interval = Math.max(1, Math.floor(args.retry_interval));
    }

    const request = createJsonRequest(buildInternalUrl(`/api/reminders/${encodeURIComponent(id)}`), 'PUT', body);
    const response = await updateReminder(id, request, env, userKey);
    return unwrapApiResponse(response);
}

export async function deleteReminderExecutor(args: Record<string, any>, env: Env, userKey: string): Promise<any> {
    const id = String(args.id || '').trim();
    if (!id) {
        throw new Error('缺少提醒 ID');
    }
    const response = await deleteReminder(id, env, userKey);
    return unwrapApiResponse(response);
}

export async function triggerReminderExecutor(args: Record<string, any>, env: Env, userKey: string): Promise<any> {
    const id = String(args.id || '').trim();
    if (!id) {
        throw new Error('缺少提醒 ID');
    }
    const response = await triggerReminder(id, env, userKey);
    return unwrapApiResponse(response);
}

export async function ackReminderExecutor(args: Record<string, any>, env: Env, userKey: string): Promise<any> {
    const id = String(args.id || '').trim();
    if (!id) {
        throw new Error('缺少提醒 ID');
    }

    await assertReminderOwnership(id, env, userKey);
    const action = args.action === 'snooze' ? 'snooze' : 'completed';
    const request = createJsonRequest(
        buildInternalUrl(`/api/reminders/${encodeURIComponent(id)}/ack`),
        'POST',
        { action }
    );

    const response = await ackReminder(id, request, env);
    return unwrapApiResponse(response);
}

export async function getSystemReportExecutor(_: Record<string, any>, env: Env, userKey: string): Promise<any> {
    const totalRemindersResult = await env.DB.prepare(`
        SELECT COUNT(*) AS c FROM reminders WHERE user_key = ? AND type = 'reminder'
    `).bind(userKey).first<{ c: number }>();
    const activeRemindersResult = await env.DB.prepare(`
        SELECT COUNT(*) AS c FROM reminders WHERE user_key = ? AND type = 'reminder' AND status = 'active'
    `).bind(userKey).first<{ c: number }>();

    let recentLogs = await env.DB.prepare(`
        SELECT d.triggered_at, d.status, r.title
        FROM task_exec_detail d
        JOIN reminders r ON d.reminder_id = r.id
        WHERE d.user_key = ? AND d.task_type = 'reminder'
        ORDER BY d.triggered_at DESC
        LIMIT 5
    `).bind(userKey).all<{ triggered_at: number; status: string; title: string }>();

    // 新表尚无数据时，回退到旧 trigger_logs
    if (!recentLogs.results || recentLogs.results.length === 0) {
        recentLogs = await env.DB.prepare(`
            SELECT l.triggered_at, l.status, r.title
            FROM trigger_logs l
            JOIN reminders r ON l.reminder_id = r.id
            WHERE r.user_key = ? AND r.type = 'reminder'
            ORDER BY l.triggered_at DESC
            LIMIT 5
        `).bind(userKey).all<{ triggered_at: number; status: string; title: string }>();
    }

    return {
        stats: {
            total_tasks: totalRemindersResult?.c || 0,
            active_tasks: activeRemindersResult?.c || 0
        },
        recent_execution_logs: (recentLogs.results || []).map(log => ({
            time: formatTimestamp(log.triggered_at),
            title: log.title,
            status: log.status
        }))
    };
}

export async function saveConfigExecutor(args: Record<string, any>, env: Env, userKey: string): Promise<any> {
    const category = String(args.category || '').trim();
    const name = String(args.name || '').trim();
    const value = String(args.value || '').trim();

    if (!category || !name || !value) {
        throw new Error('category、name、value 均不能为空');
    }

    const now = Date.now();
    const existing = await env.DB.prepare(`
        SELECT id FROM saved_configs WHERE user_key = ? AND category = ? AND name = ?
    `).bind(userKey, category, name).first<{ id: number }>();

    if (existing) {
        await env.DB.prepare(`
            UPDATE saved_configs SET value = ?, created_at = ? WHERE id = ?
        `).bind(value, now, existing.id).run();
    } else {
        await env.DB.prepare(`
            INSERT INTO saved_configs (user_key, category, name, value, created_at)
            VALUES (?, ?, ?, ?, ?)
        `).bind(userKey, category, name, value, now).run();
    }

    return {
        success: true,
        category,
        name,
        value,
        updated_at: new Date(now).toISOString()
    };
}

export async function listConfigsExecutor(args: Record<string, any>, env: Env, userKey: string): Promise<any> {
    let query = `
        SELECT category, name, value, created_at
        FROM saved_configs
        WHERE user_key = ?
    `;
    const params: any[] = [userKey];

    if (typeof args.category === 'string' && args.category.trim()) {
        query += ` AND category = ?`;
        params.push(args.category.trim());
    }

    query += ` ORDER BY created_at DESC`;

    const result = await env.DB.prepare(query).bind(...params).all<{
        category: string;
        name: string;
        value: string;
        created_at: number;
    }>();

    return {
        items: (result.results || []).map(item => ({
            ...item,
            created_at: new Date(item.created_at).toISOString()
        }))
    };
}
