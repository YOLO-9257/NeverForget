/**
 * 邮件转发核心服务
 * @author zhangws
 */

import { Env, EmailSettings, ForwardRules, EmailData, PushConfig, AiMessage } from '../types';
import { sendPush } from './pusher';
import { callLlmInWorker } from '../utils/aiClient';

/**
 * 检查邮件是否满足转发规则
 * @returns true 表示应该转发，false 表示应该拦截
 */
export function shouldForwardEmail(
    data: EmailData,
    rules: ForwardRules,
    blacklist: Set<string> = new Set(),
    customRules: any[] = []
): { allowed: boolean; reason?: string; action?: any } {
    const { from, subject, content } = data;

    // 0. 数据库全局/账户黑名单检查 (优先级最高)
    // 提取发件人邮箱地址 (简单的正则提取 <email>)
    const emailMatch = from.match(/<(.+?)>/);
    const senderEmail = emailMatch ? emailMatch[1] : from;

    if (blacklist.has(senderEmail) || blacklist.has(from)) {
        console.log(`[Email Service] 邮件被黑名单拦截: ${from}`);
        return { allowed: false, reason: 'global_blacklist', action: { type: 'block' } };
    }

    // 1. 自定义规则检查 (数据库规则)
    // customRules structure: { conditions: EmailRuleCondition[], action: EmailRuleAction }
    for (const rule of customRules) {
        if (evaluateRule(data, rule.conditions)) {
            console.log(`[Email Service] 邮件匹配规则 "${rule.name}": ${rule.action.type}`);

            if (rule.action.type === 'block' || rule.action.type === 'skip_push') {
                return { allowed: false, reason: rule.name, action: rule.action };
            }
            if (rule.action.type === 'mark_spam') {
                return { allowed: false, reason: rule.name, action: rule.action }; // Or maybe allow but tag? For now block push.
            }
            // If action is 'ai_review', we might let it pass here and handle async later, 
            // or return a special status. For now assuming sync checks return decision.
        }
    }

    // 2. Legacy JSON 黑名单检查
    if (rules.block_senders && rules.block_senders.length > 0) {
        if (rules.block_senders.some(sender => from.includes(sender))) {
            console.log(`[Email Service] 邮件被黑名单拦截 (Legacy): ${from}`);
            return { allowed: false, reason: 'legacy_blacklist' };
        }
    }

    // 3. 白名单检查
    if (rules.allow_senders && rules.allow_senders.length > 0) {
        const isAllowed = rules.allow_senders.some(sender => from.includes(sender));
        if (!isAllowed) {
            console.log(`[Email Service] 邮件不在白名单内: ${from}`);
            return { allowed: false, reason: 'whitelist_miss' };
        }
    }

    // 4. 关键词拦截
    if (rules.block_keywords && rules.block_keywords.length > 0) {
        if (rules.block_keywords.some(keyword => subject.includes(keyword) || content.includes(keyword))) {
            console.log(`[Email Service] 邮件包含屏蔽关键词: ${subject}`);
            return { allowed: false, reason: 'keyword_block' };
        }
    }

    // 5. 必需关键词
    if (rules.match_keywords && rules.match_keywords.length > 0) {
        const hasKeyword = rules.match_keywords.some(keyword => subject.includes(keyword) || content.includes(keyword));
        if (!hasKeyword) {
            console.log(`[Email Service] 邮件不包含必需关键词: ${subject}`);
            return { allowed: false, reason: 'keyword_miss' };
        }
    }

    return { allowed: true };
}

/**
 * 评估单条规则
 */
function evaluateRule(email: EmailData, conditions: any[]): boolean {
    if (!conditions || conditions.length === 0) return false;

    // 目前假设所有条件为 AND 关系 (后续可扩展 OR)
    return conditions.every(cond => {
        let valueToCheck = '';
        if (cond.field === 'from') valueToCheck = email.from;
        else if (cond.field === 'subject') valueToCheck = email.subject;
        else if (cond.field === 'content') valueToCheck = email.content;

        valueToCheck = valueToCheck.toLowerCase();
        const targetValue = cond.value.toLowerCase();

        switch (cond.operator) {
            case 'contains': return valueToCheck.includes(targetValue);
            case 'equals': return valueToCheck === targetValue;
            case 'starts_with': return valueToCheck.startsWith(targetValue);
            case 'ends_with': return valueToCheck.endsWith(targetValue);
            case 'not_contains': return !valueToCheck.includes(targetValue);
            default: return false;
        }
    });
}

/**
 * AI 垃圾邮件检测
 */
export async function checkAiSpam(env: Env, email: EmailData, aiConfig?: { apiKey?: string; provider?: string; model?: string; baseUrl?: string }): Promise<{ isSpam: boolean; reason?: string }> {
    // 优先使用传入的 config，否则使用 env
    const apiKey = aiConfig?.apiKey || env.AI_API_KEY;
    if (!apiKey) return { isSpam: false };

    try {
        const systemPrompt = `You are a strict spam filter. Analyze the following email and determine if it is SPAM, PROMOTION using aggressive filtering. 
        Focus on: phishing, lottery scams, unsolicited marketing, malicious links, or generic bulk spam.
        Ignore personal emails, work emails, or transactional emails (verifications, receipts).
        
        Respond with a JSON object: { "isSpam": boolean, "reason": "short explanation" }`;

        const response = await callLlmInWorker(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `From: ${email.from}\nSubject: ${email.subject}\nContent: ${email.content.substring(0, 1000)}` }
            ],
            {
                message: '',
                apiKey: apiKey,
                provider: (aiConfig?.provider as any) || env.AI_PROVIDER || 'gemini',
                model: aiConfig?.model || env.AI_MODEL,
                baseUrl: aiConfig?.baseUrl
            },
            env
        );

        const text = response.text.trim();
        // Try to parse JSON
        const jsonMatch = text.match(/\{.*\}/s);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            return { isSpam: result.isSpam, reason: result.reason };
        }

    } catch (e) {
        console.error('[Email Service] AI Spam check failed:', e);
    }

    return { isSpam: false };
}


/**
 * 转发邮件到推送服务
 */
export async function forwardEmailToPush(
    env: Env,
    settings: EmailSettings,
    email: EmailData,
    aiConfig?: { apiKey?: string; provider?: string; model?: string; baseUrl?: string }
): Promise<{ success: boolean; response?: string; error?: string }> {
    const { from, subject, content } = email;

    // 确定推送服务地址
    const pushServiceUrl = settings.wxpush_url || env.PUSH_SERVICE_URL || 'https://wxpusher.zjiecode.com';

    // 检查是否可以使用统一的 push_config
    if (settings.push_config) {
        try {
            const config = JSON.parse(settings.push_config) as PushConfig;

            // 如果模板名称已配置，覆盖配置中的模板
            if (settings.template_name) {
                config.template_name = settings.template_name;
            }

            // 构建推送内容
            const displayContent = await extractContentSmart(env, settings, content, aiConfig);
            const pushTitle = `📧 ${subject}`;
            const pushContent = `📧 **新邮件通知**\n\n**发件人**: ${from}\n**主题**: ${subject}\n\n---\n\n${displayContent}`;

            const result = await sendPush(pushServiceUrl, config, pushTitle, pushContent);

            return {
                success: result.success,
                response: result.response ? JSON.stringify(result.response) : undefined,
                error: result.error
            };
        } catch (e) {
            console.error('[Email Service] 使用 push_config 转发失败，回退到 legacy 模式:', e);
        }
    }

    // Legacy 模式: 直接调用 WxPusher 接口 (兼容旧配置)
    if (!settings.wxpush_token) {
        return { success: false, error: '未配置推送 Token' };
    }

    // 如果是通过 legacy 模式且地址是 wxpusher.zjiecode.com
    if (pushServiceUrl.includes('wxpusher.zjiecode.com')) {
        const displayContent = await extractContentSmart(env, settings, content, aiConfig);
        const legacyContent = `📧 **新邮件通知**\n\n**发件人**: ${from}\n**主题**: ${subject}\n\n---\n\n${displayContent}`;

        try {
            const response = await fetch(`${pushServiceUrl}/api/send/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: legacyContent,
                    summary: `📧 ${subject}`,
                    contentType: 1,
                    uids: [settings.wxpush_token],
                }),
            });

            const result = await response.json() as { code: number; msg: string };
            if (response.ok && result.code === 1000) {
                return { success: true, response: JSON.stringify(result) };
            } else {
                return { success: false, error: result.msg || `HTTP ${response.status}` };
            }
        } catch (error) {
            return { success: false, error: String(error) };
        }
    }

    // 如果地址不是官方 WxPusher，尝试使用 /wxsend 接口 (可能是一个 go-wxpush 实例但未配置 push_config)
    try {
        const apiUrl = pushServiceUrl.replace(/\/$/, '') + '/wxsend';

        // 尝试提取最新回复内容
        const displayContent = await extractContentSmart(env, settings, content, aiConfig);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: `📧 ${subject}`,
                content: displayContent,
                userid: settings.wxpush_token,
                template_name: settings.template_name || 'email',
            }),
        });

        const result = await response.json() as any;
        if (response.ok) {
            return { success: true, response: JSON.stringify(result) };
        } else {
            return { success: false, error: result.errmsg || result.msg || `HTTP ${response.status}` };
        }
    } catch (error) {
        return { success: false, error: String(error) };
    }
}

/**
 * 智能提取邮件内容 (优先使用 AI，失败回退到正则)
 */
async function extractContentSmart(
    env: Env,
    settings: EmailSettings | null,
    content: string,
    aiConfig?: { apiKey?: string; provider?: string; model?: string; baseUrl?: string }
): Promise<string> {
    if (!content) return content;

    // 优先使用用户配置的 AI，其次使用全局环境变量
    const apiKey = aiConfig?.apiKey || env.AI_API_KEY;

    // 检查是否有可用的 AI 配置
    if (apiKey) {
        try {
            const systemPrompt = `You are an email formatting assistant. 
Your task is to extract the LATEST message content from an email thread, removing all quoted replies, signatures, and headers (like "On ... wrote:").
Return ONLY the cleaned latest message text. Do not add any explanations or markdown blocks unless necessary for the content itself.
If the email seems to be a new message without history, return it as is.
Keep the original language.`;

            const response = await callLlmInWorker(
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: content }
                ],
                {
                    message: '',
                    apiKey: apiKey,
                    provider: (aiConfig?.provider as any) || env.AI_PROVIDER || 'gemini',
                    model: aiConfig?.model || env.AI_MODEL,
                    baseUrl: aiConfig?.baseUrl
                },
                env
            );

            if (response.text && response.text.length > 0) {
                return response.text.trim();
            }
        } catch (e) {
            console.warn('[Email Service] AI 提取失败，回退到正则模式:', e);
        }
    }

    // 回退到正则提取
    return extractLatestEmailContent(content);
}

/**
 * 提取邮件中的最新回复内容（去除历史引用）- 正则版
 * @param content 邮件完整内容
 */
function extractLatestEmailContent(content: string): string {
    if (!content) return content;

    // 规范化换行符
    const text = content.replace(/\r\n/g, '\n');

    // 常见的分隔符模式
    const separators = [
        /\nOn .+? wrote:[\s\S]*/i,            // Standard: On ... wrote:
        /\n在 .+? 写道：[\s\S]*/,               // Chinese: 在 ... 写道：
        /\n-{5}Original Message-{5}[\s\S]*/i, // Outlook English
        /\n-{5}原始邮件-{5}[\s\S]*/,           // Outlook Chinese
        /\nFrom:\s*.+?[\r\n]+Sent:\s*.+?[\r\n]+To:\s*.+?/i, // Outlook Full Header (Requires strict match to avoid false positives)
        /\n________________________________[\s\S]*/, // Common Divider
    ];

    for (const regex of separators) {
        const match = text.match(regex);
        if (match && match.index !== undefined && match.index > 0) {
            // 返回分隔符之前的内容
            const newContent = text.substring(0, match.index).trim();
            // 只有当提取出的内容不为空且长度合理时才采用 (防止误判导致内容丢失)
            if (newContent && newContent.length > 0) {
                return newContent;
            }
        }
    }

    // 如果未找到分隔符，返回原始内容
    return content;
}

/**
 * 记录邮件转发日志并更新统计
 */
export async function logAndFinishForward(
    env: Env,
    userKey: string,
    email: EmailData,
    success: boolean,
    wxpushResponse?: string,
    error?: string
): Promise<void> {
    const now = Date.now();
    try {
        // 1. 插入日志
        await env.DB.prepare(`
            INSERT INTO email_forward_logs (
                user_key, from_address, subject, received_at, 
                status, wxpush_response, error, processed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            userKey,
            email.from,
            email.subject || '(无主题)',
            email.received_at || now,
            success ? 'success' : 'failed',
            wxpushResponse || null,
            error || null,
            now
        ).run();

        // 2. 更新统计
        if (success) {
            await env.DB.prepare(`
                UPDATE user_email_settings 
                SET total_forwarded = total_forwarded + 1, last_forwarded_at = ?
                WHERE user_key = ?
            `).bind(now, userKey).run();
        }
    } catch (err) {
        console.error('[Email Service] 记录日志失败:', err);
    }
}
