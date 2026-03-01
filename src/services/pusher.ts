/**
 * 推送服务 - 调用外部 go-wxpush 服务发送消息
 * 
 * 改造说明：
 * - 移除内置的微信 API 调用逻辑
 * - 改为通过 HTTP 请求调用外部 go-wxpush 服务
 * - 支持指定模板名称 (template_name)，模板由 go-wxpush 服务管理
 */

import { PushConfig, PushResponse, Env } from '../types';

function normalizeUrl(input: unknown): string {
    if (typeof input !== 'string') return '';
    return input.trim().replace(/\/+$/, '');
}

/**
 * 规范化推送发送接口 URL（统一使用 /wxpush）
 */
export function resolvePushApiUrl(pushServiceUrl: string): string {
    let normalized = normalizeUrl(pushServiceUrl);
    if (!normalized) {
        return '';
    }

    // Fix: Handle legacy /wxpush path
    if (normalized.endsWith('/wxpush')) {
        normalized = normalized.slice(0, -'/wxpush'.length);
    }

    // Default go-wxpush endpoint is /wxsend
    const marker = '/wxsend';
    const lower = normalized.toLowerCase();
    const markerIndex = lower.indexOf(marker);
    if (markerIndex >= 0) {
        return normalized.slice(0, markerIndex + marker.length);
    }

    // Append marker if not present
    return `${normalized}${marker}`;
}

/**
 * 调用外部推送服务发送消息
 * @param pushServiceUrl 外部推送服务地址 (go-wxpush)
 * @param config 推送配置（包含 template_name）
 * @param title 消息标题
 * @param content 消息内容
 * @returns 推送结果
 */
export async function sendPush(
    pushServiceUrl: string,
    config: PushConfig,
    title: string,
    content: string
): Promise<{ success: boolean; response?: PushResponse; error?: string; duration: number }> {
    const startTime = Date.now();

    try {
        // 构建请求参数
        const requestBody: Record<string, any> = {
            title: title,
            content: content,
            appid: config.appid,
            secret: config.secret,
            userid: config.userid,
            template_id: config.template_id,
            base_url: config.base_url || pushServiceUrl, // 详情页基础 URL
            tz: 'Asia/Shanghai',
            callback_url: config.callback_url,           // 回调地址
        };

        // 如果配置中指定了模板名称
        if (config.template_name) {
            requestBody.template_name = config.template_name;
        }

        const apiUrl = resolvePushApiUrl(pushServiceUrl);
        if (!apiUrl) {
            const duration = Date.now() - startTime;
            return {
                success: false,
                error: '推送服务地址为空或格式不正确',
                duration,
            };
        }

        console.log(`[Pusher] 调用外部推送服务: ${apiUrl}`);
        console.log(`[Pusher] requestBody.template_name = ${requestBody.template_name}`);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        const duration = Date.now() - startTime;
        const responseText = await response.text();

        if (!response.ok) {
            // 检查是否是 Cloudflare 错误（如 error code: 1003）
            if (responseText.includes('error code:')) {
                const errorMatch = responseText.match(/error code:\s*(\d+)/);
                const errorCode = errorMatch ? errorMatch[1] : 'unknown';
                return {
                    success: false,
                    error: `Cloudflare 拦截请求 (${errorCode}): 请检查推送服务地址是否使用 HTTPS 域名而非直接 IP`,
                    duration,
                };
            }
            return {
                success: false,
                error: `推送服务返回 HTTP ${response.status} @ ${apiUrl}: ${responseText.substring(0, 200)}`,
                duration,
            };
        }

        // 尝试解析为 JSON
        let result: PushResponse;
        try {
            result = JSON.parse(responseText) as PushResponse;
        } catch {
            return {
                success: false,
                error: `推送服务返回非 JSON 响应 @ ${apiUrl}: ${responseText.substring(0, 200)}`,
                duration,
            };
        }

        if (result.errcode === 0) {
            return {
                success: true,
                response: result,
                duration,
            };
        } else {
            return {
                success: false,
                response: result,
                error: `推送服务返回错误 @ ${apiUrl}: ${result.errcode} - ${result.errmsg}`,
                duration,
            };
        }

    } catch (err) {
        const duration = Date.now() - startTime;
        console.error('[Pusher] 调用推送服务失败:', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : '调用推送服务失败',
            duration,
        };
    }
}

/**
 * 处理公共推送请求 (/wxpush)
 * 统一由该接口转发到配置的外部推送服务
 */
export async function handlePublicPush(request: Request, env: Env): Promise<Response> {
    try {
        let params: any;

        if (request.method === 'POST') {
            params = await request.json();
        } else if (request.method === 'GET') {
            const url = new URL(request.url);
            params = Object.fromEntries(url.searchParams.entries());
        } else {
            return new Response('Method not allowed', { status: 405 });
        }

        const {
            title,
            content,
            appid,
            secret,
            userid,
            template_id,
            custom_html,
            template_name,
            callback_url,
            base_url,
            push_service_url,
            push_url
        } = params;

        if (!appid || !secret || !userid || !template_id) {
            return new Response(JSON.stringify({ error: 'Missing required parameters' }), { status: 400 });
        }

        // 获取推送服务地址（优先显式 push_service_url，其次服务端环境配置）
        let pushServiceUrl = normalizeUrl(push_service_url) || normalizeUrl(push_url);
        if (!pushServiceUrl) {
            pushServiceUrl = normalizeUrl(env.PUSH_SERVICE_URL) || normalizeUrl(env.DEFAULT_PUSH_URL);
        }
        // 兼容旧调用：历史上有人把 base_url 当成 push 服务地址传入
        if (!pushServiceUrl) {
            pushServiceUrl = normalizeUrl(base_url);
        }

        if (!pushServiceUrl) {
            return new Response(JSON.stringify({ error: 'Push service URL not configured' }), { status: 500 });
        }

        const detailBaseUrl = normalizeUrl(base_url) || normalizeUrl(env.WORKER_BASE_URL) || pushServiceUrl;

        const result = await sendPush(
            pushServiceUrl,
            {
                appid,
                secret,
                userid,
                template_id,
                base_url: detailBaseUrl,
                callback_url: typeof callback_url === 'string' ? callback_url.trim() : undefined,
                template_name
            },
            title || '消息推送',
            content || '无内容'
        );

        return new Response(JSON.stringify(result.response || { errcode: -1, errmsg: result.error }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), { status: 500 });
    }
}
