
/**
 * 微信推送逻辑（移植自 go-wxpush）
 * 支持：指定用户推送 / 向所有关注者群发
 */

interface WechatAPIResponse {
    errcode: number;
    errmsg: string;
}

interface AccessTokenResponse {
    access_token: string;
    expires_in: number;
}

interface TemplateMessageRequest {
    touser: string;
    template_id: string;
    url: string;
    data: Record<string, { value: string }>;
}

interface UserListResponse {
    total: number;
    count: number;
    data: {
        openid: string[];
    };
    next_openid: string;
    errcode?: number;
    errmsg?: string;
}

export interface WxPushConfig {
    appid: string;
    secret: string;
    userid?: string; // 可选：如果不填则群发给所有用户
    template_id: string;
}

// 获取 Access Token
async function getAccessToken(appid: string, secret: string): Promise<string> {
    const url = 'https://api.weixin.qq.com/cgi-bin/stable_token';
    const body = {
        grant_type: 'client_credential',
        appid,
        secret,
        force_refresh: false,
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    const data: any = await response.json();
    if (data.errcode) {
        throw new Error(`获取 Access Token 失败: ${data.errcode} - ${data.errmsg}`);
    }

    return data.access_token;
}

/**
 * 获取公众号所有关注用户的 OpenID 列表
 * 微信接口每次最多返回 10000 个，需要分页获取
 */
async function getAllUserOpenIds(accessToken: string): Promise<string[]> {
    const allOpenIds: string[] = [];
    let nextOpenId = '';

    do {
        const url = `https://api.weixin.qq.com/cgi-bin/user/get?access_token=${accessToken}&next_openid=${nextOpenId}`;
        const response = await fetch(url);
        const data: UserListResponse = await response.json();

        if (data.errcode) {
            throw new Error(`获取用户列表失败: ${data.errcode} - ${data.errmsg}`);
        }

        if (data.data && data.data.openid) {
            allOpenIds.push(...data.data.openid);
        }

        nextOpenId = data.next_openid || '';
    } while (nextOpenId);

    return allOpenIds;
}

/**
 * 向单个用户发送模板消息
 */
async function sendToUser(
    accessToken: string,
    templateId: string,
    openId: string,
    detailUrl: string,
    title: string,
    content: string
): Promise<WechatAPIResponse> {
    const apiUrl = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`;

    const requestData: TemplateMessageRequest = {
        touser: openId,
        template_id: templateId,
        url: detailUrl,
        data: {
            title: { value: title },
            content: { value: content },
        },
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
    });

    return (await response.json()) as WechatAPIResponse;
}

/**
 * 发送模板消息
 * - 如果 config.userid 有值，只向该用户发送
 * - 如果 config.userid 为空，向所有关注用户群发
 */
export async function sendWechatMessage(
    config: WxPushConfig,
    detailUrl: string,
    title: string,
    content: string
): Promise<WechatAPIResponse> {
    const accessToken = await getAccessToken(config.appid, config.secret);

    // 判断是单发还是群发
    if (config.userid && config.userid.trim()) {
        // 单发：指定用户
        console.log(`[微信推送] 向指定用户发送: ${config.userid.slice(0, 10)}...`);
        return sendToUser(accessToken, config.template_id, config.userid, detailUrl, title, content);
    } else {
        // 群发：获取所有用户并逐个发送
        console.log(`[微信推送] 未指定 userid，准备向所有关注用户群发...`);

        const openIds = await getAllUserOpenIds(accessToken);
        console.log(`[微信推送] 共获取到 ${openIds.length} 个关注用户`);

        if (openIds.length === 0) {
            return { errcode: 0, errmsg: '没有关注用户，无需发送' };
        }

        let successCount = 0;
        let failCount = 0;
        let lastError = '';

        // 并发控制：每批最多同时发 10 个，避免触发微信频率限制
        const batchSize = 10;
        for (let i = 0; i < openIds.length; i += batchSize) {
            const batch = openIds.slice(i, i + batchSize);
            const results = await Promise.allSettled(
                batch.map(openId => sendToUser(accessToken, config.template_id, openId, detailUrl, title, content))
            );

            results.forEach((result, idx) => {
                if (result.status === 'fulfilled' && result.value.errcode === 0) {
                    successCount++;
                } else {
                    failCount++;
                    if (result.status === 'fulfilled') {
                        lastError = `${result.value.errcode}: ${result.value.errmsg}`;
                    } else {
                        lastError = result.reason?.message || '未知错误';
                    }
                }
            });
        }

        console.log(`[微信推送] 群发完成: 成功 ${successCount}，失败 ${failCount}`);

        // 返回汇总结果
        if (failCount === 0) {
            return { errcode: 0, errmsg: `群发成功，共 ${successCount} 人` };
        } else if (successCount > 0) {
            return { errcode: 0, errmsg: `部分成功: ${successCount} 成功, ${failCount} 失败. 最后错误: ${lastError}` };
        } else {
            return { errcode: -1, errmsg: `群发全部失败: ${lastError}` };
        }
    }
}
