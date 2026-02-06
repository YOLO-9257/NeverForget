/**
 * 配置项管理处理器
 * @author zhangws
 * 
 * 提供通用配置项的 CRUD 操作
 * 用于存储用户常用的 UserID, TemplateID 等
 */

import { Env } from '../types';
import { success, badRequest, serverError, notFound } from '../utils/response';

export interface SavedConfig {
    id: number;
    category: string;
    name: string;
    value: string;
    created_at: number;
}

/**
 * 获取指定分类的配置列表
 */
export async function listConfigs(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const url = new URL(request.url);
        const category = url.searchParams.get('category');

        if (!category) {
            return badRequest('缺少 category 参数');
        }

        const configs = await env.DB.prepare(`
            SELECT * FROM saved_configs 
            WHERE user_key = ? AND category = ?
            ORDER BY created_at DESC
        `).bind(userKey, category).all<SavedConfig>();

        return success(configs.results || []);
    } catch (error) {
        console.error('获取配置列表失败:', error);
        return serverError('获取配置列表失败');
    }
}

/**
 * 添加配置项
 */
export async function createConfig(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const body = await request.json() as { category: string; name: string; value: string };
        const { category, name, value } = body;

        if (!category || !name || !value) {
            return badRequest('缺少必要参数');
        }

        const now = Date.now();
        const result = await env.DB.prepare(`
            INSERT INTO saved_configs (user_key, category, name, value, created_at)
            VALUES (?, ?, ?, ?, ?)
        `).bind(userKey, category, name, value, now).run();

        return success({
            id: result.meta.last_row_id,
            category,
            name,
            value,
            created_at: now
        });
    } catch (error) {
        console.error('创建配置项失败:', error);
        return serverError('创建配置项失败');
    }
}

/**
 * 删除配置项
 */
export async function deleteConfig(
    id: string,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const result = await env.DB.prepare(`
            DELETE FROM saved_configs 
            WHERE id = ? AND user_key = ?
        `).bind(id, userKey).run();

        if (result.meta.changes > 0) {
            return success({ message: '已删除' });
        } else {
            return notFound('未找到该配置项');
        }
    } catch (error) {
        console.error('删除配置项失败:', error);
        return serverError('删除配置项失败');
    }
}
