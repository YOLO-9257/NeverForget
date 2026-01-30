/**
 * 统一响应格式工具
 */

import { ApiResponse } from '../types';

// CORS 响应头
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
};

/**
 * 成功响应
 */
export function success<T>(data?: T, message = 'success'): Response {
    const body: ApiResponse<T> = {
        code: 0,
        message,
        data,
    };
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: corsHeaders,
    });
}

/**
 * 错误响应
 */
export function error(message: string, code = 1, status = 400): Response {
    const body: ApiResponse = {
        code,
        message,
    };
    return new Response(JSON.stringify(body), {
        status,
        headers: corsHeaders,
    });
}

/**
 * 参数验证错误
 */
export function badRequest(message: string): Response {
    return error(message, 400, 400);
}

/**
 * 未授权
 */
export function unauthorized(message = '未授权访问'): Response {
    return error(message, 401, 401);
}

/**
 * 资源不存在
 */
export function notFound(message = '资源不存在'): Response {
    return error(message, 404, 404);
}

/**
 * 服务器内部错误
 */
export function serverError(message = '服务器内部错误'): Response {
    return error(message, 500, 500);
}

/**
 * OPTIONS 预检请求响应
 */
export function options(): Response {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    });
}
