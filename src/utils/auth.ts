/**
 * 认证工具
 */

import { Env } from '../types';
import { unauthorized } from './response';

/**
 * 从请求头中提取 API Key
 */
export function extractApiKey(request: Request): string | null {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return null;

    // 支持 "Bearer <key>" 和直接的 "<key>" 格式
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }
    return authHeader;
}

/**
 * 验证 API Key
 */
export function validateApiKey(apiKey: string | null, env: Env): boolean {
    if (!apiKey || !env.API_KEYS) return false;

    const validKeys = env.API_KEYS.split(',').map(k => k.trim());
    return validKeys.includes(apiKey);
}

/**
 * 生成用户标识（API Key 的 hash）
 * 用于在数据库中标识用户，避免存储原始 Key
 */
export async function hashApiKey(apiKey: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.slice(0, 16); // 取前16位作为用户标识
}

/**
 * 认证中间件
 * 返回 null 表示认证成功，返回 Response 表示认证失败
 */
export async function authMiddleware(
    request: Request,
    env: Env
): Promise<{ userKey: string } | Response> {
    const apiKey = extractApiKey(request);

    if (!validateApiKey(apiKey, env)) {
        return unauthorized('无效的 API Key');
    }

    const userKey = await hashApiKey(apiKey!);
    return { userKey };
}

/**
 * 生成随机 ID
 */
export function generateId(prefix: string = 'rem'): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${timestamp}${randomPart}`;
}
