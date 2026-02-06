/**
 * 邮箱账户管理 API Handler
 * @author zhangws
 */

import { Env, EmailAccount, ForwardRules } from '../types';
import { error, success } from '../utils/response';
import { encryptPassword } from '../utils/crypto';

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
                   auto_push, enable_ai_spam_filter
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
export async function getEmailAccount(env: Env, accountId: string): Promise<Response> {
    try {
        const account = await env.DB.prepare(`
            SELECT id, name, imap_host, imap_port, imap_user, imap_tls,
                   push_config, push_url, template_name, filter_rules,
                   enabled, last_sync_at, sync_status, sync_error,
                   total_synced, total_forwarded, created_at, updated_at,
                   auto_push, enable_ai_spam_filter
            FROM email_accounts
            WHERE id = ?
        `).bind(accountId).first<EmailAccount>();

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
    body: {
        name: string;
        imap_host: string;
        imap_port?: number;
        imap_user: string;
        imap_password: string;
        imap_tls?: boolean;
        push_config?: any;
        push_url?: string;
        template_name?: string;
        filter_rules?: ForwardRules;
        poll_interval?: number; // 分钟
        enable_ai_spam_filter?: boolean;
        auto_push?: boolean;
    }
): Promise<Response> {
    try {
        const accountId = generateAccountId();
        const now = Date.now();

        // 加密密码
        const encryptedPassword = await encryptPassword(
            body.imap_password,
            env.ENCRYPTION_KEY || 'default-key'
        );

        // 推送配置 JSON
        const pushConfigJson = body.push_config ? JSON.stringify(body.push_config) : null;
        const filterRulesJson = body.filter_rules ? JSON.stringify(body.filter_rules) : null;

        // 插入账户
        await env.DB.prepare(`
            INSERT INTO email_accounts (
                id, user_key, name,
                imap_host, imap_port, imap_user, imap_password, imap_tls,
                push_config, push_url, template_name, filter_rules,
                enabled, sync_status, created_at, updated_at, enable_ai_spam_filter, auto_push
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'idle', ?, ?, ?, ?)
        `).bind(
            accountId,
            userKey,
            body.name,
            body.imap_host,
            body.imap_port || 993,
            body.imap_user,
            encryptedPassword,
            body.imap_tls !== false ? 1 : 0,
            pushConfigJson,
            body.push_url || null,
            body.template_name || null,
            filterRulesJson,
            now,
            now,
            body.enable_ai_spam_filter ? 1 : 0,
            body.auto_push !== false ? 1 : 0
        ).run();

        // 创建对应的定时任务（默认每 10 分钟）
        const pollMinutes = body.poll_interval || 10;
        const cronExpr = `*/${pollMinutes} * * * *`;
        const reminderId = 'rem_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

        await env.DB.prepare(`
            INSERT INTO reminders (
                id, user_key, title, content,
                schedule_type, schedule_cron, timezone,
                push_config, status, type, related_id,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'cron', ?, 'Asia/Shanghai', '{}', 'active', 'email_sync', ?, ?, ?)
        `).bind(
            reminderId,
            userKey,
            `📧 邮箱同步: ${body.name}`,
            `自动同步 ${body.imap_user}`,
            cronExpr,
            accountId,
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
    accountId: string,
    body: {
        name?: string;
        imap_host?: string;
        imap_port?: number;
        imap_user?: string;
        imap_password?: string;
        imap_tls?: boolean;
        push_config?: any;
        push_url?: string;
        template_name?: string;
        filter_rules?: ForwardRules;
        enabled?: boolean;
        poll_interval?: number;
        enable_ai_spam_filter?: boolean;
        auto_push?: boolean;
    }
): Promise<Response> {
    try {
        const now = Date.now();

        // 构建动态 UPDATE
        const updates: string[] = [];
        const values: any[] = [];

        if (body.name !== undefined) {
            updates.push('name = ?');
            values.push(body.name);
        }
        if (body.imap_host !== undefined) {
            updates.push('imap_host = ?');
            values.push(body.imap_host);
        }
        if (body.imap_port !== undefined) {
            updates.push('imap_port = ?');
            values.push(body.imap_port);
        }
        if (body.imap_user !== undefined) {
            updates.push('imap_user = ?');
            values.push(body.imap_user);
        }
        if (body.imap_password !== undefined) {
            const encrypted = await encryptPassword(
                body.imap_password,
                env.ENCRYPTION_KEY || 'default-key'
            );
            updates.push('imap_password = ?');
            values.push(encrypted);
        }
        if (body.imap_tls !== undefined) {
            updates.push('imap_tls = ?');
            values.push(body.imap_tls ? 1 : 0);
        }
        if (body.push_config !== undefined) {
            updates.push('push_config = ?');
            values.push(JSON.stringify(body.push_config));
        }
        if (body.push_url !== undefined) {
            updates.push('push_url = ?');
            values.push(body.push_url);
        }
        if (body.template_name !== undefined) {
            updates.push('template_name = ?');
            values.push(body.template_name);
        }
        if (body.filter_rules !== undefined) {
            updates.push('filter_rules = ?');
            values.push(JSON.stringify(body.filter_rules));
        }
        if (body.enabled !== undefined) {
            updates.push('enabled = ?');
            values.push(body.enabled ? 1 : 0);
        }
        if (body.enable_ai_spam_filter !== undefined) {
            updates.push('enable_ai_spam_filter = ?');
            values.push(body.enable_ai_spam_filter ? 1 : 0);
        }
        if (body.auto_push !== undefined) {
            updates.push('auto_push = ?');
            values.push(body.auto_push ? 1 : 0);
        }

        updates.push('updated_at = ?');
        values.push(now);
        values.push(accountId);

        if (updates.length === 1) {
            return error('没有需要更新的字段', 1, 400);
        }

        await env.DB.prepare(`
            UPDATE email_accounts SET ${updates.join(', ')} WHERE id = ?
        `).bind(...values).run();

        // 如果修改了轮询间隔，同步更新 reminders 表
        if (body.poll_interval !== undefined) {
            const cronExpr = `*/${body.poll_interval} * * * *`;
            await env.DB.prepare(`
                UPDATE reminders SET schedule_cron = ?, updated_at = ?
                WHERE type = 'email_sync' AND related_id = ?
            `).bind(cronExpr, now, accountId).run();
        }

        // 如果启用/禁用账户，同步更新任务状态
        if (body.enabled !== undefined) {
            const taskStatus = body.enabled ? 'active' : 'paused';
            await env.DB.prepare(`
                UPDATE reminders SET status = ?, updated_at = ?
                WHERE type = 'email_sync' AND related_id = ?
            `).bind(taskStatus, now, accountId).run();
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
export async function deleteEmailAccount(env: Env, accountId: string): Promise<Response> {
    try {
        // 先删除关联的定时任务
        await env.DB.prepare(`
            DELETE FROM reminders WHERE type = 'email_sync' AND related_id = ?
        `).bind(accountId).run();

        // 再删除账户
        const result = await env.DB.prepare(`
            DELETE FROM email_accounts WHERE id = ?
        `).bind(accountId).run();

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
export async function syncEmailAccountNow(env: Env, accountId: string): Promise<Response> {
    try {
        // 检查账户是否存在
        const account = await env.DB.prepare(`
            SELECT * FROM email_accounts WHERE id = ?
        `).bind(accountId).first<EmailAccount>();

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
