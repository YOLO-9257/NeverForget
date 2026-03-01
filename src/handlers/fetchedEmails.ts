/**
 * 已抓取邮件管理 Handler
 * @author zhangws
 */

import { Env, FetchedEmail, EmailSettings, EmailData } from '../types';
import { forwardEmailToPush, logAndFinishForward, PushSummaryContext } from '../services/emailService';
import { resolveAiConfigForAccount } from '../services/aiConfigResolver';
import { success, badRequest, notFound, serverError, error } from '../utils/response';

async function queueSummaryRegeneration(env: Env, emailId: string, priority: number = 1): Promise<void> {
    const now = Date.now();
    await env.DB.prepare(`
        INSERT INTO ai_processing_queue (
            email_id, priority, status, retry_count, error_message, created_at
        ) VALUES (?, ?, 'pending', 0, NULL, ?)
        ON CONFLICT(email_id) DO UPDATE SET
            priority = CASE
                WHEN ai_processing_queue.status = 'pending' AND excluded.priority > ai_processing_queue.priority
                THEN excluded.priority
                ELSE ai_processing_queue.priority
            END,
            status = CASE
                WHEN ai_processing_queue.status = 'failed' THEN 'pending'
                ELSE ai_processing_queue.status
            END,
            retry_count = CASE
                WHEN ai_processing_queue.status = 'failed' THEN 0
                ELSE ai_processing_queue.retry_count
            END,
            error_message = CASE
                WHEN ai_processing_queue.status = 'failed' THEN NULL
                ELSE ai_processing_queue.error_message
            END,
            created_at = CASE
                WHEN ai_processing_queue.status = 'failed' THEN excluded.created_at
                ELSE ai_processing_queue.created_at
            END
    `).bind(emailId, priority, now).run();
}

function parseActionItems(raw: unknown): string[] {
    if (typeof raw !== 'string' || !raw.trim()) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.filter(item => typeof item === 'string').slice(0, 5)
            : [];
    } catch {
        return [];
    }
}

function hasUsablePushConfig(raw: unknown): boolean {
    if (typeof raw !== 'string' || !raw.trim()) {
        return false;
    }

    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const appid = typeof parsed.appid === 'string' ? parsed.appid.trim() : '';
        const secret = typeof parsed.secret === 'string' ? parsed.secret.trim() : '';
        const userid = typeof parsed.userid === 'string' ? parsed.userid.trim() : '';
        const templateId = typeof parsed.template_id === 'string' ? parsed.template_id.trim() : '';
        return Boolean(appid && secret && userid && templateId);
    } catch {
        return false;
    }
}

/**
 * 获取账户的邮件列表
 * GET /api/email/accounts/:accountId/messages
 */
export async function listFetchedEmails(request: Request, env: Env, userKey: string): Promise<Response> {
    const url = new URL(request.url);
    // Path: /api/email/accounts/:accountId/messages
    const pathParts = url.pathname.split('/');
    const accountId = pathParts[4];

    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('size') || '20');
    const offset = (page - 1) * pageSize;

    if (!accountId) {
        return badRequest('Missing accountId');
    }

    try {
        // 校验账户归属，避免跨账户/跨用户串读
        const account = await env.DB.prepare(`
            SELECT id FROM email_accounts WHERE id = ? AND user_key = ?
        `).bind(accountId, userKey).first<{ id: string }>();

        if (!account) {
            return notFound('Account not found');
        }

        // 查询列表 (不包含 content 以减小体积)
        const { results } = await env.DB.prepare(`
            SELECT id, account_id, uid, from_address, subject, received_at, fetched_at, is_pushed, push_status 
            FROM fetched_emails 
            WHERE account_id = ? 
            ORDER BY received_at DESC 
            LIMIT ? OFFSET ?
        `).bind(accountId, pageSize, offset).all<FetchedEmail>();

        // 查询总数
        const totalResult = await env.DB.prepare(`
            SELECT COUNT(*) as count FROM fetched_emails WHERE account_id = ?
        `).bind(accountId).first<{ count: number }>();

        return success({
            list: results || [],
            total: totalResult?.count || 0,
            page,
            pageSize
        });
    } catch (e) {
        console.error('[FetchedEmails] List error:', e);
        return serverError(String(e));
    }
}

/**
 * 获取单封邮件详情
 * GET /api/email/messages/:messageId
 */
export async function getFetchedEmail(request: Request, env: Env, userKey: string): Promise<Response> {
    const url = new URL(request.url);
    // Path: /api/email/messages/:messageId
    const pathParts = url.pathname.split('/');
    const messageId = pathParts[4];

    if (!messageId) {
        return badRequest('Missing messageId');
    }

    try {
        const email = await env.DB.prepare(`
            SELECT fe.* 
            FROM fetched_emails fe
            JOIN email_accounts ea ON fe.account_id = ea.id
            WHERE fe.id = ? AND ea.user_key = ?
        `).bind(messageId, userKey).first<FetchedEmail>();

        if (!email) {
            return notFound('Email not found');
        }

        return success(email);
    } catch (e) {
        console.error('[FetchedEmails] Get error:', e);
        return serverError(String(e));
    }
}

/**
 * 手动推送邮件
 * POST /api/email/messages/:messageId/push
 */
export async function pushFetchedEmail(request: Request, env: Env, userKey: string): Promise<Response> {
    const url = new URL(request.url);
    // Path: /api/email/messages/:messageId/push
    const pathParts = url.pathname.split('/');
    const messageId = pathParts[4];

    if (!messageId) {
        return badRequest('Missing messageId');
    }

    try {
        // 1. 获取邮件
        const email = await env.DB.prepare(`
            SELECT fe.*
            FROM fetched_emails fe
            JOIN email_accounts ea ON fe.account_id = ea.id
            WHERE fe.id = ? AND ea.user_key = ?
        `).bind(messageId, userKey).first<FetchedEmail>();
        if (!email) return notFound('Email not found');

        // 2. 获取账户设置
        const account = await env.DB.prepare(`
            SELECT * FROM email_accounts WHERE id = ? AND user_key = ?
        `).bind(email.account_id, userKey).first<any>();
        if (!account) return notFound('Account not found');

        if (!hasUsablePushConfig(account.push_config)) {
            return error(
                '账户推送配置不完整，请先在邮箱账户中配置 appid/secret/userid/template_id',
                1,
                422
            );
        }

        // 3. 构建配置对象
        const settings: EmailSettings = {
            id: 0,
            user_key: account.user_key,
            enabled: 1,
            email_address: null,
            wxpush_token: null,
            wxpush_url: account.push_url,
            forward_rules: account.filter_rules,
            push_config: account.push_config,
            template_name: account.template_name,
            enable_imap: 1,
            imap_host: account.imap_host,
            imap_port: account.imap_port,
            imap_user: account.imap_user,
            imap_password: account.imap_password,
            imap_tls: account.imap_tls,
            last_sync_at: account.last_sync_at,
            sync_status: account.sync_status,
            sync_error: account.sync_error,
            total_forwarded: account.total_forwarded,
            last_forwarded_at: null,
            created_at: account.created_at,
            updated_at: account.updated_at
        };

        const emailData: EmailData = {
            from: email.from_address,
            subject: email.subject,
            content: email.content,
            received_at: email.received_at,
            uid: email.uid
        };

        const summaryContext: PushSummaryContext = {
            summary: (email as any).ai_summary || undefined,
            sentiment: (email as any).ai_sentiment || 'normal',
            importance_score: typeof (email as any).ai_importance_score === 'number' ? (email as any).ai_importance_score : undefined,
            action_items: parseActionItems((email as any).ai_action_items),
        };

        // 4. 执行推送
        const aiConfig = await resolveAiConfigForAccount(env, account.user_key, account.id);
        const pushResult = await forwardEmailToPush(env, settings, emailData, aiConfig, summaryContext);

        // 5. 更新状态
        await env.DB.prepare(`
            UPDATE fetched_emails 
            SET is_pushed = ?, push_status = ?, push_log = ?
            WHERE id = ?
        `).bind(
            pushResult.success ? 1 : 0,
            pushResult.success ? 'success' : 'failed',
            pushResult.error || pushResult.response,
            messageId
        ).run();

        // 6. 记录统计
        if (pushResult.success) {
            await logAndFinishForward(env, account.user_key, emailData, true, pushResult.response, undefined);
        }

        if (pushResult.success) {
            return success(pushResult, 'pushed successfully');
        } else {
            const failureMessage = pushResult.error || 'Push failed';
            const isConfigIssue = /未配置|missing|required|不能为空|invalid/i.test(failureMessage);
            return error(
                `推送失败: ${failureMessage}`,
                1,
                isConfigIssue ? 422 : 502
            );
        }

    } catch (e) {
        console.error('[FetchedEmails] Push error:', e);
        return serverError(String(e));
    }
}

/**
 * 更新邮件内容（用于保存 AI 修复结果）
 * PUT /api/email/messages/:messageId/content
 */
export async function updateFetchedEmailContent(request: Request, env: Env, userKey: string): Promise<Response> {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const messageId = pathParts[4];

    if (!messageId) {
        return badRequest('Missing messageId');
    }

    try {
        const body = await request.json<{ content?: string }>();
        const content = typeof body.content === 'string' ? body.content.trim() : '';
        if (!content) {
            return badRequest('content 不能为空');
        }

        // 验证邮件归属
        const owned = await env.DB.prepare(`
            SELECT fe.id
            FROM fetched_emails fe
            JOIN email_accounts ea ON fe.account_id = ea.id
            WHERE fe.id = ? AND ea.user_key = ?
        `).bind(messageId, userKey).first<{ id: number }>();

        if (!owned) {
            return notFound('Email not found');
        }

        await env.DB.prepare(`
            UPDATE fetched_emails
            SET content = ?,
                ai_summary = NULL,
                ai_entities = NULL,
                ai_action_items = NULL,
                ai_sentiment = NULL,
                ai_importance_score = NULL,
                ai_processed_at = NULL
            WHERE id = ?
        `).bind(content, messageId).run();

        // 内容变更后自动重新生成摘要，避免旧摘要与正文不一致
        let summaryQueued = true;
        try {
            await queueSummaryRegeneration(env, messageId, 1);
        } catch (queueError) {
            summaryQueued = false;
            console.warn('[FetchedEmails] Queue summary regeneration failed:', queueError);
        }

        return success(
            { id: Number(messageId), content, summary_regeneration_queued: summaryQueued },
            summaryQueued ? '邮件内容已更新，摘要将自动重建' : '邮件内容已更新，请稍后手动生成摘要'
        );
    } catch (e) {
        console.error('[FetchedEmails] Update content error:', e);
        return serverError(String(e));
    }
}
