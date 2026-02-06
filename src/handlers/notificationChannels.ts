/**
 * Phase 1.3: 多渠道通知系统 - 后端API
 * 
 * 功能：
 * - 通知渠道 CRUD
 * - 渠道健康检查
 * - 推送历史查询
 */

import { Env, NotificationChannel, NotificationChannelType, ChannelConfig } from '../types';
import { success, badRequest, notFound, serverError } from '../utils/response';
import { createProvider, pushManager } from '../services/pushProviders';

/**
 * 获取通知渠道列表
 */
export async function listNotificationChannels(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const result = await env.DB.prepare(`
            SELECT 
                id, type, name, enabled, priority, daily_quota, daily_used,
                health_status, health_checked_at, created_at, updated_at
            FROM notification_channels 
            WHERE user_key = ?
            ORDER BY priority ASC, created_at DESC
        `).bind(userKey).all<NotificationChannel>();

        return success({
            items: result.results || [],
        });
    } catch (error) {
        console.error('获取通知渠道列表失败:', error);
        return serverError('获取通知渠道列表失败');
    }
}

/**
 * 创建通知渠道
 */
export async function createNotificationChannel(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const body = await request.json<{
            type: NotificationChannelType;
            name: string;
            config: ChannelConfig;
            priority?: number;
            daily_quota?: number;
        }>();

        const { type, name, config } = body;

        if (!type || !name || !config) {
            return badRequest('缺少必要参数: type, name, config');
        }

        // 验证渠道类型
        const provider = createProvider(type);
        if (!provider) {
            return badRequest(`不支持的通知渠道类型: ${type}`);
        }

        // 测试连接
        const healthCheck = await provider.checkHealth?.(config);
        if (healthCheck && !healthCheck.healthy) {
            return badRequest(`连接测试失败: ${healthCheck.error}`);
        }

        const now = Date.now();
        const result = await env.DB.prepare(`
            INSERT INTO notification_channels (
                user_key, type, name, config, enabled, priority,
                daily_quota, health_status, health_checked_at,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            userKey,
            type,
            name,
            JSON.stringify(config),
            1,
            body.priority || 0,
            body.daily_quota || 100,
            healthCheck?.healthy ? 'healthy' : 'unknown',
            healthCheck ? now : null,
            now,
            now
        ).run();

        if (!result.success) {
            return serverError('创建通知渠道失败');
        }

        return success({
            id: result.meta?.last_row_id,
            message: '通知渠道创建成功',
            health_check: healthCheck,
        });
    } catch (error) {
        console.error('创建通知渠道失败:', error);
        return serverError('创建通知渠道失败');
    }
}

/**
 * 更新通知渠道
 */
export async function updateNotificationChannel(
    id: string,
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const body = await request.json<Partial<{
            name: string;
            config: ChannelConfig;
            enabled: boolean;
            priority: number;
            daily_quota: number;
        }>>();

        // 验证渠道所有权
        const channel = await env.DB.prepare(`
            SELECT * FROM notification_channels WHERE id = ? AND user_key = ?
        `).bind(id, userKey).first<NotificationChannel>();

        if (!channel) {
            return notFound('通知渠道不存在');
        }

        const updates: string[] = [];
        const values: any[] = [];

        if (body.name !== undefined) {
            updates.push('name = ?');
            values.push(body.name);
        }
        if (body.config !== undefined) {
            updates.push('config = ?');
            values.push(JSON.stringify(body.config));
        }
        if (body.enabled !== undefined) {
            updates.push('enabled = ?');
            values.push(body.enabled ? 1 : 0);
        }
        if (body.priority !== undefined) {
            updates.push('priority = ?');
            values.push(body.priority);
        }
        if (body.daily_quota !== undefined) {
            updates.push('daily_quota = ?');
            values.push(body.daily_quota);
        }

        updates.push('updated_at = ?');
        values.push(Date.now());
        values.push(id);

        await env.DB.prepare(`
            UPDATE notification_channels 
            SET ${updates.join(', ')} 
            WHERE id = ?
        `).bind(...values).run();

        return success({ message: '通知渠道更新成功' });
    } catch (error) {
        console.error('更新通知渠道失败:', error);
        return serverError('更新通知渠道失败');
    }
}

/**
 * 删除通知渠道
 */
export async function deleteNotificationChannel(
    id: string,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const channel = await env.DB.prepare(`
            SELECT * FROM notification_channels WHERE id = ? AND user_key = ?
        `).bind(id, userKey).first<NotificationChannel>();

        if (!channel) {
            return notFound('通知渠道不存在');
        }

        await env.DB.prepare(`DELETE FROM notification_channels WHERE id = ?`).bind(id).run();

        return success({ message: '通知渠道删除成功' });
    } catch (error) {
        console.error('删除通知渠道失败:', error);
        return serverError('删除通知渠道失败');
    }
}

/**
 * 测试渠道连通性
 */
export async function testNotificationChannel(
    id: string,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const channel = await env.DB.prepare(`
            SELECT * FROM notification_channels WHERE id = ? AND user_key = ?
        `).bind(id, userKey).first<NotificationChannel>();

        if (!channel) {
            return notFound('通知渠道不存在');
        }

        const provider = createProvider(channel.type);
        if (!provider || !provider.checkHealth) {
            return badRequest('该渠道类型不支持健康检查');
        }

        const config = JSON.parse(channel.config as unknown as string) as ChannelConfig;
        const healthCheck = await provider.checkHealth(config);

        // 更新健康状态
        await env.DB.prepare(`
            UPDATE notification_channels 
            SET health_status = ?, health_checked_at = ? 
            WHERE id = ?
        `).bind(
            healthCheck.healthy ? 'healthy' : 'unhealthy',
            Date.now(),
            id
        ).run();

        // 记录健康日志
        await env.DB.prepare(`
            INSERT INTO channel_health_logs (channel_id, status, response_time_ms, error_message, checked_at)
            VALUES (?, ?, ?, ?, ?)
        `).bind(
            id,
            healthCheck.healthy ? 'healthy' : 'unhealthy',
            healthCheck.responseTimeMs,
            healthCheck.error || null,
            Date.now()
        ).run();

        return success({
            channel_id: id,
            healthy: healthCheck.healthy,
            response_time_ms: healthCheck.responseTimeMs,
            error: healthCheck.error,
        });
    } catch (error) {
        console.error('测试渠道连通性失败:', error);
        return serverError('测试渠道连通性失败');
    }
}

/**
 * 发送测试消息
 */
export async function sendTestMessage(
    id: string,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const channel = await env.DB.prepare(`
            SELECT * FROM notification_channels WHERE id = ? AND user_key = ?
        `).bind(id, userKey).first<NotificationChannel>();

        if (!channel) {
            return notFound('通知渠道不存在');
        }

        const provider = createProvider(channel.type);
        if (!provider) {
            return badRequest('不支持的通知渠道类型');
        }

        const config = JSON.parse(channel.config as unknown as string) as ChannelConfig;
        const result = await provider.send({
            title: '测试消息',
            content: '这是一条测试消息，如果您收到说明配置正确。',
            priority: 'normal',
        }, config);

        // 更新使用时间
        await env.DB.prepare(`
            UPDATE notification_channels 
            SET last_used_at = ? 
            WHERE id = ?
        `).bind(Date.now(), id).run();

        if (result.success) {
            return success({
                message: '测试消息发送成功',
                message_id: result.messageId,
            });
        } else {
            return badRequest(`发送失败: ${result.error}`);
        }
    } catch (error) {
        console.error('发送测试消息失败:', error);
        return serverError('发送测试消息失败');
    }
}

/**
 * 获取渠道健康历史
 */
export async function getChannelHealthHistory(
    request: Request,
    id: string,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '24'), 100);

        const channel = await env.DB.prepare(`
            SELECT * FROM notification_channels WHERE id = ? AND user_key = ?
        `).bind(id, userKey).first<NotificationChannel>();

        if (!channel) {
            return notFound('通知渠道不存在');
        }

        const result = await env.DB.prepare(`
            SELECT * FROM channel_health_logs 
            WHERE channel_id = ? 
            ORDER BY checked_at DESC 
            LIMIT ?
        `).bind(id, limit).all();

        return success({
            channel_id: id,
            items: result.results || [],
        });
    } catch (error) {
        console.error('获取渠道健康历史失败:', error);
        return serverError('获取渠道健康历史失败');
    }
}

/**
 * 获取推送追踪列表
 */
export async function listPushTracking(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const status = url.searchParams.get('status');
        const channelId = url.searchParams.get('channel_id');

        let query = `
            SELECT pt.*, nc.name as channel_name, nc.type as channel_type_name
            FROM push_tracking pt
            JOIN notification_channels nc ON pt.channel_id = nc.id
            WHERE nc.user_key = ?
        `;
        const params: any[] = [userKey];

        if (status) {
            query += ` AND pt.status = ?`;
            params.push(status);
        }

        if (channelId) {
            query += ` AND pt.channel_id = ?`;
            params.push(channelId);
        }

        query += ` ORDER BY pt.created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const result = await env.DB.prepare(query).bind(...params).all();

        // 查询总数
        let countQuery = `
            SELECT COUNT(*) as total 
            FROM push_tracking pt
            JOIN notification_channels nc ON pt.channel_id = nc.id
            WHERE nc.user_key = ?
        `;
        const countParams: any[] = [userKey];

        if (status) {
            countQuery += ` AND pt.status = ?`;
            countParams.push(status);
        }

        if (channelId) {
            countQuery += ` AND pt.channel_id = ?`;
            countParams.push(channelId);
        }

        const countResult = await env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>();

        return success({
            items: result.results || [],
            total: countResult?.total || 0,
            limit,
            offset,
        });
    } catch (error) {
        console.error('获取推送追踪列表失败:', error);
        return serverError('获取推送追踪列表失败');
    }
}

/**
 * 手动重试失败的推送
 */
export async function retryPush(
    id: string,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        // 验证推送记录所有权
        const tracking = await env.DB.prepare(`
            SELECT pt.* FROM push_tracking pt
            JOIN notification_channels nc ON pt.channel_id = nc.id
            WHERE pt.id = ? AND nc.user_key = ?
        `).bind(id, userKey).first();

        if (!tracking) {
            return notFound('推送记录不存在');
        }

        // 更新状态为待重试
        await env.DB.prepare(`
            UPDATE push_tracking 
            SET status = 'pending', retry_count = retry_count + 1, next_retry_at = ?
            WHERE id = ?
        `).bind(Date.now(), id).run();

        return success({ message: '已加入重试队列' });
    } catch (error) {
        console.error('重试推送失败:', error);
        return serverError('重试推送失败');
    }
}
