/**
 * 已抓取邮件管理 Handler
 * @author zhangws
 */

import { Env, FetchedEmail, EmailSettings, EmailData } from '../types';
import { forwardEmailToPush, logAndFinishForward } from '../services/emailService';
import { success, badRequest, notFound, serverError, error } from '../utils/response';

/**
 * 获取账户的邮件列表
 * GET /api/email/accounts/:accountId/messages
 */
export async function listFetchedEmails(request: Request, env: Env): Promise<Response> {
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
export async function getFetchedEmail(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // Path: /api/email/messages/:messageId
    const pathParts = url.pathname.split('/');
    const messageId = pathParts[4];

    if (!messageId) {
        return badRequest('Missing messageId');
    }

    try {
        const email = await env.DB.prepare(`
            SELECT * FROM fetched_emails WHERE id = ?
        `).bind(messageId).first<FetchedEmail>();

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
export async function pushFetchedEmail(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // Path: /api/email/messages/:messageId/push
    const pathParts = url.pathname.split('/');
    const messageId = pathParts[4];

    if (!messageId) {
        return badRequest('Missing messageId');
    }

    try {
        // 1. 获取邮件
        const email = await env.DB.prepare(`SELECT * FROM fetched_emails WHERE id = ?`).bind(messageId).first<FetchedEmail>();
        if (!email) return notFound('Email not found');

        // 2. 获取账户设置
        const account = await env.DB.prepare(`SELECT * FROM email_accounts WHERE id = ?`).bind(email.account_id).first<any>();
        if (!account) return notFound('Account not found');

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

        // 4. 执行推送
        const pushResult = await forwardEmailToPush(env, settings, emailData);

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
            return error(pushResult.error || 'Push failed', 500);
        }

    } catch (e) {
        console.error('[FetchedEmails] Push error:', e);
        return serverError(String(e));
    }
}
