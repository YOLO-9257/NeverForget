/**
 * 认证工具 (升级版)
 * 支持 JWT 和 API Key (API Key 仅作为兼容或系统内部调用)
 */

import { Env } from '../types';
import { unauthorized } from './response';
import { verifyJwt } from './crypto';

/**
 * 认证结果
 */
export interface AuthResult {
    userKey: string;
    authType: 'jwt' | 'apikey';
    uid?: number;
    username?: string;
}

/**
 * 从请求头中提取认证信息
 */
export function extractAuthToken(request: Request): string | null {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return null;

    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }
    return authHeader; // 兼容直接传 Key
}

/**
 * 验证 API Key (Legacy)
 */
export function validateApiKey(apiKey: string | null, env: Env): boolean {
    if (!apiKey || !env.API_KEYS) return false;
    const validKeys = env.API_KEYS.split(',').map(k => k.trim());
    return validKeys.includes(apiKey);
}

/**
 * 生成用户标识（API Key 的 hash）
 * 仅用于旧版 API Key 模式
 */
export async function hashApiKey(apiKey: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.slice(0, 16);
}

/**
 * 认证中间件
 * 支持 JWT (优先) 和 API Key
 */
export async function authMiddleware(
    request: Request,
    env: Env
): Promise<AuthResult | Response> {
    const token = extractAuthToken(request);

    if (!token) {
        return unauthorized('未提供认证信息');
    }

    // 1. 尝试验证 JWT
    // JWT 密钥优先使用环境变量，如果没有则使用默认值（仅开发）
    // 注意：crypto.ts 里有默认值，但这里我们尽量从 Env 传进去，如果没有 Env.JWT_SECRET 则 crypto.ts 会用默认的
    const jwtSecret = (env as any).JWT_SECRET; // 假设 Env 还没更新定义，先 cast
    const jwtPayload = await verifyJwt(token, jwtSecret);

    if (jwtPayload) {
        return {
            userKey: jwtPayload.key,
            authType: 'jwt',
            uid: jwtPayload.uid,
            username: jwtPayload.username
        };
    }

    // 2. 尝试验证 API Key (Legacy)
    if (validateApiKey(token, env)) {
        const userKey = await hashApiKey(token);
        return {
            userKey,
            authType: 'apikey'
        };
    }

    return unauthorized('无效的认证信息');
}

/**
 * 生成随机 ID
 */
export function generateId(prefix: string = 'rem'): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${timestamp}${randomPart}`;
}
