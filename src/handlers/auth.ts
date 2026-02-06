/**
 * 认证处理函数
 */

import { Env } from '../types';
import { success, badRequest, unauthorized, serverError } from '../utils/response';
import { hashPassword, verifyPassword, signJwt } from '../utils/crypto';

/**
 * 登录请求体
 */
interface LoginRequest {
    username?: string;
    password?: string;
}

/**
 * 创建初始用户请求体
 */
interface SetupRequest {
    username: string;
    password: string;
}

/**
 * 用户登录
 */
export async function login(request: Request, env: Env): Promise<Response> {
    try {
        const body = await request.json() as LoginRequest;
        if (!body.username || !body.password) {
            return badRequest('用户名和密码不能为空');
        }

        // 查找用户
        const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?')
            .bind(body.username)
            .first<{
                id: number;
                username: string;
                password_hash: string;
                salt: string;
                user_key: string;
            }>();

        if (!user) {
            return unauthorized('用户名或密码错误');
        }

        // 验证密码
        const isValid = await verifyPassword(body.password, user.password_hash, user.salt);
        if (!isValid) {
            return unauthorized('用户名或密码错误');
        }

        // 签发 JWT
        const jwtSecret = (env as any).JWT_SECRET;
        const token = await signJwt({
            uid: user.id,
            username: user.username,
            key: user.user_key
        }, jwtSecret);

        return success({
            token,
            user: {
                id: user.id,
                username: user.username
            }
        });

    } catch (error) {
        console.error('登录失败:', error);
        return serverError('登录失败');
    }
}

/**
 * 系统初始化（创建第一个用户）
 */
export async function setup(request: Request, env: Env): Promise<Response> {
    try {
        // 检查是否已存在用户
        const count = await env.DB.prepare('SELECT COUNT(*) as total FROM users').first<{ total: number }>();
        if (count && count.total > 0) {
            return unauthorized('系统已初始化，禁止重复操作');
        }

        const body = await request.json() as SetupRequest;
        if (!body.username || !body.password) {
            return badRequest('用户名和密码不能为空');
        }

        if (body.password.length < 6) {
            return badRequest('密码长度不能少于6位');
        }

        // 生成密码哈希
        const { hash, salt } = await hashPassword(body.password);

        // 生成 user_key (这里我们生成一个新的随机 key，不再依赖 API Key)
        // 为了兼容性，格式保持一致
        // 使用 crypto.randomUUID 或者自定义生成
        const userKey = crypto.randomUUID().replace(/-/g, '').slice(0, 16);

        // 插入用户
        const result = await env.DB.prepare(`
            INSERT INTO users (username, password_hash, salt, user_key, created_at)
            VALUES (?, ?, ?, ?, ?)
        `).bind(body.username, hash, salt, userKey, Date.now()).run();

        if (!result.success) {
            return serverError('创建用户失败');
        }

        return success({
            message: '系统初始化成功，请登录',
            username: body.username
        });

    } catch (error) {
        console.error('初始化失败:', error);
        return serverError('初始化失败');
    }
}

/**
 * 检查系统是否已初始化
 */
export async function checkInitStatus(env: Env): Promise<Response> {
    try {
        // 只检查是否存在用户，绝不返回用户名
        const count = await env.DB.prepare('SELECT COUNT(*) as total FROM users').first<{ total: number }>();
        const initialized = count ? count.total > 0 : false;
        return success({ initialized });
    } catch (error) {
        console.error('检查初始化状态失败:', error);
        // 如果表不存在，也算未初始化
        return success({ initialized: false });
    }
}
