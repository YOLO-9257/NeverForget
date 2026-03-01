/**
 * Phase 2.1: 同步监控系统 - 后端API
 */

import { Env, SyncStatistics, SyncLog, SyncStatusSnapshot } from '../types';
import { success, badRequest, notFound, serverError } from '../utils/response';

export async function getSyncDashboard(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const url = new URL(request.url);
        const accountId = url.searchParams.get('account_id');

        if (!accountId) {
            return badRequest('缺少必要参数: account_id');
        }

        // 验证账户所有权
        const account = await env.DB.prepare(`
            SELECT * FROM email_accounts WHERE id = ? AND user_key = ?
        `).bind(accountId, userKey).first();

        if (!account) {
            return notFound('账户不存在');
        }

        // 获取当前状态快照
        const snapshot = await env.DB.prepare(`
            SELECT * FROM sync_status_snapshot WHERE account_id = ?
        `).bind(accountId).first<SyncStatusSnapshot>();

        // 获取最近7天统计
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const dateStr = sevenDaysAgo.toISOString().split('T')[0];

        const stats = await env.DB.prepare(`
            SELECT * FROM sync_statistics 
            WHERE account_id = ? AND date >= ?
            ORDER BY date ASC
        `).bind(accountId, dateStr).all<SyncStatistics>();

        // 获取最近日志
        const recentLogs = await env.DB.prepare(`
            SELECT * FROM sync_logs 
            WHERE account_id = ? 
            ORDER BY started_at DESC 
            LIMIT 10
        `).bind(accountId).all<SyncLog>();

        return success({
            current_status: snapshot || {
                account_id: accountId,
                current_status: 'idle',
                consecutive_failures: 0,
                updated_at: Date.now(),
            },
            stats_7d: stats.results || [],
            recent_logs: recentLogs.results || [],
        });
    } catch (error) {
        console.error('获取同步仪表盘失败:', error);
        return serverError('获取同步仪表盘失败');
    }
}

export async function getSyncLogs(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const url = new URL(request.url);
        const accountId = url.searchParams.get('account_id');
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const status = url.searchParams.get('status');

        if (!accountId) {
            return badRequest('缺少必要参数: account_id');
        }

        // 验证账户所有权
        const account = await env.DB.prepare(`
            SELECT id FROM email_accounts WHERE id = ? AND user_key = ?
        `).bind(accountId, userKey).first();

        if (!account) {
            return notFound('账户不存在');
        }

        let query = `SELECT * FROM sync_logs WHERE account_id = ?`;
        const params: any[] = [accountId];

        if (status) {
            query += ` AND status = ?`;
            params.push(status);
        }

        query += ` ORDER BY started_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const result = await env.DB.prepare(query).bind(...params).all<SyncLog>();

        // 查询总数
        let countQuery = `SELECT COUNT(*) as total FROM sync_logs WHERE account_id = ?`;
        const countParams: any[] = [accountId];
        if (status) {
            countQuery += ` AND status = ?`;
            countParams.push(status);
        }
        const countResult = await env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>();

        return success({
            items: result.results || [],
            total: countResult?.total || 0,
            limit,
            offset,
        });
    } catch (error) {
        console.error('获取同步日志失败:', error);
        return serverError('获取同步日志失败');
    }
}

export async function getSyncStatistics(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const url = new URL(request.url);
        const accountId = url.searchParams.get('account_id');
        const days = parseInt(url.searchParams.get('days') || '30');

        if (!accountId) {
            return badRequest('缺少必要参数: account_id');
        }

        // 验证账户所有权
        const account = await env.DB.prepare(`
            SELECT id FROM email_accounts WHERE id = ? AND user_key = ?
        `).bind(accountId, userKey).first();

        if (!account) {
            return notFound('账户不存在');
        }

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const dateStr = startDate.toISOString().split('T')[0];

        const result = await env.DB.prepare(`
            SELECT * FROM sync_statistics 
            WHERE account_id = ? AND date >= ?
            ORDER BY date ASC
        `).bind(accountId, dateStr).all<SyncStatistics>();

        // 计算汇总数据
        const summary = (result.results || []).reduce((acc, stat) => ({
            total_attempts: acc.total_attempts + stat.total_attempts,
            success_count: acc.success_count + stat.success_count,
            fail_count: acc.fail_count + stat.fail_count,
            emails_synced: acc.emails_synced + stat.emails_synced,
        }), { total_attempts: 0, success_count: 0, fail_count: 0, emails_synced: 0 });

        return success({
            items: result.results || [],
            summary,
            success_rate: summary.total_attempts > 0 
                ? (summary.success_count / summary.total_attempts * 100).toFixed(2) + '%'
                : '0%',
        });
    } catch (error) {
        console.error('获取同步统计失败:', error);
        return serverError('获取同步统计失败');
    }
}
