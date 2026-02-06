/**
 * 统计信息处理
 * @author zhangws
 */

import { Env } from '../types';
import { success, error } from '../utils/response';

/**
 * 获取邮件转发趋势（近7天）
 */
export async function getEmailTrend(env: Env, userKey: string): Promise<Response> {
    try {
        const now = Date.now();
        const SHANGHAI_OFFSET = 28800000; // 8小时 UTC+8
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;

        // 计算上海时间的本日 00:00
        const todayStart = now - ((now + SHANGHAI_OFFSET) % ONE_DAY_MS);
        // 统计范围：今天 + 过去6天 = 7天
        const weekStart = todayStart - 6 * ONE_DAY_MS;

        // 1. 统计每天成功转发的邮件数量 (从 email_forward_logs)
        const forwardLogsResult = await env.DB.prepare(`
            SELECT 
                date((processed_at + ?) / 1000, 'unixepoch') as day,
                COUNT(*) as count
            FROM email_forward_logs
            WHERE user_key = ? 
              AND status = 'success'
              AND processed_at >= ?
            GROUP BY day
            ORDER BY day ASC
        `).bind(SHANGHAI_OFFSET, userKey, weekStart).all<{ day: string; count: number }>();

        // 2. 统计每天同步任务执行次数 (从 trigger_logs 关联到 email_sync 类型的任务)
        //由于 trigger_logs 只有 reminder_id，我们需要先找出该用户所有的 email_sync 类型的 reminder_id
        const syncTaskIdsResult = await env.DB.prepare(`
            SELECT id FROM reminders 
            WHERE user_key = ? AND type = 'email_sync'
        `).bind(userKey).all<{ id: string }>();
        const syncTaskIds = (syncTaskIdsResult.results || []).map(r => r.id);

        let syncStatsMap = new Map<string, number>();

        if (syncTaskIds.length > 0) {
            const placeholders = syncTaskIds.map(() => '?').join(',');
            const syncLogsResult = await env.DB.prepare(`
                SELECT 
                    date((triggered_at + ?) / 1000, 'unixepoch') as day,
                    COUNT(*) as count
                FROM trigger_logs
                WHERE reminder_id IN (${placeholders})
                  AND status = 'success'
                  AND triggered_at >= ?
                GROUP BY day
            `).bind(SHANGHAI_OFFSET, ...syncTaskIds, weekStart).all<{ day: string; count: number }>();

            (syncLogsResult.results || []).forEach(r => syncStatsMap.set(r.day, r.count));
        }

        // 3. 合并数据
        const forwardStatsMap = new Map<string, number>();
        (forwardLogsResult.results || []).forEach(r => forwardStatsMap.set(r.day, r.count));

        const dailyStats: { day: string; forwarded: number; synced: number }[] = [];

        // 生成过去7天的时间序列
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart + i * ONE_DAY_MS + SHANGHAI_OFFSET);
            const dayStr = d.toISOString().split('T')[0];

            dailyStats.push({
                day: dayStr,
                forwarded: forwardStatsMap.get(dayStr) || 0,
                synced: syncStatsMap.get(dayStr) || 0
            });
        }

        return success(dailyStats);
    } catch (e) {
        console.error('[Stats] 获取邮件趋势失败:', e);
        return error('获取邮件趋势失败', 500);
    }
}
