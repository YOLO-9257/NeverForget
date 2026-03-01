import { Env } from '../../../types';
import { syncEmailAccountNow } from '../../../handlers/emailAccounts';
import { generateEmailSummary, createReminderFromEmail } from '../../../handlers/emailAiSummary';
import { addToBlacklist } from '../../../handlers/emailSecurity';
import {
    buildInternalUrl,
    createJsonRequest,
    toPositiveInt,
    unwrapApiResponse
} from './shared';

export async function searchEmailsExecutor(args: Record<string, any>, env: Env, userKey: string): Promise<any> {
    const limit = toPositiveInt(args.limit, 10, 50);
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    const accountId = typeof args.account_id === 'string' ? args.account_id.trim() : '';

    let sql = `
        SELECT
            fe.id,
            fe.account_id,
            ea.name AS account_name,
            fe.from_address,
            fe.subject,
            fe.received_at,
            fe.push_status,
            fe.ai_summary
        FROM fetched_emails fe
        JOIN email_accounts ea ON fe.account_id = ea.id
        WHERE ea.user_key = ?
    `;
    const params: any[] = [userKey];

    if (accountId) {
        sql += ` AND fe.account_id = ?`;
        params.push(accountId);
    }

    if (query) {
        const like = `%${query}%`;
        sql += ` AND (
            fe.from_address LIKE ?
            OR fe.subject LIKE ?
            OR fe.content LIKE ?
            OR fe.ai_summary LIKE ?
        )`;
        params.push(like, like, like, like);
    }

    sql += ` ORDER BY fe.received_at DESC LIMIT ?`;
    params.push(limit);

    const result = await env.DB.prepare(sql).bind(...params).all<{
        id: number;
        account_id: string;
        account_name: string;
        from_address: string;
        subject: string;
        received_at: number;
        push_status: string;
        ai_summary?: string | null;
    }>();

    return {
        count: (result.results || []).length,
        items: (result.results || []).map(item => ({
            ...item,
            received_at: new Date(item.received_at).toISOString()
        }))
    };
}

export async function getEmailSummaryExecutor(args: Record<string, any>, env: Env, userKey: string): Promise<any> {
    const emailId = String(args.id || args.email_id || '').trim();
    if (!emailId) {
        throw new Error('缺少邮件 ID');
    }

    const request = createJsonRequest(buildInternalUrl('/api/email/messages/summary'), 'POST', {
        email_id: emailId,
        force_refresh: Boolean(args.force_refresh)
    });
    const response = await generateEmailSummary(request, env, userKey);
    return unwrapApiResponse(response);
}

export async function syncEmailAccountExecutor(args: Record<string, any>, env: Env, userKey: string): Promise<any> {
    const accountId = String(args.id || '').trim();
    if (!accountId) {
        throw new Error('缺少邮箱账户 ID');
    }

    const owned = await env.DB.prepare(`
        SELECT id FROM email_accounts WHERE id = ? AND user_key = ? LIMIT 1
    `).bind(accountId, userKey).first<{ id: string }>();

    if (!owned) {
        throw new Error('邮箱账户不存在或无权限');
    }

    const response = await syncEmailAccountNow(env, accountId, userKey);
    return unwrapApiResponse(response);
}

export async function createTaskFromEmailExecutor(args: Record<string, any>, env: Env, userKey: string): Promise<any> {
    const emailId = String(args.email_id || args.id || '').trim();
    if (!emailId) {
        throw new Error('缺少邮件 ID');
    }

    const body: Record<string, any> = {
        email_id: emailId,
        use_ai_extract: args.use_ai_extract !== false
    };

    if (typeof args.custom_title === 'string' && args.custom_title.trim()) {
        body.custom_title = args.custom_title.trim();
    }
    if (typeof args.schedule_type === 'string') {
        body.schedule_type = args.schedule_type;
    }
    if (typeof args.schedule_date === 'string') {
        body.schedule_date = args.schedule_date;
    }
    if (typeof args.schedule_time === 'string') {
        body.schedule_time = args.schedule_time;
    }

    const request = createJsonRequest(buildInternalUrl('/api/email/messages/reminder'), 'POST', body);
    const response = await createReminderFromEmail(request, env, userKey);
    return unwrapApiResponse(response);
}

export async function blockSenderExecutor(args: Record<string, any>, env: Env, userKey: string): Promise<any> {
    const emailAddress = String(args.email_address || '').trim();
    if (!emailAddress) {
        throw new Error('缺少发件人邮箱地址');
    }

    const body: Record<string, any> = { email_address: emailAddress };
    if (typeof args.account_id === 'string' && args.account_id.trim()) {
        body.account_id = args.account_id.trim();
    }

    const request = createJsonRequest(buildInternalUrl('/api/email/blacklist'), 'POST', body);
    const response = await addToBlacklist(request, env, userKey);
    const result = await unwrapApiResponse(response);

    return {
        ...result,
        email_address: emailAddress
    };
}
