/**
 * 邮件转发设置处理器
 * @author zhangws
 * 
 * 提供用户邮件转发配置的 CRUD 操作
 */

import { Env, EmailSettings, EmailForwardLog } from '../types';
import { success, badRequest, notFound, serverError } from '../utils/response';
import { encryptPassword } from '../utils/crypto';
import { sendPush } from '../services/pusher';

/**
 * 邮件设置响应接口
 */
interface EmailSettingsResponse {
    enabled: boolean;
    email_address: string | null;
    wxpush_token: string | null;
    wxpush_url: string | null;
    forward_rules: string | null;

    // IMAP Settings
    enable_imap: boolean;
    imap_host: string | null;
    imap_port: number | null;
    imap_user: string | null;
    imap_tls: boolean;
    last_sync_at: string | null;
    sync_status: string | null;
    sync_error: string | null;

    total_forwarded: number;
    last_forwarded_at: string | null;
}

/**
 * 获取用户的邮件转发设置
 */
export async function getEmailSettings(env: Env, userKey: string): Promise<Response> {
    try {
        const settings = await env.DB.prepare(`
            SELECT * FROM user_email_settings WHERE user_key = ?
        `).bind(userKey).first<EmailSettings>();

        if (!settings) {
            // 返回默认设置
            return success({
                enabled: false,
                email_address: null,
                wxpush_token: null,
                wxpush_url: null,
                forward_rules: null,
                push_config: null,
                template_name: null,

                enable_imap: false,
                imap_host: null,
                imap_port: 993,
                imap_user: null,
                imap_tls: true,
                last_sync_at: null,
                sync_status: null,
                sync_error: null,

                total_forwarded: 0,
                last_forwarded_at: null,
            } as EmailSettingsResponse);
        }

        return success({
            enabled: settings.enabled === 1,
            email_address: settings.email_address,
            wxpush_token: settings.wxpush_token ? '***' + settings.wxpush_token.slice(-4) : null, // 脱敏处理
            wxpush_url: settings.wxpush_url,

            forward_rules: settings.forward_rules,
            push_config: settings.push_config ? JSON.parse(settings.push_config) : null,
            template_name: settings.template_name,

            enable_imap: settings.enable_imap === 1,
            imap_host: settings.imap_host,
            imap_port: settings.imap_port,
            imap_user: settings.imap_user,
            imap_tls: settings.imap_tls === 1,
            last_sync_at: settings.last_sync_at ? new Date(settings.last_sync_at).toISOString() : null,
            sync_status: settings.sync_status,
            sync_error: settings.sync_error,

            total_forwarded: settings.total_forwarded || 0,
            last_forwarded_at: settings.last_forwarded_at
                ? new Date(settings.last_forwarded_at).toISOString()
                : null,
        } as EmailSettingsResponse);
    } catch (error) {
        console.error('获取邮件设置失败:', error);
        return serverError('获取邮件设置失败');
    }
}

/**
 * 更新邮件转发设置请求体
 */
interface UpdateEmailSettingsRequest {
    enabled?: boolean;
    wxpush_token?: string;
    wxpush_url?: string;
    forward_rules?: string;
    push_config?: {
        appid: string;
        secret: string;
        userid: string;
        template_id: string;
    } | null;
    template_name?: string | null;

    enable_imap?: boolean;
    imap_host?: string;
    imap_port?: number;
    imap_user?: string;
    imap_password?: string;
    imap_tls?: boolean;
}

/**
 * 更新用户的邮件转发设置
 */
export async function updateEmailSettings(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const body = await request.json() as UpdateEmailSettingsRequest;
        const {
            enabled, wxpush_token, wxpush_url, forward_rules, push_config, template_name,
            enable_imap, imap_host, imap_port, imap_user, imap_password, imap_tls
        } = body;

        // 检查是否已存在设置
        const existing = await env.DB.prepare(`
            SELECT id FROM user_email_settings WHERE user_key = ?
        `).bind(userKey).first();

        const now = Date.now();

        if (existing) {
            // 更新现有设置
            const updates: string[] = [];
            const values: any[] = [];

            if (enabled !== undefined) {
                updates.push('enabled = ?');
                values.push(enabled ? 1 : 0);
            }
            if (wxpush_token !== undefined) {
                updates.push('wxpush_token = ?');
                values.push(wxpush_token);
            }
            if (wxpush_url !== undefined) {
                updates.push('wxpush_url = ?');
                values.push(wxpush_url);
            }
            if (forward_rules !== undefined) {
                updates.push('forward_rules = ?');
                values.push(forward_rules);
            }
            if (push_config !== undefined) {
                updates.push('push_config = ?');
                values.push(push_config ? JSON.stringify(push_config) : null);
            }
            if (template_name !== undefined) {
                updates.push('template_name = ?');
                values.push(template_name);
            }
            if (enable_imap !== undefined) {
                updates.push('enable_imap = ?');
                values.push(enable_imap ? 1 : 0);
            }
            if (imap_host !== undefined) {
                updates.push('imap_host = ?');
                values.push(imap_host);
            }
            if (imap_port !== undefined) {
                updates.push('imap_port = ?');
                values.push(imap_port);
            }
            if (imap_user !== undefined) {
                updates.push('imap_user = ?');
                values.push(imap_user);
            }
            if (imap_password) {
                const secret = env.ENCRYPTION_KEY || env.API_KEYS;
                const encryptedPwd = await encryptPassword(imap_password, secret);
                updates.push('imap_password = ?');
                values.push(encryptedPwd);
            }
            if (imap_tls !== undefined) {
                updates.push('imap_tls = ?');
                values.push(imap_tls ? 1 : 0);
            }

            if (updates.length === 0) {
                return badRequest('没有提供要更新的字段');
            }

            updates.push('updated_at = ?');
            values.push(now);
            values.push(userKey);

            await env.DB.prepare(`
                UPDATE user_email_settings 
                SET ${updates.join(', ')}
                WHERE user_key = ?
            `).bind(...values).run();
        } else {
            // 创建新设置
            // 生成唯一的邮件地址 (基于 userKey 的哈希)
            const emailAddress = await generateEmailAddress(userKey, env);

            await env.DB.prepare(`
                INSERT INTO user_email_settings (
                    user_key, enabled, email_address, wxpush_token, wxpush_url, 
                    forward_rules, push_config, template_name,
                    enable_imap, imap_host, imap_port, imap_user, imap_password, imap_tls,
                    total_forwarded, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            `).bind(
                userKey,
                enabled ? 1 : 0,
                emailAddress,
                wxpush_token || null,
                wxpush_url || null,
                forward_rules || null,
                push_config ? JSON.stringify(push_config) : null,
                template_name || null,
                enable_imap ? 1 : 0,
                imap_host || null,
                imap_port || 993,
                imap_user || null,
                imap_password ? await encryptPassword(imap_password, env.ENCRYPTION_KEY || env.API_KEYS) : null,
                imap_tls !== false ? 1 : 0,
                now,
                now
            ).run();
        }

        // 返回更新后的设置
        return getEmailSettings(env, userKey);
    } catch (error) {
        console.error('更新邮件设置失败:', error);
        return serverError('更新邮件设置失败');
    }
}

/**
 * 生成用户专属的邮件接收地址
 * 格式: {hash}@{domain}
 */
async function generateEmailAddress(userKey: string, env: Env): Promise<string> {
    // 使用 userKey 生成一个短的唯一标识
    const encoder = new TextEncoder();
    const data = encoder.encode(userKey + '-neverforget');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join('');

    // 使用环境变量中的域名，默认为 neverforget.email
    const domain = env.EMAIL_DOMAIN || 'neverforget.email';

    return `nf-${hashHex}@${domain}`;
}

/**
 * 获取邮件转发日志
 */
export async function getEmailLogs(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
        const offset = parseInt(url.searchParams.get('offset') || '0');

        // 查询日志
        const result = await env.DB.prepare(`
            SELECT * FROM email_forward_logs 
            WHERE user_key = ?
            ORDER BY received_at DESC
            LIMIT ? OFFSET ?
        `).bind(userKey, limit, offset).all<EmailForwardLog>();

        // 查询总数
        const countResult = await env.DB.prepare(`
            SELECT COUNT(*) as total FROM email_forward_logs WHERE user_key = ?
        `).bind(userKey).first<{ total: number }>();

        // 格式化日志
        const logs = (result.results || []).map(log => ({
            id: log.id,
            from_address: log.from_address,
            subject: log.subject,
            received_at: new Date(log.received_at).toISOString(),
            status: log.status,
            error: log.error,
            processed_at: new Date(log.processed_at).toISOString(),
        }));

        return success({
            total: countResult?.total || 0,
            items: logs,
        });
    } catch (error) {
        console.error('获取邮件日志失败:', error);
        return serverError('获取邮件日志失败');
    }
}

/**
 * 测试邮件转发配置
 * 发送一封测试推送验证配置是否有效
 * 
 * 注意：此功能使用 go-wxpush 服务（/wxpush 接口）进行推送
 * wxpush_token 在此场景下实际上是用于标识用户的 Token/UID
 * 需要在 go-wxpush 服务端配置对应的微信推送凭据
 */
export async function testEmailForward(env: Env, userKey: string): Promise<Response> {
    try {
        // 获取用户设置
        const settings = await env.DB.prepare(`
            SELECT * FROM user_email_settings WHERE user_key = ?
        `).bind(userKey).first<EmailSettings>();

        if (!settings) {
            return badRequest('请先配置邮件转发设置');
        }

        if (!settings.wxpush_token) {
            return badRequest('请先配置 WxPush Token');
        }

        // 使用 go-wxpush 服务发送测试推送
        const pushServiceUrl = (settings.wxpush_url || env.PUSH_SERVICE_URL || '').trim();
        if (!pushServiceUrl) {
            return badRequest('请先配置 WxPush URL');
        }

        // 检测是否为 WxPusher 官方地址
        const isOfficialWxPusher = pushServiceUrl.includes('wxpusher.zjiecode.com');

        if (isOfficialWxPusher) {
            return badRequest('使用 WxPusher 官方服务需要配置 AppToken。建议使用自建的 go-wxpush 服务，或在 WxPush URL 中填写您的 go-wxpush 服务地址。');
        }

        // 确定推送配置优先级：
        // 1. 邮件设置中的 push_config
        // 2. 提醒任务中的默认 push_config
        let pushConfig: { appid?: string; secret?: string; userid?: string; template_id?: string } = {};

        // 1. 尝试使用邮件设置中的配置
        if (settings.push_config) {
            try {
                pushConfig = JSON.parse(settings.push_config);
            } catch (e) {
                // 忽略解析错误
            }
        }

        // 2. 如果没有特定配置，回退到提醒任务的默认配置
        if (!pushConfig.userid && !pushConfig.appid) {
            const reminderConfig = await env.DB.prepare(`
                SELECT push_config FROM reminders WHERE user_key = ? LIMIT 1
            `).bind(userKey).first<{ push_config: string }>();

            if (reminderConfig?.push_config) {
                try {
                    const parsed = JSON.parse(reminderConfig.push_config);
                    pushConfig = { ...pushConfig, ...parsed };
                } catch (e) {
                    // 忽略解析错误
                }
            }
        }

        const pushResult = await sendPush(
            pushServiceUrl,
            {
                appid: pushConfig.appid || '',
                secret: pushConfig.secret || '',
                userid: pushConfig.userid || settings.wxpush_token,
                template_id: pushConfig.template_id || '',
                base_url: pushServiceUrl,
                template_name: settings.template_name || undefined,
            },
            'NeverForget 测试推送',
            '🎉 邮件转发测试成功！\n\n您的邮件转发功能已正确配置，当有邮件发送到您的专属邮箱时，将自动转发到此处。\n\n专属邮箱地址：' + (settings.email_address || '尚未分配'),
        );

        if (pushResult.success) {
            return success({
                message: '测试推送已发送，请检查您的微信',
                email_address: settings.email_address,
            });
        }

        return badRequest(`推送失败: ${pushResult.error || '未知错误'}`);
    } catch (error) {
        console.error('测试邮件转发失败:', error);
        return serverError('测试邮件转发失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
}

