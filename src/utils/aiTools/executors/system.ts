import { Env } from '../../../types';
import {
    listNotificationChannels,
    testNotificationChannel
} from '../../../handlers/notificationChannels';
import { formatTimestamp } from '../../../utils/time';
import {
    buildInternalUrl,
    unwrapApiResponse
} from './shared';

function parseNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export async function listNotificationChannelsExecutor(
    _: Record<string, any>,
    env: Env,
    userKey: string
): Promise<any> {
    const request = new Request(buildInternalUrl('/api/notification/channels'), { method: 'GET' });
    const response = await listNotificationChannels(request, env, userKey);
    return unwrapApiResponse(response);
}

export async function testNotificationChannelExecutor(
    args: Record<string, any>,
    env: Env,
    userKey: string
): Promise<any> {
    const id = String(args.id || '').trim();
    if (!id) {
        throw new Error('缺少通知渠道 ID');
    }
    const response = await testNotificationChannel(id, env, userKey);
    return unwrapApiResponse(response);
}

export async function getSystemHealthExecutor(
    _: Record<string, any>,
    env: Env,
    userKey: string
): Promise<any> {
    let dbHealthy = true;
    let dbError: string | null = null;

    try {
        await env.DB.prepare('SELECT 1').first();
    } catch (error: any) {
        dbHealthy = false;
        dbError = error?.message || '数据库连接失败';
    }

    const reminderStats = await env.DB.prepare(`
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
        FROM reminders
        WHERE user_key = ? AND type = 'reminder'
    `).bind(userKey).first<{
        total: number;
        active: number;
        failed: number;
    }>();

    const now = Date.now();
    const windowStart = now - 24 * 60 * 60 * 1000;
    let schedulerStats: {
        last_trigger_at: number | null;
        success_24h: number;
        failed_24h: number;
    } | null = null;

    try {
        const detailStats = await env.DB.prepare(`
            SELECT
                MAX(triggered_at) AS last_trigger_at,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_24h,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_24h
            FROM task_exec_detail
            WHERE user_key = ? AND triggered_at >= ?
        `).bind(userKey, windowStart).first<{
            last_trigger_at: number | null;
            success_24h: number;
            failed_24h: number;
        }>();

        const hasDetailData =
            !!detailStats?.last_trigger_at ||
            Number(detailStats?.success_24h || 0) > 0 ||
            Number(detailStats?.failed_24h || 0) > 0;

        if (hasDetailData) {
            schedulerStats = detailStats;
        }
    } catch {
        schedulerStats = null;
    }

    if (!schedulerStats) {
        schedulerStats = await env.DB.prepare(`
            SELECT
                MAX(t.triggered_at) AS last_trigger_at,
                SUM(CASE WHEN t.status = 'success' THEN 1 ELSE 0 END) AS success_24h,
                SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END) AS failed_24h
            FROM trigger_logs t
            JOIN reminders r ON t.reminder_id = r.id
            WHERE r.user_key = ? AND t.triggered_at >= ?
        `).bind(userKey, windowStart).first<{
            last_trigger_at: number | null;
            success_24h: number;
            failed_24h: number;
        }>();
    }

    const emailSyncStats = await env.DB.prepare(`
        SELECT
            COUNT(*) AS total_accounts,
            SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) AS enabled_accounts,
            SUM(CASE WHEN sync_status = 'error' THEN 1 ELSE 0 END) AS error_accounts,
            MAX(last_sync_at) AS last_sync_at
        FROM email_accounts
        WHERE user_key = ?
    `).bind(userKey).first<{
        total_accounts: number;
        enabled_accounts: number;
        error_accounts: number;
        last_sync_at: number | null;
    }>();

    let aiQueueStats: Array<{ status: string; count: number }> = [];
    try {
        const aiQueueResult = await env.DB.prepare(`
            SELECT aq.status, COUNT(*) AS count
            FROM ai_processing_queue aq
            JOIN fetched_emails fe ON aq.email_id = fe.id
            JOIN email_accounts ea ON fe.account_id = ea.id
            WHERE ea.user_key = ?
            GROUP BY aq.status
        `).bind(userKey).all<{ status: string; count: number }>();
        aiQueueStats = aiQueueResult.results || [];
    } catch {
        aiQueueStats = [];
    }

    const success24h = parseNumber(schedulerStats?.success_24h);
    const failed24h = parseNumber(schedulerStats?.failed_24h);

    return {
        checked_at: new Date(now).toISOString(),
        database: {
            healthy: dbHealthy,
            error: dbError
        },
        reminders: {
            total: parseNumber(reminderStats?.total),
            active: parseNumber(reminderStats?.active),
            failed: parseNumber(reminderStats?.failed)
        },
        scheduler: {
            last_trigger_at: formatTimestamp(schedulerStats?.last_trigger_at || null),
            success_24h: success24h,
            failed_24h: failed24h,
            healthy: dbHealthy && failed24h <= success24h + 3
        },
        email_sync: {
            total_accounts: parseNumber(emailSyncStats?.total_accounts),
            enabled_accounts: parseNumber(emailSyncStats?.enabled_accounts),
            error_accounts: parseNumber(emailSyncStats?.error_accounts),
            last_sync_at: formatTimestamp(emailSyncStats?.last_sync_at || null)
        },
        ai_queue: aiQueueStats
    };
}

export async function updateGlobalSettingsExecutor(
    args: Record<string, any>,
    env: Env,
    userKey: string
): Promise<any> {
    const key = String(args.key || '').trim();
    if (!key) {
        throw new Error('缺少设置键名');
    }

    const rawValue = args.value;
    const now = Date.now();
    const value = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
    let retryInterval: number | null = null;
    let timezone: string | null = null;

    if (key === 'default_retry_interval') {
        const parsed = Number(rawValue);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new Error('default_retry_interval 需要是正整数');
        }
        retryInterval = Math.floor(parsed);
    }

    if (key === 'default_timezone' || key === 'timezone') {
        if (typeof rawValue !== 'string' || !rawValue.trim()) {
            throw new Error('default_timezone 需要是非空字符串');
        }
        timezone = rawValue.trim();
    }

    const existing = await env.DB.prepare(`
        SELECT id
        FROM saved_configs
        WHERE user_key = ? AND category = 'global_settings' AND name = ?
        LIMIT 1
    `).bind(userKey, key).first<{ id: number }>();

    if (existing) {
        await env.DB.prepare(`
            UPDATE saved_configs
            SET value = ?, created_at = ?
            WHERE id = ?
        `).bind(value, now, existing.id).run();
    } else {
        await env.DB.prepare(`
            INSERT INTO saved_configs (user_key, category, name, value, created_at)
            VALUES (?, 'global_settings', ?, ?, ?)
        `).bind(userKey, key, value, now).run();
    }

    const sideEffects: string[] = [];

    if (retryInterval !== null) {
        await env.DB.prepare(`
            UPDATE reminders
            SET retry_interval = ?, updated_at = ?
            WHERE user_key = ? AND type = 'reminder'
        `).bind(retryInterval, now, userKey).run();
        sideEffects.push('已批量更新现有提醒的重试间隔');
    }

    if (timezone !== null) {
        await env.DB.prepare(`
            UPDATE reminders
            SET timezone = ?, updated_at = ?
            WHERE user_key = ? AND type = 'reminder'
        `).bind(timezone, now, userKey).run();
        sideEffects.push('已批量更新现有提醒的时区（触发时间将在后续执行时按新时区计算）');
    }

    return {
        key,
        value: rawValue,
        updated_at: new Date(now).toISOString(),
        side_effects: sideEffects
    };
}
