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
import { login, setup, checkInitStatus } from './handlers/auth';
import { getEmailSettings, updateEmailSettings, getEmailLogs, testEmailForward } from './handlers/emailSettings';
import { handleEmail } from './handlers/emailWorker';
import { handleAiChat, getAiHistory } from './handlers/aiChat';
import { listConfigs, createConfig, deleteConfig } from './handlers/configs';
import {
    getEmailAccounts,
    createEmailAccount,
    getEmailAccount,
    updateEmailAccount,
    deleteEmailAccount,
    syncEmailAccountNow,
    testEmailConnection
} from './handlers/emailAccounts';
import { getEmailTrend } from './handlers/statsHandler';
import { listFetchedEmails, getFetchedEmail, pushFetchedEmail, updateFetchedEmailContent } from './handlers/fetchedEmails';
import {
    listBlacklist,
    addToBlacklist,
    deleteFromBlacklist,
    listRules,
    createRule,
    deleteRule
} from './handlers/emailSecurity';

// Phase 1.1: 智能邮件分类
import {
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    batchClassifyEmails,
    getCategoryStats,
} from './handlers/emailCategories';

// Phase 1.2: AI摘要
import {
    generateEmailSummary,
    batchGenerateSummaries,
    createReminderFromEmail,
    getAIQueueStatus,
    retryFailedAITasks,
} from './handlers/emailAiSummary';

// Phase 1.3: 多渠道通知
import {
    listNotificationChannels,
    createNotificationChannel,
    updateNotificationChannel,
    deleteNotificationChannel,
    testNotificationChannel,
    sendTestMessage,
    getChannelHealthHistory,
    listPushTracking,
    retryPush,
} from './handlers/notificationChannels';

// Phase 2.1: 同步监控
import {
    getSyncDashboard,
    getSyncLogs,
    getSyncStatistics,
} from './handlers/syncMonitor';

// Phase 3.2: 工作流
import {
    listWorkflowRules,
    createWorkflowRule,
    updateWorkflowRule,
    deleteWorkflowRule,
    testWorkflowRule,
    getWorkflowExecutions,
} from './handlers/workflowRules';
import { ensureAiActionLogsTable } from './services/aiActionLogger';
import { ensureRemindersSchema } from './services/reminderSchema';



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
        if (path === '/wxpush') {
            return handlePublicPush(request, env);
        }

        // 提醒确认回调 (无需认证)
        const ackMatch = path.match(/^\/api\/reminders\/([^\/]+)\/ack$/);
        if (ackMatch && method === 'POST') {
            return ackReminder(ackMatch[1], request, env);
        }

        // 认证相关路由 (无需认证)
        if (path === '/api/auth/login' && method === 'POST') {
            return login(request, env);
        }
        if (path === '/api/auth/setup' && method === 'POST') {
            return setup(request, env);
        }
        if (path === '/api/auth/init-status' && method === 'GET') {
            return checkInitStatus(env);
        }

        // API 路由需要认证
        if (path.startsWith('/api/')) {
            await ensureRemindersSchema(env);

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
        await ensureRemindersSchema(env);
        await handleCron(event, env, ctx);
    },

    /**
     * 邮件接收处理 (Cloudflare Email Routing)
     */
    async email(message: EmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
        await handleEmail(message, env);
    },
};

/**
 * Email Message 接口定义 (Cloudflare Email Workers)
 */
interface EmailMessage {
    readonly from: string;
    readonly to: string;
    readonly headers: Headers;
    readonly raw: ReadableStream;
    readonly rawSize: number;
    setReject(reason: string): void;
    forward(rcptTo: string, headers?: Headers): Promise<void>;
    reply(message: EmailMessage): Promise<void>;
}

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

    // 邮件转发设置
    if (path === '/api/email-settings') {
        if (method === 'GET') {
            return getEmailSettings(env, userKey);
        }
        if (method === 'PUT') {
            return updateEmailSettings(request, env, userKey);
        }
        return badRequest('不支持的请求方法');
    }

    // 邮件转发日志
    if (path === '/api/email-settings/logs' && method === 'GET') {
        return getEmailLogs(request, env, userKey);
    }

    // AI 智能管家
    if (path === '/api/ai/chat') {
        if (method === 'POST') {
            return handleAiChat(request, env, userKey);
        }
        if (method === 'GET') {
            return getAiHistory(request, env, userKey);
        }
    }

    // 通用配置项管理 (Saved Configs)
    if (path === '/api/configs') {
        if (method === 'GET') {
            return listConfigs(request, env, userKey);
        }
        if (method === 'POST') {
            return createConfig(request, env, userKey);
        }
    }
    const configDetailMatch = path.match(/^\/api\/configs\/(\d+)$/);
    if (configDetailMatch && method === 'DELETE') {
        return deleteConfig(configDetailMatch[1], env, userKey);
    }



    // 测试邮件转发
    if (path === '/api/email-settings/test' && method === 'POST') {
        return testEmailForward(env, userKey);
    }

    // ==========================================
    // 新版邮箱账户管理 API
    // ==========================================

    // 账户列表 & 创建
    if (path === '/api/email/accounts') {
        if (method === 'GET') {
            return getEmailAccounts(env, userKey);
        }
        if (method === 'POST') {
            return createEmailAccount(env, userKey, await request.json());
        }
        return badRequest('不支持的请求方法');
    }

    // 单个账户操作
    const emailAccountMatch = path.match(/^\/api\/email\/accounts\/([^\/]+)$/);
    if (emailAccountMatch) {
        const id = emailAccountMatch[1];
        if (method === 'GET') {
            return getEmailAccount(env, id, userKey);
        }
        if (method === 'PUT') {
            return updateEmailAccount(env, userKey, id, await request.json());
        }
        if (method === 'DELETE') {
            return deleteEmailAccount(env, id, userKey);
        }
        return badRequest('不支持的请求方法');
    }

    // 立即同步
    const emailSyncMatch = path.match(/^\/api\/email\/accounts\/([^\/]+)\/sync$/);
    if (emailSyncMatch && method === 'POST') {
        return syncEmailAccountNow(env, emailSyncMatch[1], userKey);
    }

    // 测试连接
    if (path === '/api/email/test' && method === 'POST') {
        return testEmailConnection(env, await request.json());
    }

    // 邮件趋势统计
    if (path === '/api/stats/email-trend' && method === 'GET') {
        return getEmailTrend(env, userKey);
    }

    // ==========================================
    // 邮件内容管理 API
    // ==========================================

    // 获取账户的邮件列表: /api/email/accounts/:accountId/messages
    const emailMessagesMatch = path.match(/^\/api\/email\/accounts\/([^\/]+)\/messages$/);
    if (emailMessagesMatch && method === 'GET') {
        return listFetchedEmails(request, env, userKey);
    }

    // 邮件详情: /api/email/messages/:messageId
    const emailDetailMatch = path.match(/^\/api\/email\/messages\/([^\/]+)$/);
    if (emailDetailMatch && method === 'GET') {
        return getFetchedEmail(request, env, userKey);
    }

    // 手动推送: /api/email/messages/:messageId/push
    const emailPushMatch = path.match(/^\/api\/email\/messages\/([^\/]+)\/push$/);
    if (emailPushMatch && method === 'POST') {
        return pushFetchedEmail(request, env, userKey);
    }

    // 更新邮件内容: /api/email/messages/:messageId/content
    const emailContentMatch = path.match(/^\/api\/email\/messages\/([^\/]+)\/content$/);
    if (emailContentMatch && method === 'PUT') {
        return updateFetchedEmailContent(request, env, userKey);
    }

    // ==========================================
    // Email Security (Blacklist & Rules)
    // ==========================================

    // Blacklist
    if (path === '/api/email/blacklist') {
        if (method === 'GET') return listBlacklist(request, env, userKey);
        if (method === 'POST') return addToBlacklist(request, env, userKey);
    }
    const blacklistMatch = path.match(/^\/api\/email\/blacklist\/(\d+)$/);
    if (blacklistMatch && method === 'DELETE') {
        return deleteFromBlacklist(blacklistMatch[1], env, userKey);
    }

    // Rules
    if (path === '/api/email/rules') {
        if (method === 'GET') return listRules(request, env, userKey);
        if (method === 'POST') return createRule(request, env, userKey);
    }
    const rulesMatch = path.match(/^\/api\/email\/rules\/(\d+)$/);
    if (rulesMatch && method === 'DELETE') {
        return deleteRule(rulesMatch[1], env, userKey);
    }

    // AI Email Parsing (Fix Garbled Content)
    if (path === '/api/email/ai/parse' && method === 'POST') {
        const { parseEmailContent } = await import('./handlers/emailAi');
        return parseEmailContent(request, env, userKey);
    }

    // ==========================================
    // Phase 1.1: 智能邮件分类 API
    // ==========================================

    // 分类列表 & 创建
    if (path === '/api/email/categories') {
        if (method === 'GET') return listCategories(request, env, userKey);
        if (method === 'POST') return createCategory(request, env, userKey);
    }

    // 单个分类操作
    const categoryMatch = path.match(/^\/api\/email\/categories\/(\d+)$/);
    if (categoryMatch) {
        const id = categoryMatch[1];
        if (method === 'PUT') return updateCategory(id, request, env, userKey);
        if (method === 'DELETE') return deleteCategory(id, env, userKey);
    }

    // 批量分类邮件
    if (path === '/api/email/categories/batch-classify' && method === 'POST') {
        return batchClassifyEmails(request, env, userKey);
    }

    // 分类统计
    if (path === '/api/email/categories/stats' && method === 'GET') {
        return getCategoryStats(request, env, userKey);
    }

    // ==========================================
    // Phase 1.2: AI摘要 API
    // ==========================================

    // 生成邮件摘要
    if (path === '/api/email/messages/summary' && method === 'POST') {
        return generateEmailSummary(request, env, userKey);
    }

    // 批量生成摘要
    if (path === '/api/email/messages/summary/batch' && method === 'POST') {
        return batchGenerateSummaries(request, env, userKey);
    }

    // 从邮件创建提醒
    if (path === '/api/email/messages/reminder' && method === 'POST') {
        return createReminderFromEmail(request, env, userKey);
    }

    // AI队列状态
    if (path === '/api/email/ai/queue-status' && method === 'GET') {
        return getAIQueueStatus(request, env, userKey);
    }

    // 重试失败的AI任务
    if (path === '/api/email/ai/retry-failed' && method === 'POST') {
        return retryFailedAITasks(request, env, userKey);
    }

    // ==========================================
    // Phase 1.3: 多渠道通知 API
    // ==========================================

    // 通知渠道列表 & 创建
    if (path === '/api/notification/channels') {
        if (method === 'GET') return listNotificationChannels(request, env, userKey);
        if (method === 'POST') return createNotificationChannel(request, env, userKey);
    }

    // 单个渠道操作
    const channelMatch = path.match(/^\/api\/notification\/channels\/(\d+)$/);
    if (channelMatch) {
        const id = channelMatch[1];
        if (method === 'PUT') return updateNotificationChannel(id, request, env, userKey);
        if (method === 'DELETE') return deleteNotificationChannel(id, env, userKey);
    }

    // 测试渠道连通性
    const channelTestMatch = path.match(/^\/api\/notification\/channels\/(\d+)\/test$/);
    if (channelTestMatch && method === 'POST') {
        return testNotificationChannel(channelTestMatch[1], env, userKey);
    }

    // 发送测试消息
    const channelSendMatch = path.match(/^\/api\/notification\/channels\/(\d+)\/send-test$/);
    if (channelSendMatch && method === 'POST') {
        return sendTestMessage(channelSendMatch[1], env, userKey);
    }

    // 渠道健康历史
    const channelHealthMatch = path.match(/^\/api\/notification\/channels\/(\d+)\/health$/);
    if (channelHealthMatch && method === 'GET') {
        return getChannelHealthHistory(request, channelHealthMatch[1], env, userKey);
    }

    // 推送追踪列表
    if (path === '/api/push/tracking' && method === 'GET') {
        return listPushTracking(request, env, userKey);
    }

    // 重试推送
    const pushRetryMatch = path.match(/^\/api\/push\/tracking\/(\d+)\/retry$/);
    if (pushRetryMatch && method === 'POST') {
        return retryPush(pushRetryMatch[1], env, userKey);
    }

    // ==========================================
    // Phase 2.1: 同步监控 API
    // ==========================================

    // 同步仪表盘
    if (path === '/api/email/sync/dashboard' && method === 'GET') {
        return getSyncDashboard(request, env, userKey);
    }

    // 同步日志
    if (path === '/api/email/sync/logs' && method === 'GET') {
        return getSyncLogs(request, env, userKey);
    }

    // 同步统计
    if (path === '/api/email/sync/statistics' && method === 'GET') {
        return getSyncStatistics(request, env, userKey);
    }

    // ==========================================
    // Phase 3.2: 工作流规则 API
    // ==========================================

    // 工作流规则列表 & 创建
    if (path === '/api/workflow/rules') {
        if (method === 'GET') return listWorkflowRules(request, env, userKey);
        if (method === 'POST') return createWorkflowRule(request, env, userKey);
    }

    // 单个规则操作
    const workflowRuleMatch = path.match(/^\/api\/workflow\/rules\/(\d+)$/);
    if (workflowRuleMatch) {
        const id = workflowRuleMatch[1];
        if (method === 'PUT') return updateWorkflowRule(id, request, env, userKey);
        if (method === 'DELETE') return deleteWorkflowRule(id, env, userKey);
    }

    // 测试工作流规则
    const workflowTestMatch = path.match(/^\/api\/workflow\/rules\/(\d+)\/test$/);
    if (workflowTestMatch && method === 'POST') {
        return testWorkflowRule(workflowTestMatch[1], request, env, userKey);
    }

    // 获取工作流执行记录
    const workflowExecMatch = path.match(/^\/api\/workflow\/rules\/(\d+)\/executions$/);
    if (workflowExecMatch && method === 'GET') {
        return getWorkflowExecutions(request, workflowExecMatch[1], env, userKey);
    }

    return notFound('未找到请求的 API');
}

/**
 * 获取统计信息
 * 优先从三层日志模型读取，fallback 到旧 trigger_logs
 */
async function getStats(env: Env, userKey: string): Promise<Response> {
    try {
        // 查询提醒任务统计（始终从 reminders 表读取）
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

        // 尝试从三层日志模型读取执行统计
        let triggerStats = {
            success_triggers: 0,
            failed_triggers: 0,
            today_triggers: 0,
            week_triggers: 0,
        };
        let dailyStats: { day: string; success: number; failed: number }[] = [];

        const now = Date.now();
        const SHANGHAI_OFFSET = 28800000; // 8小时 UTC+8
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        const todayStart = now - ((now + SHANGHAI_OFFSET) % ONE_DAY_MS);
        const weekStart = todayStart - 6 * ONE_DAY_MS;

        let useNewModel = false;

        try {
            // 从 task_exec_snapshot 聚合总执行次数
            const snapshotStats = await env.DB.prepare(`
                SELECT
                    SUM(total_count) as total_executions,
                    SUM(success_count) as success_triggers,
                    SUM(failed_count) as failed_triggers
                FROM task_exec_snapshot
                WHERE user_key = ?
            `).bind(userKey).first<{
                total_executions: number;
                success_triggers: number;
                failed_triggers: number;
            }>();

            const snapshotTotal = Number(snapshotStats?.total_executions || 0);
            const snapshotSuccess = Number(snapshotStats?.success_triggers || 0);
            const snapshotFailed = Number(snapshotStats?.failed_triggers || 0);

            // 仅当新模型已有明确的成功/失败计数时才切换，避免只初始化 total_count 导致统计失真
            if (snapshotTotal > 0 && snapshotSuccess + snapshotFailed > 0) {
                useNewModel = true;

                triggerStats.success_triggers = snapshotSuccess;
                triggerStats.failed_triggers = snapshotFailed;

                // 从 task_exec_rollup 获取今日执行次数
                const todayBucketStart = (() => {
                    const d = new Date(todayStart + SHANGHAI_OFFSET);
                    const year = d.getUTCFullYear();
                    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
                    const day = String(d.getUTCDate()).padStart(2, '0');
                    return `${year}-${month}-${day} 00`;
                })();

                const todayRollup = await env.DB.prepare(`
                    SELECT SUM(total_count) as today
                    FROM task_exec_rollup
                    WHERE user_key = ? AND bucket_hour >= ?
                `).bind(userKey, todayBucketStart).first<{ today: number }>();
                triggerStats.today_triggers = todayRollup?.today || 0;

                // 从 task_exec_rollup 获取 7 天趋势
                const weekBucketStart = (() => {
                    const d = new Date(weekStart + SHANGHAI_OFFSET);
                    const year = d.getUTCFullYear();
                    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
                    const day = String(d.getUTCDate()).padStart(2, '0');
                    return `${year}-${month}-${day} 00`;
                })();

                const weekRollup = await env.DB.prepare(`
                    SELECT SUM(total_count) as week
                    FROM task_exec_rollup
                    WHERE user_key = ? AND bucket_hour >= ?
                `).bind(userKey, weekBucketStart).first<{ week: number }>();
                triggerStats.week_triggers = weekRollup?.week || 0;

                // 7 天每日趋势（按 bucket_hour 的日期部分 GROUP BY）
                const dailyTrendResult = await env.DB.prepare(`
                    SELECT
                        SUBSTR(bucket_hour, 1, 10) as day,
                        SUM(success_count) as success,
                        SUM(failed_count) as failed
                    FROM task_exec_rollup
                    WHERE user_key = ? AND bucket_hour >= ?
                    GROUP BY day
                    ORDER BY day ASC
                `).bind(userKey, weekBucketStart).all<{ day: string; success: number; failed: number }>();

                // 补全缺失的日期
                const statsMap = new Map<string, { success: number; failed: number }>();
                (dailyTrendResult.results || []).forEach(stat => {
                    statsMap.set(stat.day, { success: stat.success, failed: stat.failed });
                });

                for (let i = 0; i < 7; i++) {
                    const d = new Date(weekStart + i * ONE_DAY_MS + SHANGHAI_OFFSET);
                    const dayStr = d.toISOString().split('T')[0];
                    const stat = statsMap.get(dayStr) || { success: 0, failed: 0 };
                    dailyStats.push({ day: dayStr, success: stat.success, failed: stat.failed });
                }
            }
        } catch (newModelErr) {
            console.warn('[Stats] 三层日志模型查询失败，回退到旧逻辑:', newModelErr);
            useNewModel = false;
        }

        // Fallback: 如果三层模型没有数据，回退到旧 trigger_logs 查询
        if (!useNewModel) {
            const remindersResult = await env.DB.prepare(`
                SELECT id FROM reminders WHERE user_key = ?
            `).bind(userKey).all<{ id: string }>();
            const reminderIds = (remindersResult.results || []).map(r => r.id);

            if (reminderIds.length > 0) {
                const placeholders = reminderIds.map(() => '?').join(',');

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

                const dailyTrendResult = await env.DB.prepare(`
                    SELECT 
                        date((triggered_at + ?) / 1000, 'unixepoch') as day,
                        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
                        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
                    FROM trigger_logs 
                    WHERE reminder_id IN (${placeholders}) AND triggered_at >= ?
                    GROUP BY day
                    ORDER BY day ASC
                `).bind(SHANGHAI_OFFSET, ...reminderIds, weekStart).all<{ day: string; success: number; failed: number }>();

                const statsMap = new Map<string, { success: number; failed: number }>();
                (dailyTrendResult.results || []).forEach(stat => {
                    statsMap.set(stat.day, { success: stat.success, failed: stat.failed });
                });

                dailyStats = [];
                for (let i = 0; i < 7; i++) {
                    const d = new Date(weekStart + i * ONE_DAY_MS + SHANGHAI_OFFSET);
                    const dayStr = d.toISOString().split('T')[0];
                    const stat = statsMap.get(dayStr) || { success: 0, failed: 0 };
                    dailyStats.push({ day: dayStr, success: stat.success, failed: stat.failed });
                }
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
            daily_stats: dailyStats,
        });
    } catch (error) {
        console.error('获取统计信息失败:', error);
        return serverError('获取统计信息失败');
    }
}

/**
 * 获取所有任务的执行日志
 * 优先从 task_exec_detail 读取，fallback 到旧 trigger_logs
 */
async function getAllLogs(request: Request, env: Env, userKey: string): Promise<Response> {
    try {
        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const status = url.searchParams.get('status'); // success | failed
        const type = url.searchParams.get('type'); // reminder | email_sync

        const toIso = (value: unknown): string => {
            const numeric = typeof value === 'number' ? value : Number(value);
            const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(String(value ?? ''));
            return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
        };

        const aiLogsReady = await ensureAiActionLogsTable(env);

        // 尝试从三层日志模型的 task_exec_detail 表读取
        let useNewModel = false;
        try {
            // 检测 task_exec_detail 表是否存在且有数据
            const detailCheck = await env.DB.prepare(`
                SELECT COUNT(*) as cnt FROM task_exec_detail WHERE user_key = ? LIMIT 1
            `).bind(userKey).first<{ cnt: number }>();

            if (detailCheck && detailCheck.cnt > 0) {
                useNewModel = true;
            }
        } catch {
            // 表不存在或查询失败，使用旧逻辑
        }

        if (useNewModel) {
            // --- 新逻辑：从 task_exec_detail 读取 ---
            let detailQuery = `
                SELECT * FROM (
                    SELECT
                        d.id AS id,
                        d.reminder_id AS reminder_id,
                        d.triggered_at AS triggered_at,
                        d.status AS status,
                        d.response AS response,
                        d.error AS error,
                        d.duration_ms AS duration_ms,
                        d.detail_reason AS detail_reason,
                        r.title AS reminder_title,
                        r.type AS reminder_type,
                        'scheduler' AS source,
                        NULL AS action
                    FROM task_exec_detail d
                    INNER JOIN reminders r ON d.reminder_id = r.id
                    WHERE d.user_key = ?
                    ${type ? 'AND d.task_type = ?' : ''}
                    ${status ? 'AND d.status = ?' : ''}
            `;

            // AI 管家日志部分
            if (aiLogsReady) {
                detailQuery += `
                    UNION ALL

                    SELECT
                        a.id AS id,
                        a.reminder_id AS reminder_id,
                        a.triggered_at AS triggered_at,
                        a.status AS status,
                        a.response AS response,
                        a.error AS error,
                        a.duration_ms AS duration_ms,
                        NULL AS detail_reason,
                        COALESCE(a.reminder_title, '智能管家动作') AS reminder_title,
                        COALESCE(a.reminder_type, 'reminder') AS reminder_type,
                        'ai_butler' AS source,
                        a.action AS action
                    FROM ai_action_logs a
                    WHERE a.user_key = ?
                    ${type ? "AND COALESCE(a.reminder_type, 'reminder') = ?" : ''}
                    ${status ? 'AND a.status = ?' : ''}
                `;
            }

            detailQuery += `
                ) all_logs
                ORDER BY triggered_at DESC
                LIMIT ? OFFSET ?
            `;

            const detailParams: unknown[] = [userKey];
            if (type) detailParams.push(type);
            if (status) detailParams.push(status);
            if (aiLogsReady) {
                detailParams.push(userKey);
                if (type) detailParams.push(type);
                if (status) detailParams.push(status);
            }
            detailParams.push(limit, offset);

            const logsResult = await env.DB.prepare(detailQuery).bind(...detailParams).all();

            // COUNT 查询
            let countQuery = `
                SELECT
                    (
                        SELECT COUNT(*)
                        FROM task_exec_detail d
                        INNER JOIN reminders r ON d.reminder_id = r.id
                        WHERE d.user_key = ?
                        ${type ? 'AND d.task_type = ?' : ''}
                        ${status ? 'AND d.status = ?' : ''}
                    )
            `;

            if (aiLogsReady) {
                countQuery += `
                    +
                    (
                        SELECT COUNT(*)
                        FROM ai_action_logs a
                        WHERE a.user_key = ?
                        ${type ? "AND COALESCE(a.reminder_type, 'reminder') = ?" : ''}
                        ${status ? 'AND a.status = ?' : ''}
                    )
                `;
            }

            countQuery += ` AS total`;

            const countParams: unknown[] = [userKey];
            if (type) countParams.push(type);
            if (status) countParams.push(status);
            if (aiLogsReady) {
                countParams.push(userKey);
                if (type) countParams.push(type);
                if (status) countParams.push(status);
            }

            const countResult = await env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>();

            const logs = (logsResult.results || []).map((log: any) => ({
                ...log,
                reminder_title: log.reminder_title || '未知任务',
                reminder_type: log.reminder_type || 'reminder',
                triggered_at: toIso(log.triggered_at),
            }));

            return success({
                total: countResult?.total || 0,
                items: logs,
            });
        }

        // --- Fallback: 旧逻辑（从 trigger_logs 读取）---
        if (!aiLogsReady) {
            let remindersQuery = `SELECT id, title, type FROM reminders WHERE user_key = ?`;
            const remindersParams: unknown[] = [userKey];

            if (type) {
                remindersQuery += ` AND type = ?`;
                remindersParams.push(type);
            }

            const remindersResult = await env.DB.prepare(remindersQuery)
                .bind(...remindersParams)
                .all<{ id: string; title: string; type: string }>();

            const reminderIds = (remindersResult.results || []).map(r => r.id);
            const reminderTitles = new Map((remindersResult.results || []).map(r => [r.id, r.title]));
            const reminderTypes = new Map((remindersResult.results || []).map(r => [r.id, r.type]));

            if (reminderIds.length === 0) {
                return success({ total: 0, items: [] });
            }

            const placeholders = reminderIds.map(() => '?').join(',');
            let query = `
                SELECT * FROM trigger_logs
                WHERE reminder_id IN (${placeholders})
            `;
            const params: unknown[] = [...reminderIds];

            if (status) {
                query += ` AND status = ?`;
                params.push(status);
            }

            query += ` ORDER BY triggered_at DESC LIMIT ? OFFSET ?`;
            params.push(limit, offset);

            const result = await env.DB.prepare(query).bind(...params).all();

            let countQuery = `SELECT COUNT(*) as total FROM trigger_logs WHERE reminder_id IN (${placeholders})`;
            const countParams: unknown[] = [...reminderIds];
            if (status) {
                countQuery += ` AND status = ?`;
                countParams.push(status);
            }

            const countResult = await env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>();

            const logs = (result.results || []).map((log: any) => ({
                ...log,
                reminder_title: reminderTitles.get(log.reminder_id) || '未知任务',
                reminder_type: reminderTypes.get(log.reminder_id) || 'reminder',
                source: 'scheduler',
                action: null,
                triggered_at: toIso(log.triggered_at),
            }));

            return success({
                total: countResult?.total || 0,
                items: logs,
            });
        }

        const logsQuery = `
            SELECT * FROM (
                SELECT
                    l.id AS id,
                    l.reminder_id AS reminder_id,
                    l.triggered_at AS triggered_at,
                    l.status AS status,
                    l.response AS response,
                    l.error AS error,
                    l.duration_ms AS duration_ms,
                    NULL AS detail_reason,
                    r.title AS reminder_title,
                    r.type AS reminder_type,
                    'scheduler' AS source,
                    NULL AS action
                FROM trigger_logs l
                INNER JOIN reminders r ON l.reminder_id = r.id
                WHERE r.user_key = ?
                ${type ? `AND r.type = ?` : ''}
                ${status ? `AND l.status = ?` : ''}

                UNION ALL

                SELECT
                    a.id AS id,
                    a.reminder_id AS reminder_id,
                    a.triggered_at AS triggered_at,
                    a.status AS status,
                    a.response AS response,
                    a.error AS error,
                    a.duration_ms AS duration_ms,
                    NULL AS detail_reason,
                    COALESCE(a.reminder_title, '智能管家动作') AS reminder_title,
                    COALESCE(a.reminder_type, 'reminder') AS reminder_type,
                    'ai_butler' AS source,
                    a.action AS action
                FROM ai_action_logs a
                WHERE a.user_key = ?
                ${type ? `AND COALESCE(a.reminder_type, 'reminder') = ?` : ''}
                ${status ? `AND a.status = ?` : ''}
            ) all_logs
            ORDER BY triggered_at DESC
            LIMIT ? OFFSET ?
        `;

        const logsParams: unknown[] = [userKey];
        if (type) logsParams.push(type);
        if (status) logsParams.push(status);
        logsParams.push(userKey);
        if (type) logsParams.push(type);
        if (status) logsParams.push(status);
        logsParams.push(limit, offset);

        const logsResult = await env.DB.prepare(logsQuery).bind(...logsParams).all();

        const countQuery = `
            SELECT
                (
                    SELECT COUNT(*)
                    FROM trigger_logs l
                    INNER JOIN reminders r ON l.reminder_id = r.id
                    WHERE r.user_key = ?
                    ${type ? `AND r.type = ?` : ''}
                    ${status ? `AND l.status = ?` : ''}
                ) +
                (
                    SELECT COUNT(*)
                    FROM ai_action_logs a
                    WHERE a.user_key = ?
                    ${type ? `AND COALESCE(a.reminder_type, 'reminder') = ?` : ''}
                    ${status ? `AND a.status = ?` : ''}
                ) AS total
        `;

        const countParams: unknown[] = [userKey];
        if (type) countParams.push(type);
        if (status) countParams.push(status);
        countParams.push(userKey);
        if (type) countParams.push(type);
        if (status) countParams.push(status);

        const countResult = await env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>();

        const logs = (logsResult.results || []).map((log: any) => ({
            ...log,
            reminder_title: log.reminder_title || '未知任务',
            reminder_type: log.reminder_type || 'reminder',
            triggered_at: toIso(log.triggered_at),
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
