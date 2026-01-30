/**
 * 分布式低成本定时提醒系统 - Cloudflare Workers 入口
 * 
 * 功能：
 * - REST API：提醒任务的 CRUD 操作
 * - Cron Trigger：每分钟检查并执行到期任务
 */

import { Env } from './types';
import { success, badRequest, notFound, options, serverError } from './utils/response';
import { authMiddleware } from './utils/auth';
import { handleCron } from './handlers/cron';
import {
    createReminder,
    listReminders,
    getReminder,
    updateReminder,
    deleteReminder,
    getReminderLogs,
    triggerReminder,
    ackReminder,
} from './handlers/reminders';
import { DETAIL_HTML } from './handlers/html';
import { handlePublicPush } from './services/pusher';

export default {
    /**
     * HTTP 请求处理
     */
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // 处理 CORS 预检请求
        if (method === 'OPTIONS') {
            return options();
        }

        // 健康检查（无需认证）
        if (path === '/' || path === '/health') {
            return success({
                status: 'ok',
                service: 'never-forget',
                version: '1.0.0',
                timestamp: new Date().toISOString(),
            });
        }

        // 消息详情页（无需认证）
        if (path === '/detail' && method === 'GET') {
            return new Response(DETAIL_HTML, {
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                },
            });
        }

        // 自定义详情页功能已移交给 go-wxpush 服务
        // never-forget 仅通过 template_name 引用 go-wxpush 中的模板

        // 公共推送接口 (兼容 go-wxpush)
        if (path === '/wxsend') {
            return handlePublicPush(request, env);
        }

        // 提醒确认回调 (无需认证)
        const ackMatch = path.match(/^\/api\/reminders\/([^\/]+)\/ack$/);
        if (ackMatch && method === 'POST') {
            return ackReminder(ackMatch[1], request, env);
        }

        // API 路由需要认证
        if (path.startsWith('/api/')) {
            // 认证
            const authResult = await authMiddleware(request, env);
            if (authResult instanceof Response) {
                return authResult; // 认证失败
            }
            const { userKey } = authResult;

            // 路由分发
            return handleApiRoutes(path, method, request, env, userKey);
        }

        return notFound('未找到请求的资源');
    },

    /**
     * 定时任务触发处理
     */
    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
        await handleCron(event, env, ctx);
    },
};

/**
 * API 路由处理
 */
async function handleApiRoutes(
    path: string,
    method: string,
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    // 提醒列表 & 创建
    if (path === '/api/reminders') {
        if (method === 'GET') {
            return listReminders(request, env, userKey);
        }
        if (method === 'POST') {
            return createReminder(request, env, userKey);
        }
        return badRequest('不支持的请求方法');
    }

    // 单个提醒操作: /api/reminders/:id
    const reminderMatch = path.match(/^\/api\/reminders\/([^\/]+)$/);
    if (reminderMatch) {
        const id = reminderMatch[1];

        if (method === 'GET') {
            return getReminder(id, env, userKey);
        }
        if (method === 'PUT') {
            return updateReminder(id, request, env, userKey);
        }
        if (method === 'DELETE') {
            return deleteReminder(id, env, userKey);
        }
        return badRequest('不支持的请求方法');
    }

    // 手动触发: /api/reminders/:id/trigger
    const triggerMatch = path.match(/^\/api\/reminders\/([^\/]+)\/trigger$/);
    if (triggerMatch) {
        const id = triggerMatch[1];
        if (method === 'POST') {
            return triggerReminder(id, env, userKey);
        }
        return badRequest('不支持的请求方法');
    }

    // 确认提醒: /api/reminders/:id/ack (无需 userKey，实际上这个路由在 main fetch 不需要 auth 更好，但为了统一先放这里，假设回调带了 key 或者我们在 fetch 里放宽)
    // 修正：CallbackURL 通常由用户点击，可能没带 Authorization 头。所以这个路由最好在 fetch 中直接处理，不经过 authMiddleware。
    // 这里我们先跳过，去 fetch 修改。


    // 提醒执行日志: /api/reminders/:id/logs
    const logsMatch = path.match(/^\/api\/reminders\/([^\/]+)\/logs$/);
    if (logsMatch) {
        const id = logsMatch[1];

        if (method === 'GET') {
            return getReminderLogs(id, request, env, userKey);
        }
        return badRequest('不支持的请求方法');
    }

    // 统计信息
    if (path === '/api/stats' && method === 'GET') {
        return getStats(env, userKey);
    }

    // 全局执行日志
    if (path === '/api/logs' && method === 'GET') {
        return getAllLogs(request, env, userKey);
    }

    return notFound('未找到请求的 API');
}

/**
 * 获取统计信息
 */
async function getStats(env: Env, userKey: string): Promise<Response> {
    try {
        // 查询提醒任务统计
        const reminderStats = await env.DB.prepare(`
            SELECT 
                COUNT(*) as total_reminders,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_reminders,
                SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) as paused_reminders,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_reminders,
                SUM(trigger_count) as total_triggers
            FROM reminders 
            WHERE user_key = ?
        `).bind(userKey).first<{
            total_reminders: number;
            active_reminders: number;
            paused_reminders: number;
            completed_reminders: number;
            total_triggers: number;
        }>();

        // 查询用户的所有任务 ID
        const remindersResult = await env.DB.prepare(`
            SELECT id FROM reminders WHERE user_key = ?
        `).bind(userKey).all<{ id: string }>();
        const reminderIds = (remindersResult.results || []).map(r => r.id);

        let triggerStats = {
            success_triggers: 0,
            failed_triggers: 0,
            today_triggers: 0,
            week_triggers: 0,
        };

        if (reminderIds.length > 0) {
            const placeholders = reminderIds.map(() => '?').join(',');
            const now = Date.now();
            const todayStart = now - (now % (24 * 60 * 60 * 1000)); // 今日 00:00 UTC
            const weekStart = now - 7 * 24 * 60 * 60 * 1000; // 7天前

            // 聚合查询执行日志
            const logStats = await env.DB.prepare(`
                SELECT 
                    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_triggers,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_triggers,
                    SUM(CASE WHEN triggered_at >= ? THEN 1 ELSE 0 END) as today_triggers,
                    SUM(CASE WHEN triggered_at >= ? THEN 1 ELSE 0 END) as week_triggers
                FROM trigger_logs
                WHERE reminder_id IN (${placeholders})
            `).bind(todayStart, weekStart, ...reminderIds).first<{
                success_triggers: number;
                failed_triggers: number;
                today_triggers: number;
                week_triggers: number;
            }>();

            if (logStats) {
                triggerStats = {
                    success_triggers: logStats.success_triggers || 0,
                    failed_triggers: logStats.failed_triggers || 0,
                    today_triggers: logStats.today_triggers || 0,
                    week_triggers: logStats.week_triggers || 0,
                };
            }
        }

        // 计算成功率
        const totalExecutions = triggerStats.success_triggers + triggerStats.failed_triggers;
        const successRate = totalExecutions > 0 ? triggerStats.success_triggers / totalExecutions : 1;

        return success({
            total_reminders: reminderStats?.total_reminders || 0,
            active_reminders: reminderStats?.active_reminders || 0,
            paused_reminders: reminderStats?.paused_reminders || 0,
            completed_reminders: reminderStats?.completed_reminders || 0,
            total_triggers: reminderStats?.total_triggers || 0,
            success_triggers: triggerStats.success_triggers,
            failed_triggers: triggerStats.failed_triggers,
            success_rate: successRate,
            today_triggers: triggerStats.today_triggers,
            week_triggers: triggerStats.week_triggers,
        });
    } catch (error) {
        console.error('获取统计信息失败:', error);
        return serverError('获取统计信息失败');
    }
}

/**
 * 获取所有任务的执行日志
 */
async function getAllLogs(request: Request, env: Env, userKey: string): Promise<Response> {
    try {
        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const status = url.searchParams.get('status'); // success | failed

        // 查询用户的所有任务 ID
        const remindersResult = await env.DB.prepare(`
            SELECT id, title FROM reminders WHERE user_key = ?
        `).bind(userKey).all<{ id: string; title: string }>();

        const reminderIds = (remindersResult.results || []).map(r => r.id);
        const reminderTitles = new Map((remindersResult.results || []).map(r => [r.id, r.title]));

        if (reminderIds.length === 0) {
            return success({ total: 0, items: [] });
        }

        // 构建 IN 查询
        const placeholders = reminderIds.map(() => '?').join(',');
        let query = `
            SELECT * FROM trigger_logs 
            WHERE reminder_id IN (${placeholders})
        `;
        const params: any[] = [...reminderIds];

        if (status) {
            query += ` AND status = ?`;
            params.push(status);
        }

        query += ` ORDER BY triggered_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const result = await env.DB.prepare(query).bind(...params).all();

        // 查询总数
        let countQuery = `SELECT COUNT(*) as total FROM trigger_logs WHERE reminder_id IN (${placeholders})`;
        const countParams = [...reminderIds];
        if (status) {
            countQuery += ` AND status = ?`;
            countParams.push(status);
        }
        const countResult = await env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>();

        // 格式化日志，添加任务标题
        const logs = (result.results || []).map((log: any) => ({
            ...log,
            reminder_title: reminderTitles.get(log.reminder_id) || '未知任务',
            triggered_at: new Date(log.triggered_at).toISOString(),
        }));

        return success({
            total: countResult?.total || 0,
            items: logs,
        });
    } catch (error) {
        console.error('获取执行日志失败:', error);
        return serverError('获取执行日志失败');
    }
}
