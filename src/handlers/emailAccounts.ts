/**
 * 邮箱账户管理 API Handler
 * @author zhangws
 */

import { Env, EmailAccount, ForwardRules, AiFilterConfig } from '../types';
import { error, success } from '../utils/response';
import { encryptPassword } from '../utils/crypto';
import { hasAiProfileForUser } from '../services/aiConfigResolver';

interface EmailAccountUpsertPayload {
    name?: string;
    email?: string;
    username?: string;
    password?: string;
    use_ssl?: boolean;
    ai_spam_filter?: boolean;

    imap_host?: string;
    imap_port?: number;
    imap_user?: string;
    imap_password?: string;
    imap_tls?: boolean;

    push_config?: unknown;
    push_url?: string | null;
    template_name?: string | null;
    filter_rules?: ForwardRules;
    poll_interval?: number;
    enable_ai_spam_filter?: boolean;
    auto_push?: boolean;
    enabled?: boolean;
    ai_profile_id?: string | null;
    ai_filter_config?: AiFilterConfig | string | null;
    ai_ads_keep_importance_threshold?: number | string | null;

    // 兼容旧参数
    push_user_id?: string;
    push_template_id?: string;
    push_appid?: string;
    push_secret?: string;
}

function pickTrimmedString(...values: Array<unknown>): string {
    for (const value of values) {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed) {
                return trimmed;
            }
        }
    }
    return '';
}

function parsePushConfigObject(raw: unknown): Record<string, unknown> | null {
    if (!raw) {
        return null;
    }

    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
            return null;
        } catch {
            return null;
        }
    }

    if (typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }

    return null;
}

function normalizePushConfig(
    seed: unknown,
    body: Pick<EmailAccountUpsertPayload, 'push_appid' | 'push_secret' | 'push_user_id' | 'push_template_id'>
): Record<string, unknown> | null {
    const base = parsePushConfigObject(seed) || {};

    const appid = body.push_appid !== undefined
        ? body.push_appid.trim()
        : (typeof base.appid === 'string' ? base.appid.trim() : '');
    const secret = body.push_secret !== undefined
        ? body.push_secret.trim()
        : (typeof base.secret === 'string' ? base.secret.trim() : '');
    const userid = body.push_user_id !== undefined
        ? body.push_user_id.trim()
        : (typeof base.userid === 'string' ? base.userid.trim() : '');
    const templateId = body.push_template_id !== undefined
        ? body.push_template_id.trim()
        : (typeof base.template_id === 'string' ? base.template_id.trim() : '');

    if (!appid && !secret && !userid && !templateId) {
        return null;
    }

    return {
        ...base,
        appid,
        secret,
        userid,
        template_id: templateId,
    };
}

function normalizePollInterval(pollInterval?: number): number {
    if (!Number.isFinite(pollInterval)) {
        return 10;
    }

    const minutes = Math.floor(pollInterval as number);
    if (minutes < 1) {
        return 1;
    }
    if (minutes > 59) {
        return 59;
    }
    return minutes;
}

const DEFAULT_ADS_KEEP_IMPORTANCE_THRESHOLD = 0.75;

function parseAiFilterConfigObject(raw: unknown): Record<string, unknown> | null {
    if (raw === null || raw === undefined) {
        return null;
    }

    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
            return null;
        } catch {
            return null;
        }
    }

    if (typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }

    return null;
}

function normalizeThreshold(raw: unknown, fallback: number): number {
    const numeric = typeof raw === 'number'
        ? raw
        : (typeof raw === 'string' ? Number.parseFloat(raw) : Number.NaN);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.min(1, Math.max(0, numeric));
}

function normalizeAiFilterConfig(seed: unknown, explicitThreshold?: unknown): AiFilterConfig {
    const parsed = parseAiFilterConfigObject(seed);
    const seedThreshold = parsed?.ads_keep_importance_threshold;
    const threshold = normalizeThreshold(
        explicitThreshold !== undefined ? explicitThreshold : seedThreshold,
        DEFAULT_ADS_KEEP_IMPORTANCE_THRESHOLD
    );

    return {
        ads_keep_importance_threshold: threshold,
    };
}

/**
 * 生成唯一账户ID
 */
function generateAccountId(): string {
    return 'eml_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * 获取所有邮箱账户
 */
export async function getEmailAccounts(env: Env, userKey: string): Promise<Response> {
    try {
        const result = await env.DB.prepare(`
            SELECT id, name, imap_host, imap_port, imap_user, imap_tls,
                   push_config, push_url, template_name, filter_rules,
                   enabled, last_sync_at, sync_status, sync_error,
                   total_synced, total_forwarded, created_at, updated_at,
                   auto_push, enable_ai_spam_filter, ai_profile_id, ai_filter_config,
                   COALESCE((
                       SELECT COUNT(1)
                       FROM fetched_emails fe
                       WHERE fe.account_id = email_accounts.id
                   ), 0) AS cached_email_count,
                   COALESCE((
                       SELECT SUM(CASE WHEN fe.push_status = 'failed' THEN 1 ELSE 0 END)
                       FROM fetched_emails fe
                       WHERE fe.account_id = email_accounts.id
                   ), 0) AS failed_email_count,
                   COALESCE((
                       SELECT SUM(CASE WHEN fe.push_status = 'pending' THEN 1 ELSE 0 END)
                       FROM fetched_emails fe
                       WHERE fe.account_id = email_accounts.id
                   ), 0) AS pending_email_count
            FROM email_accounts
            WHERE user_key = ?
            ORDER BY created_at DESC
        `).bind(userKey).all<EmailAccount>();

        // 不返回密码字段
        const accounts = result.results || [];

        return success(accounts);
    } catch (e) {
        console.error('[EmailAccounts] 获取账户列表失败:', e);
        return error('获取账户列表失败', 1, 500);
    }
}

/**
 * 获取单个邮箱账户
 */
export async function getEmailAccount(env: Env, accountId: string, userKey: string): Promise<Response> {
    try {
        const account = await env.DB.prepare(`
            SELECT id, name, imap_host, imap_port, imap_user, imap_tls,
                   push_config, push_url, template_name, filter_rules,
                   enabled, last_sync_at, sync_status, sync_error,
                   total_synced, total_forwarded, created_at, updated_at,
                   auto_push, enable_ai_spam_filter, ai_profile_id, ai_filter_config,
                   COALESCE((
                       SELECT COUNT(1)
                       FROM fetched_emails fe
                       WHERE fe.account_id = email_accounts.id
                   ), 0) AS cached_email_count,
                   COALESCE((
                       SELECT SUM(CASE WHEN fe.push_status = 'failed' THEN 1 ELSE 0 END)
                       FROM fetched_emails fe
                       WHERE fe.account_id = email_accounts.id
                   ), 0) AS failed_email_count,
                   COALESCE((
                       SELECT SUM(CASE WHEN fe.push_status = 'pending' THEN 1 ELSE 0 END)
                       FROM fetched_emails fe
                       WHERE fe.account_id = email_accounts.id
                   ), 0) AS pending_email_count
            FROM email_accounts
            WHERE id = ? AND user_key = ?
        `).bind(accountId, userKey).first<EmailAccount>();

        if (!account) {
            return error('账户不存在', 1, 404);
        }

        return success(account);
    } catch (e) {
        console.error('[EmailAccounts] 获取账户失败:', e);
        return error('获取账户失败', 1, 500);
    }
}

/**
 * 创建邮箱账户
 */
export async function createEmailAccount(
    env: Env,
    userKey: string,
    body: EmailAccountUpsertPayload
): Promise<Response> {
    try {
        const accountId = generateAccountId();
        const now = Date.now();
        const name = (body.name || '').trim();
        const imapHost = (body.imap_host || '').trim();
        const imapUser = pickTrimmedString(body.imap_user, body.username, body.email);
        const imapPassword = pickTrimmedString(body.imap_password, body.password);
        const imapPort = Number.isFinite(body.imap_port) && (body.imap_port as number) > 0
            ? Math.floor(body.imap_port as number)
            : 993;
        const imapTls = body.imap_tls ?? body.use_ssl ?? true;
        const enabled = body.enabled !== false;
        const autoPush = body.auto_push !== false;
        const enableAiSpamFilter = (body.enable_ai_spam_filter ?? body.ai_spam_filter) === true;
        const pushConfig = normalizePushConfig(body.push_config, body);
        const pushConfigJson = pushConfig ? JSON.stringify(pushConfig) : null;
        const filterRulesJson = body.filter_rules ? JSON.stringify(body.filter_rules) : null;
        const pushUrl = typeof body.push_url === 'string' ? body.push_url.trim() : '';
        const templateName = typeof body.template_name === 'string' ? body.template_name.trim() : '';
        const aiProfileId = typeof body.ai_profile_id === 'string' ? body.ai_profile_id.trim() : '';
        const aiFilterConfig = normalizeAiFilterConfig(body.ai_filter_config, body.ai_ads_keep_importance_threshold);
        const aiFilterConfigJson = JSON.stringify(aiFilterConfig);
        const pollMinutes = normalizePollInterval(body.poll_interval);
        const cronExpr = `*/${pollMinutes} * * * *`;
        const nextTriggerAt = now + pollMinutes * 60 * 1000;

        if (!name) {
            return error('账户名称不能为空', 1, 400);
        }
        if (!imapHost) {
            return error('IMAP 服务器地址不能为空', 1, 400);
        }
        if (!imapUser) {
            return error('IMAP 用户名不能为空', 1, 400);
        }
        if (!imapPassword) {
            return error('IMAP 密码不能为空', 1, 400);
        }
        if (aiProfileId) {
            const exists = await hasAiProfileForUser(env, userKey, aiProfileId);
            if (!exists) {
                return error('绑定的 AI 模型不存在或不属于当前用户', 1, 400);
            }
        }

        // 加密密码
        const encryptedPassword = await encryptPassword(
            imapPassword,
            env.ENCRYPTION_KEY || 'default-key'
        );

        // 插入账户
        await env.DB.prepare(`
            INSERT INTO email_accounts (
                id, user_key, name,
                imap_host, imap_port, imap_user, imap_password, imap_tls,
                push_config, push_url, template_name, filter_rules,
                enabled, sync_status, created_at, updated_at, enable_ai_spam_filter, auto_push, ai_profile_id, ai_filter_config
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'idle', ?, ?, ?, ?, ?, ?)
        `).bind(
            accountId,
            userKey,
            name,
            imapHost,
            imapPort,
            imapUser,
            encryptedPassword,
            imapTls ? 1 : 0,
            pushConfigJson,
            pushUrl || null,
            templateName || null,
            filterRulesJson,
            enabled ? 1 : 0,
            now,
            now,
            enableAiSpamFilter ? 1 : 0,
            autoPush ? 1 : 0,
            aiProfileId || null,
            aiFilterConfigJson
        ).run();

        // 创建对应的定时任务（默认每 10 分钟）
        const reminderId = 'rem_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

        await env.DB.prepare(`
            INSERT INTO reminders (
                id, user_key, title, content,
                schedule_type, schedule_cron, timezone,
                push_config, status, type, related_id,
                next_trigger_at, trigger_count,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'cron', ?, 'Asia/Shanghai', '{}', ?, 'email_sync', ?, ?, 0, ?, ?)
        `).bind(
            reminderId,
            userKey,
            `📧 邮箱同步: ${name}`,
            `自动同步 ${imapUser}`,
            cronExpr,
            enabled ? 'active' : 'paused',
            accountId,
            nextTriggerAt,
            now,
            now
        ).run();

        return success({ id: accountId, reminder_id: reminderId }, '账户创建成功');
    } catch (e) {
        console.error('[EmailAccounts] 创建账户失败:', e);
        return error('创建账户失败: ' + (e instanceof Error ? e.message : '未知错误'), 1, 500);
    }
}

/**
 * 更新邮箱账户
 */
export async function updateEmailAccount(
    env: Env,
    userKey: string,
    accountId: string,
    body: EmailAccountUpsertPayload
): Promise<Response> {
    try {
        const now = Date.now();
        const existing = await env.DB.prepare(`
            SELECT id, push_config, ai_filter_config FROM email_accounts WHERE id = ? AND user_key = ?
        `).bind(accountId, userKey).first<{ id: string; push_config: string | null; ai_filter_config: string | null }>();

        if (!existing) {
            return error('账户不存在', 1, 404);
        }

        // 构建动态 UPDATE
        const updates: string[] = [];
        const values: unknown[] = [];

        if (body.name !== undefined) {
            updates.push('name = ?');
            values.push(body.name.trim());
        }
        if (body.imap_host !== undefined) {
            updates.push('imap_host = ?');
            values.push(body.imap_host.trim());
        }
        if (body.imap_port !== undefined) {
            updates.push('imap_port = ?');
            const safePort = Number.isFinite(body.imap_port) && (body.imap_port as number) > 0
                ? Math.floor(body.imap_port as number)
                : 993;
            values.push(safePort);
        }
        if (body.imap_user !== undefined || body.username !== undefined || body.email !== undefined) {
            const imapUser = pickTrimmedString(body.imap_user, body.username, body.email);
            updates.push('imap_user = ?');
            values.push(imapUser);
        }
        if (body.imap_password !== undefined || body.password !== undefined) {
            const plainPassword = pickTrimmedString(body.imap_password, body.password);
            if (!plainPassword) {
                return error('IMAP 密码不能为空', 1, 400);
            }
            const encrypted = await encryptPassword(
                plainPassword,
                env.ENCRYPTION_KEY || 'default-key'
            );
            updates.push('imap_password = ?');
            values.push(encrypted);
        }
        if (body.imap_tls !== undefined || body.use_ssl !== undefined) {
            const imapTls = body.imap_tls ?? body.use_ssl ?? true;
            updates.push('imap_tls = ?');
            values.push(imapTls ? 1 : 0);
        }
        const hasPushConfigInput = body.push_config !== undefined
            || body.push_user_id !== undefined
            || body.push_template_id !== undefined
            || body.push_appid !== undefined
            || body.push_secret !== undefined;
        if (hasPushConfigInput) {
            const seed = body.push_config !== undefined ? body.push_config : existing.push_config;
            const mergedPushConfig = normalizePushConfig(seed, body);
            updates.push('push_config = ?');
            values.push(mergedPushConfig ? JSON.stringify(mergedPushConfig) : null);
        }
        if (body.push_url !== undefined) {
            updates.push('push_url = ?');
            values.push(body.push_url?.trim() || null);
        }
        if (body.template_name !== undefined) {
            updates.push('template_name = ?');
            values.push(body.template_name?.trim() || null);
        }
        if (body.filter_rules !== undefined) {
            updates.push('filter_rules = ?');
            values.push(JSON.stringify(body.filter_rules));
        }
        if (body.enabled !== undefined) {
            updates.push('enabled = ?');
            values.push(body.enabled ? 1 : 0);
        }
        if (body.enable_ai_spam_filter !== undefined || body.ai_spam_filter !== undefined) {
            const enableAiSpamFilter = body.enable_ai_spam_filter ?? body.ai_spam_filter ?? false;
            updates.push('enable_ai_spam_filter = ?');
            values.push(enableAiSpamFilter ? 1 : 0);
        }
        if (body.auto_push !== undefined) {
            updates.push('auto_push = ?');
            values.push(body.auto_push ? 1 : 0);
        }
        if (body.ai_profile_id !== undefined) {
            const aiProfileId = typeof body.ai_profile_id === 'string' ? body.ai_profile_id.trim() : '';
            if (aiProfileId) {
                const exists = await hasAiProfileForUser(env, userKey, aiProfileId);
                if (!exists) {
                    return error('绑定的 AI 模型不存在或不属于当前用户', 1, 400);
                }
            }
            updates.push('ai_profile_id = ?');
            values.push(aiProfileId || null);
        }
        if (body.ai_filter_config !== undefined || body.ai_ads_keep_importance_threshold !== undefined) {
            if (body.ai_filter_config === null) {
                updates.push('ai_filter_config = ?');
                values.push(null);
            } else {
                const seed = body.ai_filter_config !== undefined ? body.ai_filter_config : existing.ai_filter_config;
                const normalizedConfig = normalizeAiFilterConfig(seed, body.ai_ads_keep_importance_threshold);
                updates.push('ai_filter_config = ?');
                values.push(JSON.stringify(normalizedConfig));
            }
        }

        updates.push('updated_at = ?');
        values.push(now);
        values.push(accountId);
        values.push(userKey);

        if (updates.length === 1) {
            return error('没有需要更新的字段', 1, 400);
        }

        const updateResult = await env.DB.prepare(`
            UPDATE email_accounts SET ${updates.join(', ')} WHERE id = ? AND user_key = ?
        `).bind(...values).run();

        if (updateResult.meta.changes === 0) {
            return error('账户不存在', 1, 404);
        }

        // 如果修改了轮询间隔，同步更新 reminders 表
        if (body.poll_interval !== undefined) {
            const pollMinutes = normalizePollInterval(body.poll_interval);
            const cronExpr = `*/${pollMinutes} * * * *`;
            const nextTriggerAt = now + pollMinutes * 60 * 1000;
            await env.DB.prepare(`
                UPDATE reminders SET schedule_cron = ?, next_trigger_at = ?, updated_at = ?
                WHERE type = 'email_sync' AND related_id = ? AND user_key = ?
            `).bind(cronExpr, nextTriggerAt, now, accountId, userKey).run();
        }

        // 如果启用/禁用账户，同步更新任务状态
        if (body.enabled !== undefined) {
            const taskStatus = body.enabled ? 'active' : 'paused';
            await env.DB.prepare(`
                UPDATE reminders 
                SET status = ?, 
                    next_trigger_at = CASE 
                        WHEN ? = 'active' THEN COALESCE(next_trigger_at, ?)
                        ELSE next_trigger_at
                    END,
                    updated_at = ?
                WHERE type = 'email_sync' AND related_id = ? AND user_key = ?
            `).bind(taskStatus, taskStatus, now + 60000, now, accountId, userKey).run();
        }

        return success(null, '账户更新成功');
    } catch (e) {
        console.error('[EmailAccounts] 更新账户失败:', e);
        return error('更新账户失败', 1, 500);
    }
}

/**
 * 删除邮箱账户
 */
export async function deleteEmailAccount(env: Env, accountId: string, userKey: string): Promise<Response> {
    try {
        // 先删除关联的定时任务
        await env.DB.prepare(`
            DELETE FROM reminders WHERE type = 'email_sync' AND related_id = ? AND user_key = ?
        `).bind(accountId, userKey).run();

        // 再删除账户
        const result = await env.DB.prepare(`
            DELETE FROM email_accounts WHERE id = ? AND user_key = ?
        `).bind(accountId, userKey).run();

        if (result.meta.changes === 0) {
            return error('账户不存在', 1, 404);
        }

        return success(null, '账户已删除');
    } catch (e) {
        console.error('[EmailAccounts] 删除账户失败:', e);
        return error('删除账户失败', 1, 500);
    }
}

/**
 * 立即同步邮箱
 */
export async function syncEmailAccountNow(env: Env, accountId: string, userKey: string): Promise<Response> {
    try {
        // 检查账户是否存在
        const account = await env.DB.prepare(`
            SELECT * FROM email_accounts WHERE id = ? AND user_key = ?
        `).bind(accountId, userKey).first<EmailAccount>();

        if (!account) {
            return error('账户不存在', 1, 404);
        }

        // 检查是否正在同步
        if (account.sync_status === 'syncing') {
            return error('该账户正在同步中，请稍后再试', 1, 409);
        }

        // 直接执行同步（syncEmailAccount 内部会处理状态更新）
        const { syncEmailAccount } = await import('../services/imapPoller');
        const result = await syncEmailAccount(env, accountId);

        if (result.success) {
            // 手动同步后优先消费一小批 AI 摘要任务，提高“点开即看”概率
            if (result.emailsFound > 0) {
                try {
                    const { processAIQueue } = await import('./emailAiSummary');
                    await processAIQueue(env, Math.min(result.emailsFound, 6));
                } catch (queueError) {
                    console.warn('[EmailAccounts] 手动同步后处理AI队列失败:', queueError);
                }
            }

            return success({
                account_id: accountId,
                status: 'idle',
                emails_found: result.emailsFound,
                emails_forwarded: result.emailsForwarded,
                duration: result.duration
            }, `同步完成：发现 ${result.emailsFound} 封邮件，转发 ${result.emailsForwarded} 封`);
        } else {
            return error(`同步失败: ${result.error}`, -1);
        }
    } catch (e) {
        console.error('[EmailAccounts] 同步失败:', e);
        return error('同步失败: ' + (e instanceof Error ? e.message : '未知错误'), 1, 500);
    }
}

/**
 * 测试邮箱连接
 */
export async function testEmailConnection(
    env: Env,
    body: {
        imap_host: string;
        imap_port?: number;
        imap_user: string;
        imap_password: string;
        imap_tls?: boolean;
    }
): Promise<Response> {
    try {
        const { imap_host, imap_port, imap_user, imap_password, imap_tls } = body;

        // 基础验证
        if (!imap_host || !imap_user || !imap_password) {
            return error('缺少必要的连接参数', 1, 400);
        }

        // 使用 ImapClient 进行真实连接测试
        const { ImapClient } = await import('../services/ImapClient');

        const client = new ImapClient({
            host: imap_host,
            port: imap_port || 993,
            user: imap_user,
            password: imap_password,
            tls: imap_tls !== false
        });

        try {
            // 尝试连接
            await client.connect();
            // 尝试登录
            await client.login();
            // 尝试选择收件箱
            const inbox = await client.selectInbox();
            // 正常登出
            await client.logout();

            return success({
                host: imap_host,
                port: imap_port || 993,
                user: imap_user,
                connected: true,
                inbox_count: inbox.exists
            }, '连接测试成功');
        } catch (imapError) {
            // 确保关闭连接
            try { await client.close(); } catch { }

            const errorMsg = imapError instanceof Error ? imapError.message : '连接失败';
            return error(`连接失败: ${errorMsg}`, -1);
        }
    } catch (e) {
        console.error('[EmailAccounts] 连接测试失败:', e);
        return error('连接测试失败: ' + (e instanceof Error ? e.message : '未知错误'), 1, 500);
    }
}
