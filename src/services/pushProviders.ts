/**
 * Phase 1.3: 多渠道通知系统 - Provider 实现
 * 
 * 支持的渠道：
 * - 企业微信 (wechat_work)
 * - 钉钉 (dingtalk)
 * - 飞书 (feishu)
 * - Webhook
 * - 邮件 (email)
 */

import { NotificationChannelType, ChannelConfig, PushTracking } from '../types';

export interface PushMessage {
    title: string;
    content: string;
    url?: string;
    priority?: 'high' | 'normal' | 'low';
}

export interface PushResult {
    success: boolean;
    messageId?: string;
    error?: string;
    response?: any;
}

export interface PushProvider {
    name: string;
    type: NotificationChannelType;
    send(message: PushMessage, config: ChannelConfig): Promise<PushResult>;
    checkHealth?(config: ChannelConfig): Promise<{ healthy: boolean; responseTimeMs: number; error?: string }>;
}

// ==========================================
// 企业微信 Provider
// ==========================================

export class WechatWorkProvider implements PushProvider {
    name = '企业微信';
    type: NotificationChannelType = 'wechat_work';

    async send(message: PushMessage, config: ChannelConfig): Promise<PushResult> {
        try {
            const { corp_id, corp_secret, agent_id } = config;
            if (!corp_id || !corp_secret || !agent_id) {
                return { success: false, error: '缺少企业微信配置参数' };
            }

            // 1. 获取 access_token
            const tokenRes = await fetch(
                `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corp_id}&corpsecret=${corp_secret}`
            );
            const tokenData = await tokenRes.json() as { errcode: number; errmsg: string; access_token?: string };

            if (tokenData.errcode !== 0) {
                return { success: false, error: `获取Token失败: ${tokenData.errmsg}` };
            }

            // 2. 发送消息
            const pushRes = await fetch(
                `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${tokenData.access_token}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        touser: '@all',
                        msgtype: 'text',
                        agentid: agent_id,
                        text: {
                            content: `${message.title}\n\n${message.content}${message.url ? `\n\n查看详情: ${message.url}` : ''}`
                        }
                    })
                }
            );

            const pushData = await pushRes.json() as { errcode: number; errmsg: string; msgid?: string };

            if (pushData.errcode === 0) {
                return {
                    success: true,
                    messageId: pushData.msgid,
                    response: pushData
                };
            } else {
                return {
                    success: false,
                    error: `发送失败: ${pushData.errmsg}`,
                    response: pushData
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : '未知错误'
            };
        }
    }

    async checkHealth(config: ChannelConfig): Promise<{ healthy: boolean; responseTimeMs: number; error?: string }> {
        const start = Date.now();
        try {
            const { corp_id, corp_secret } = config;
            if (!corp_id || !corp_secret) {
                return { healthy: false, responseTimeMs: 0, error: '配置不完整' };
            }

            const res = await fetch(
                `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corp_id}&corpsecret=${corp_secret}`
            );
            const data = await res.json() as { errcode: number; errmsg: string };
            const responseTimeMs = Date.now() - start;

            if (data.errcode === 0) {
                return { healthy: true, responseTimeMs };
            } else {
                return { healthy: false, responseTimeMs, error: data.errmsg };
            }
        } catch (error) {
            return { 
                healthy: false, 
                responseTimeMs: Date.now() - start, 
                error: error instanceof Error ? error.message : '网络错误' 
            };
        }
    }
}

// ==========================================
// 钉钉 Provider
// ==========================================

export class DingTalkProvider implements PushProvider {
    name = '钉钉';
    type: NotificationChannelType = 'dingtalk';

    async send(message: PushMessage, config: ChannelConfig): Promise<PushResult> {
        try {
            const { webhook_url, secret, at_all, at_mobiles } = config;
            if (!webhook_url) {
                return { success: false, error: '缺少Webhook地址' };
            }

            // 生成签名（如果需要）
            let finalUrl = webhook_url;
            if (secret) {
                const timestamp = Date.now();
                const sign = await this.generateSign(timestamp, secret);
                finalUrl = `${webhook_url}&timestamp=${timestamp}&sign=${sign}`;
            }

            const pushRes = await fetch(finalUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    msgtype: 'markdown',
                    markdown: {
                        title: message.title,
                        text: `### ${message.title}\n\n${message.content}${message.url ? `\n\n[查看详情](${message.url})` : ''}`
                    },
                    at: {
                        isAtAll: at_all || false,
                        atMobiles: at_mobiles || []
                    }
                })
            });

            const pushData = await pushRes.json() as { errcode: number; errmsg: string; msgid?: string };

            if (pushData.errcode === 0) {
                return {
                    success: true,
                    messageId: pushData.msgid,
                    response: pushData
                };
            } else {
                return {
                    success: false,
                    error: `发送失败: ${pushData.errmsg}`,
                    response: pushData
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : '未知错误'
            };
        }
    }

    private async generateSign(timestamp: number, secret: string): Promise<string> {
        const crypto = await import('../utils/crypto');
        const stringToSign = `${timestamp}\n${secret}`;
        const hmac = await crypto.hmacSha256Base64(stringToSign, secret);
        return encodeURIComponent(hmac);
    }

    async checkHealth(config: ChannelConfig): Promise<{ healthy: boolean; responseTimeMs: number; error?: string }> {
        const start = Date.now();
        try {
            const { webhook_url } = config;
            if (!webhook_url) {
                return { healthy: false, responseTimeMs: 0, error: '配置不完整' };
            }

            // 发送一个测试消息
            const res = await fetch(webhook_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    msgtype: 'text',
                    text: { content: '连接测试' }
                })
            });
            const data = await res.json() as { errcode: number; errmsg: string };
            const responseTimeMs = Date.now() - start;

            // 钉钉即使配置错误也会返回200，需要检查errcode
            if (data.errcode === 0 || data.errcode === 310000) { // 310000是签名错误，说明地址有效
                return { healthy: true, responseTimeMs };
            } else {
                return { healthy: false, responseTimeMs, error: data.errmsg };
            }
        } catch (error) {
            return { 
                healthy: false, 
                responseTimeMs: Date.now() - start, 
                error: error instanceof Error ? error.message : '网络错误' 
            };
        }
    }
}

// ==========================================
// 飞书 Provider
// ==========================================

export class FeishuProvider implements PushProvider {
    name = '飞书';
    type: NotificationChannelType = 'feishu';

    async send(message: PushMessage, config: ChannelConfig): Promise<PushResult> {
        try {
            const { webhook_url, secret } = config;
            if (!webhook_url) {
                return { success: false, error: '缺少Webhook地址' };
            }

            // 生成签名
            const timestamp = Math.floor(Date.now() / 1000);
            const sign = secret ? await this.generateSign(timestamp, secret) : '';

            const pushRes = await fetch(webhook_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    timestamp: timestamp.toString(),
                    sign,
                    msg_type: 'interactive',
                    card: {
                        header: {
                            title: {
                                tag: 'plain_text',
                                content: message.title
                            }
                        },
                        elements: [
                            {
                                tag: 'div',
                                text: {
                                    tag: 'lark_md',
                                    content: message.content
                                }
                            },
                            ...(message.url ? [{
                                tag: 'action',
                                actions: [{
                                    tag: 'button',
                                    text: {
                                        tag: 'plain_text',
                                        content: '查看详情'
                                    },
                                    url: message.url,
                                    type: 'primary'
                                }]
                            }] : [])
                        ]
                    }
                })
            });

            const pushData = await pushRes.json() as { code: number; msg: string; data?: { message_id?: string } };

            if (pushData.code === 0) {
                return {
                    success: true,
                    messageId: pushData.data?.message_id,
                    response: pushData
                };
            } else {
                return {
                    success: false,
                    error: `发送失败: ${pushData.msg}`,
                    response: pushData
                };
            }
        } catch (error) {
            return { 
                success: false, 
                error: error instanceof Error ? error.message : '未知错误' 
            };
        }
    }

    private async generateSign(timestamp: number, secret: string): Promise<string> {
        const crypto = await import('../utils/crypto');
        const stringToSign = `${timestamp}\n${secret}`;
        return await crypto.hmacSha256Base64(stringToSign, secret);
    }

    async checkHealth(config: ChannelConfig): Promise<{ healthy: boolean; responseTimeMs: number; error?: string }> {
        const start = Date.now();
        try {
            const { webhook_url } = config;
            if (!webhook_url) {
                return { healthy: false, responseTimeMs: 0, error: '配置不完整' };
            }

            const res = await fetch(webhook_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    msg_type: 'text',
                    content: { text: '连接测试' }
                })
            });
            const data = await res.json() as { code: number; msg: string };
            const responseTimeMs = Date.now() - start;

            if (data.code === 0 || data.code === 9499) { // 9499是签名错误，说明地址有效
                return { healthy: true, responseTimeMs };
            } else {
                return { healthy: false, responseTimeMs, error: data.msg };
            }
        } catch (error) {
            return {
                healthy: false,
                responseTimeMs: Date.now() - start,
                error: error instanceof Error ? error.message : '网络错误'
            };
        }
    }
}

// ==========================================
// Webhook Provider
// ==========================================

export class WebhookProvider implements PushProvider {
    name = 'Webhook';
    type: NotificationChannelType = 'webhook';

    async send(message: PushMessage, config: ChannelConfig): Promise<PushResult> {
        try {
            const { url, method = 'POST', headers = {}, secret } = config;
            if (!url) {
                return { success: false, error: '缺少Webhook地址' };
            }

            const payload = {
                title: message.title,
                content: message.content,
                url: message.url,
                priority: message.priority,
                timestamp: Date.now()
            };

            // 如果有密钥，添加签名
            const requestHeaders: Record<string, string> = { ...headers };
            if (secret) {
                const crypto = await import('../utils/crypto');
                const signature = await crypto.hmacSha256Base64(JSON.stringify(payload), secret);
                requestHeaders['X-Signature'] = signature;
            }

            const pushRes = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...requestHeaders
                },
                body: JSON.stringify(payload)
            });

            const responseText = await pushRes.text();

            if (pushRes.ok) {
                return { 
                    success: true, 
                    response: responseText 
                };
            } else {
                return { 
                    success: false, 
                    error: `HTTP ${pushRes.status}: ${responseText}` 
                };
            }
        } catch (error) {
            return { 
                success: false, 
                error: error instanceof Error ? error.message : '未知错误' 
            };
        }
    }

    async checkHealth(config: ChannelConfig): Promise<{ healthy: boolean; responseTimeMs: number; error?: string }> {
        const start = Date.now();
        try {
            const { url } = config;
            if (!url) {
                return { healthy: false, responseTimeMs: 0, error: '配置不完整' };
            }

            const res = await fetch(url, {
                method: 'HEAD'
            });
            const responseTimeMs = Date.now() - start;

            // 即使返回404/405也可能表示服务在运行
            if (res.status < 500) {
                return { healthy: true, responseTimeMs };
            } else {
                return { healthy: false, responseTimeMs, error: `HTTP ${res.status}` };
            }
        } catch (error) {
            return { 
                healthy: false, 
                responseTimeMs: Date.now() - start, 
                error: error instanceof Error ? error.message : '网络错误' 
            };
        }
    }
}

// ==========================================
// Provider 工厂
// ==========================================

export function createProvider(type: NotificationChannelType): PushProvider | null {
    switch (type) {
        case 'wechat_work':
            return new WechatWorkProvider();
        case 'dingtalk':
            return new DingTalkProvider();
        case 'feishu':
            return new FeishuProvider();
        case 'webhook':
            return new WebhookProvider();
        default:
            return null;
    }
}

// ==========================================
// 推送管理器
// ==========================================

export class PushManager {
    async sendToChannel(
        env: any,
        channelId: number,
        message: PushMessage,
        messageId: string,
        messageType: 'email' | 'reminder'
    ): Promise<PushResult> {
        // 获取渠道配置
        const channel = await env.DB.prepare(`
            SELECT * FROM notification_channels WHERE id = ? AND enabled = 1
        `).bind(channelId).first();

        if (!channel) {
            return { success: false, error: '通知渠道不存在或已禁用' };
        }

        // 检查每日限额
        const today = new Date().toISOString().split('T')[0];
        if (channel.daily_used >= channel.daily_quota) {
            return { success: false, error: '超出每日发送限额' };
        }

        // 创建推送追踪记录
        const trackingId = await this.createTrackingRecord(env, {
            message_id: messageId,
            message_type: messageType,
            channel_id: channelId,
            channel_type: channel.type,
            title: message.title,
            content_preview: message.content.substring(0, 200),
        });

        // 获取Provider并发送
        const provider = createProvider(channel.type);
        if (!provider) {
            await this.updateTrackingStatus(env, trackingId, 'failed', '不支持的渠道类型');
            return { success: false, error: '不支持的渠道类型' };
        }

        const config = JSON.parse(channel.config);
        const result = await provider.send(message, config);

        // 更新追踪记录
        if (result.success) {
            await this.updateTrackingStatus(env, trackingId, 'sent', undefined, result.messageId, result.response);
            
            // 更新渠道使用统计
            await env.DB.prepare(`
                UPDATE notification_channels 
                SET daily_used = daily_used + 1, last_used_at = ? 
                WHERE id = ?
            `).bind(Date.now(), channelId).run();
        } else {
            await this.updateTrackingStatus(env, trackingId, 'failed', result.error);
        }

        return result;
    }

    private async createTrackingRecord(
        env: any,
        data: Partial<PushTracking>
    ): Promise<number> {
        const result = await env.DB.prepare(`
            INSERT INTO push_tracking (
                message_id, message_type, channel_id, channel_type,
                title, content_preview, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
        `).bind(
            data.message_id,
            data.message_type,
            data.channel_id,
            data.channel_type,
            data.title,
            data.content_preview,
            Date.now()
        ).run();

        return result.meta?.last_row_id;
    }

    private async updateTrackingStatus(
        env: any,
        trackingId: number,
        status: string,
        errorMessage?: string,
        providerMessageId?: string,
        providerResponse?: any
    ): Promise<void> {
        const now = Date.now();
        let updateFields = 'status = ?';
        const params: any[] = [status];

        if (status === 'sent') {
            updateFields += ', sent_at = ?';
            params.push(now);
        } else if (status === 'failed') {
            updateFields += ', failed_at = ?';
            params.push(now);
        }

        if (errorMessage) {
            updateFields += ', error_message = ?';
            params.push(errorMessage);
        }

        if (providerMessageId) {
            updateFields += ', provider_message_id = ?';
            params.push(providerMessageId);
        }

        if (providerResponse) {
            updateFields += ', provider_response = ?';
            params.push(JSON.stringify(providerResponse));
        }

        params.push(trackingId);

        await env.DB.prepare(`
            UPDATE push_tracking SET ${updateFields} WHERE id = ?
        `).bind(...params).run();
    }
}

export const pushManager = new PushManager();
