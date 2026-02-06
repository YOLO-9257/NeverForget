/**
 * Cloudflare Email Worker - 邮件接收与转发处理
 * @author zhangws
 * 
 * 功能：
 * - 接收发送到用户专属邮箱的邮件
 * - 解析邮件内容并转发到 WxPush
 * - 记录转发日志
 * 
 * 部署说明：
 * 1. 在 Cloudflare Dashboard 配置 Email Routing
 * 2. 将此 Worker 绑定为邮件处理程序
 */

import { Env, EmailSettings, ForwardRules, EmailData } from '../types';
import { shouldForwardEmail, forwardEmailToPush, logAndFinishForward } from '../services/emailService';

/**
 * 邮件消息接口 (Cloudflare Email Workers)
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
 * 解析邮件内容
 */
async function parseEmailContent(raw: ReadableStream): Promise<{ subject: string; body: string }> {
    const reader = raw.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }

    const rawContent = new TextDecoder().decode(
        new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0))
    );

    // 简单解析邮件头部和正文
    const parts = rawContent.split('\r\n\r\n');
    const headers = parts[0] || '';
    const body = parts.slice(1).join('\r\n\r\n') || '';

    // 提取 Subject
    const subjectMatch = headers.match(/^Subject:\s*(.+)$/im);
    const subject = subjectMatch ? decodeEmailHeader(subjectMatch[1].trim()) : '(无主题)';

    // 清理正文内容 (移除 HTML 标签等)
    const cleanBody = stripHtmlTags(body).substring(0, 2000); // 限制长度

    return { subject, body: cleanBody };
}

/**
 * 解码邮件头部编码 (如 =?UTF-8?B?xxx?=)
 */
function decodeEmailHeader(header: string): string {
    // 处理 Base64 编码
    const base64Match = header.match(/=\?([^?]+)\?[Bb]\?([^?]+)\?=/);
    if (base64Match) {
        try {
            const decoded = atob(base64Match[2]);
            return new TextDecoder(base64Match[1]).decode(
                Uint8Array.from(decoded, c => c.charCodeAt(0))
            );
        } catch {
            return header;
        }
    }

    // 处理 Quoted-Printable 编码
    const qpMatch = header.match(/=\?([^?]+)\?[Qq]\?([^?]+)\?=/);
    if (qpMatch) {
        try {
            const decoded = qpMatch[2].replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
                String.fromCharCode(parseInt(hex, 16))
            ).replace(/_/g, ' ');
            return decoded;
        } catch {
            return header;
        }
    }

    return header;
}

/**
 * 移除 HTML 标签
 */
function stripHtmlTags(html: string): string {
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * 邮件处理入口
 */
export async function handleEmail(message: EmailMessage, env: Env): Promise<void> {
    const toAddress = message.to;
    const fromAddress = message.from;

    console.log(`[Email Worker] 接收邮件: from=${fromAddress}, to=${toAddress}`);

    try {
        // 根据收件地址查找用户设置
        const settings = await env.DB.prepare(`
            SELECT * FROM user_email_settings 
            WHERE email_address = ? AND enabled = 1
        `).bind(toAddress).first<EmailSettings>();

        if (!settings) {
            console.log(`[Email Worker] 未找到启用的邮件转发配置: ${toAddress}`);
            message.setReject('550 User not found or email forwarding disabled');
            return;
        }

        // 解析邮件内容
        const { subject, body } = await parseEmailContent(message.raw);

        const emailData: EmailData = {
            from: fromAddress,
            subject: subject,
            content: body,
            received_at: Date.now()
        };

        // 检查转发规则（如果有）
        if (settings.forward_rules) {
            try {
                const rules = JSON.parse(settings.forward_rules) as ForwardRules;
                if (!shouldForwardEmail(emailData, rules)) {
                    console.log(`[Email Worker] 邮件被过滤规则拦截: ${subject}`);
                    return;
                }
            } catch (e) {
                console.warn('[Email Worker] 转发规则解析失败:', e);
            }
        }

        // 发送到 WxPush
        const result = await forwardEmailToPush(env, settings, emailData);

        // 记录日志并更新统计
        await logAndFinishForward(
            env,
            settings.user_key,
            emailData,
            result.success,
            result.response,
            result.error
        );

        if (!result.success) {
            console.error(`[Email Worker] 邮件转发失败: ${result.error}`);
        } else {
            console.log(`[Email Worker] 邮件转发成功: ${toAddress} -> WxPush`);
        }
    } catch (error) {
        console.error('[Email Worker] 处理邮件失败:', error);
        message.setReject('550 Internal server error');
    }
}
