/**
 * 邮件转发核心服务
 * @author zhangws
 */

import { Env, EmailSettings, ForwardRules, EmailData, PushConfig, EmailRuleCondition, EmailRuleAction, AiFilterConfig } from '../types';
import { sendPush } from './pusher';
import { resolvePushApiUrl } from './pusher';
import { callLlmInWorker } from '../utils/aiClient';
import { AiRuntimeConfig, PushSummaryContext, extractContentSmart, buildSummaryBlock, getQuickSummary, resolveAiProvider } from './emailContent';

interface CustomEmailRule {
    name?: string;
    conditions: EmailRuleCondition[];
    action: EmailRuleAction;
}

interface ForwardDecision {
    allowed: boolean;
    reason?: string;
    action?: EmailRuleAction;
}

interface LegacyWxpusherResponse {
    code?: number;
    msg?: string;
    [key: string]: unknown;
}

interface ProxyPushResponse {
    errmsg?: string;
    msg?: string;
    [key: string]: unknown;
}

type AiEmailCategory = 'ads' | 'notification' | 'other';
type AiSeverity = 'critical' | 'high' | 'medium' | 'low';

interface AiFilterRawResult {
    isSpam?: unknown;
    reason?: unknown;
    category?: unknown;
    severity?: unknown;
    importance_score?: unknown;
}

interface AiFilterDecisionInput {
    category: AiEmailCategory;
    severity: AiSeverity;
    importanceScore: number;
    spamHint: boolean;
    adsKeepImportanceThreshold?: number;
}

export interface AiSpamCheckResult {
    isSpam: boolean;
    shouldFilter: boolean;
    reason?: string;
    category: AiEmailCategory;
    severity: AiSeverity;
}

const AD_KEYWORDS = [
    '广告', '促销', '优惠', '折扣', '限时', '领券', '抽奖', '返现',
    'sale', 'discount', 'coupon', 'promo', 'promotion', 'marketing', 'newsletter', 'unsubscribe'
];
const NOTIFICATION_KEYWORDS = [
    '通知', '提醒', '验证码', '校验码', '账单', '发票', '收据', '订单', '物流', '到期', '告警', '预警',
    'verification code', 'otp', 'security alert', 'invoice', 'receipt', 'order', 'shipment', 'delivery', 'payment'
];
const DEFAULT_ADS_KEEP_IMPORTANCE_THRESHOLD = 0.75;

export type { PushSummaryContext } from './emailContent';

/**
 * 检查邮件是否满足转发规则
 * @returns true 表示应该转发，false 表示应该拦截
 */
export function shouldForwardEmail(
    data: EmailData,
    rules: ForwardRules,
    blacklist: Set<string> = new Set(),
    customRules: CustomEmailRule[] = []
): ForwardDecision {
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
            const ruleName = rule.name || 'unnamed_rule';
            console.log(`[Email Service] 邮件匹配规则 "${ruleName}": ${rule.action.type}`);

            if (rule.action.type === 'block' || rule.action.type === 'skip_push') {
                return { allowed: false, reason: ruleName, action: rule.action };
            }
            if (rule.action.type === 'mark_spam') {
                return { allowed: false, reason: ruleName, action: rule.action }; // Or maybe allow but tag? For now block push.
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
function evaluateRule(email: EmailData, conditions: EmailRuleCondition[]): boolean {
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
 * 统一分值规范到 0~1
 */
function clampScore(value: unknown, fallback: number = 0.5): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.min(1, Math.max(0, value));
    }
    return fallback;
}

/**
 * 将 AI 分类结果规范化为系统可识别的类别
 */
function normalizeAiCategory(value: unknown): AiEmailCategory {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!normalized) return 'other';

    if (['ads', 'ad', 'advertisement', 'advertising', 'promotion', 'promo', 'marketing', 'newsletter', 'spam'].includes(normalized)) {
        return 'ads';
    }

    if (['notification', 'notice', 'transaction', 'transactional', 'bill', 'billing', 'invoice', 'receipt', 'verification', 'otp', 'alert', 'system'].includes(normalized)) {
        return 'notification';
    }

    return 'other';
}

/**
 * 将 AI 严重程度规范化
 */
function normalizeAiSeverity(
    value: unknown,
    fallbackSentiment?: PushSummaryContext['sentiment'],
    fallbackImportance?: number
): AiSeverity {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

    if (normalized === 'critical') return 'critical';
    if (['high', 'urgent', 'severe'].includes(normalized)) return 'high';
    if (['medium', 'normal', 'moderate'].includes(normalized)) return 'medium';
    if (['low', 'minor'].includes(normalized)) return 'low';

    if (fallbackSentiment === 'urgent') return 'high';
    if (fallbackSentiment === 'low') return 'low';

    const importance = clampScore(fallbackImportance);
    if (importance >= 0.75) return 'high';
    if (importance <= 0.3) return 'low';
    return 'medium';
}

/**
 * AI 输出异常时，基于关键词做一个保守的类别兜底
 */
function inferCategoryByHeuristics(email: EmailData): AiEmailCategory {
    const content = `${email.subject || ''}\n${email.content || ''}`.toLowerCase();
    const hasAd = AD_KEYWORDS.some(keyword => content.includes(keyword));
    const hasNotification = NOTIFICATION_KEYWORDS.some(keyword => content.includes(keyword));

    if (hasNotification && !hasAd) return 'notification';
    if (hasAd && !hasNotification) return 'ads';
    if (hasNotification && hasAd) {
        // 同时命中时优先通知，避免误杀验证码/账单提醒。
        return 'notification';
    }
    return 'other';
}

/**
 * 解析 LLM 返回的 JSON
 */
function parseAiFilterRawResult(text: string): AiFilterRawResult | null {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed && typeof parsed === 'object') {
            return parsed as AiFilterRawResult;
        }
    } catch {
        // ignore parse errors
    }
    return null;
}

/**
 * AI 自动过滤决策：
 * - 广告邮件：以过滤为主，但给高重要度留兜底
 * - 通知邮件：以保留为主，仅在低严重度且疑似垃圾时过滤
 * - 其他类型：结合严重度、垃圾提示和重要度判定
 */
export function decideAiFilterAction(input: AiFilterDecisionInput): { shouldFilter: boolean; reason: string } {
    const importance = clampScore(input.importanceScore);
    const adsKeepImportanceThreshold = clampScore(
        input.adsKeepImportanceThreshold,
        DEFAULT_ADS_KEEP_IMPORTANCE_THRESHOLD
    );
    const adsStrongKeepThreshold = Math.min(1, adsKeepImportanceThreshold + 0.15);

    if (input.category === 'ads') {
        if (input.severity === 'critical' || input.severity === 'high') {
            return { shouldFilter: true, reason: '广告邮件且严重度高' };
        }
        if (input.severity === 'medium') {
            if (importance >= adsKeepImportanceThreshold) {
                return {
                    shouldFilter: false,
                    reason: `广告邮件但重要度较高（阈值 ${adsKeepImportanceThreshold.toFixed(2)}），保留`
                };
            }
            return { shouldFilter: true, reason: '广告邮件且中等严重度' };
        }
        if (importance >= adsStrongKeepThreshold) {
            return { shouldFilter: false, reason: '广告邮件但重要度极高，保留' };
        }
        return { shouldFilter: true, reason: '广告邮件且低严重度' };
    }

    if (input.category === 'notification') {
        if (input.severity === 'low' && importance < 0.2 && input.spamHint) {
            return { shouldFilter: true, reason: '通知邮件低严重度且疑似垃圾' };
        }
        return { shouldFilter: false, reason: '通知邮件默认保留' };
    }

    if (input.spamHint && (input.severity === 'critical' || input.severity === 'high')) {
        return { shouldFilter: true, reason: '高严重度且疑似垃圾' };
    }
    if (input.spamHint && input.severity === 'medium' && importance < 0.35) {
        return { shouldFilter: true, reason: '中等严重度且重要度较低' };
    }
    return { shouldFilter: false, reason: '非广告邮件或重要度较高' };
}

/**
 * AI 自动过滤判定
 */
export async function checkAiSpam(
    env: Env,
    email: EmailData,
    aiConfig?: AiRuntimeConfig,
    summaryContext?: PushSummaryContext,
    aiFilterConfig?: AiFilterConfig
): Promise<AiSpamCheckResult> {
    const defaultCategory = inferCategoryByHeuristics(email);
    const defaultImportance = clampScore(summaryContext?.importance_score);
    const defaultSeverity = normalizeAiSeverity(undefined, summaryContext?.sentiment, defaultImportance);
    const adsKeepImportanceThreshold = clampScore(
        aiFilterConfig?.ads_keep_importance_threshold,
        DEFAULT_ADS_KEEP_IMPORTANCE_THRESHOLD
    );

    // 优先使用传入的 config，否则使用 env
    const apiKey = aiConfig?.apiKey || env.AI_API_KEY;
    if (!apiKey) {
        return {
            isSpam: false,
            shouldFilter: false,
            reason: '未配置 AI 过滤',
            category: defaultCategory,
            severity: defaultSeverity
        };
    }

    try {
        const systemPrompt = `You are an email filtering engine.
Classify this email and return strict JSON only:
{
  "category": "ads|notification|other",
  "severity": "critical|high|medium|low",
  "isSpam": true|false,
  "reason": "short explanation",
  "importance_score": 0.0
}

Rules:
- "notification" includes transactional/account/system notices: OTP, verification, bills, receipts, logistics, security alerts.
- "ads" includes promotions, marketing campaigns, newsletters, unsolicited bulk messages.
- Use severity to represent harmfulness/noise impact, not urgency alone.
- Do not classify a clear transactional notification as ads.`;

        const summaryMeta = summaryContext?.summary
            ? `\nSummary: ${summaryContext.summary}\nSentiment: ${summaryContext.sentiment || 'normal'}\nImportance: ${typeof summaryContext.importance_score === 'number' ? summaryContext.importance_score.toFixed(2) : '0.50'}\nActionItems: ${(summaryContext.action_items || []).slice(0, 5).join(' | ') || 'none'}`
            : '';

        const response = await callLlmInWorker(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `From: ${email.from}\nSubject: ${email.subject}\nContent: ${email.content.substring(0, 1000)}${summaryMeta}` }
            ],
            {
                message: '',
                apiKey: apiKey,
                provider: resolveAiProvider(aiConfig?.provider, env.AI_PROVIDER),
                model: aiConfig?.model || env.AI_MODEL,
                baseUrl: aiConfig?.baseUrl
            },
            env
        );

        const text = response.text.trim();
        const parsed = parseAiFilterRawResult(text);
        if (parsed) {
            const category = normalizeAiCategory(parsed.category) || defaultCategory;
            const llmImportance = clampScore(parsed.importance_score, defaultImportance);
            const importanceScore = typeof summaryContext?.importance_score === 'number'
                ? clampScore(summaryContext.importance_score)
                : llmImportance;
            const severity = normalizeAiSeverity(parsed.severity, summaryContext?.sentiment, importanceScore);
            const spamHint = typeof parsed.isSpam === 'boolean'
                ? parsed.isSpam
                : category === 'ads';
            const decision = decideAiFilterAction({
                category,
                severity,
                importanceScore,
                spamHint,
                adsKeepImportanceThreshold
            });
            const modelReason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
            const reasons = [decision.reason, modelReason].filter(Boolean);

            return {
                isSpam: decision.shouldFilter,
                shouldFilter: decision.shouldFilter,
                reason: reasons.join('；'),
                category,
                severity
            };
        }
    } catch (e) {
        console.error('[Email Service] AI Spam check failed:', e);
    }

    const fallbackDecision = decideAiFilterAction({
        category: defaultCategory,
        severity: defaultSeverity,
        importanceScore: defaultImportance,
        spamHint: defaultCategory === 'ads',
        adsKeepImportanceThreshold
    });
    return {
        isSpam: fallbackDecision.shouldFilter,
        shouldFilter: fallbackDecision.shouldFilter,
        reason: `AI 输出异常，使用兜底规则：${fallbackDecision.reason}`,
        category: defaultCategory,
        severity: defaultSeverity
    };
}


/**
 * 转发邮件到推送服务
 */
export async function forwardEmailToPush(
    env: Env,
    settings: EmailSettings,
    email: EmailData,
    aiConfig?: AiRuntimeConfig,
    summaryContext?: PushSummaryContext
): Promise<{ success: boolean; response?: string; error?: string }> {
    const { from, subject, content } = email;

    // 确定推送服务地址
    const pushServiceUrl = (settings.wxpush_url || env.PUSH_SERVICE_URL || '').trim();

    // 检查是否可以使用统一的 push_config
    if (settings.push_config) {
        try {
            const config = JSON.parse(settings.push_config) as PushConfig;

            // 如果模板名称已配置，覆盖配置中的模板
            if (settings.template_name) {
                config.template_name = settings.template_name;
            }

            // 构建推送内容
            const displayContent = await extractContentSmart(env, content, aiConfig);
            const summaryBlock = buildSummaryBlock(summaryContext, displayContent);
            const pushTitle = `📧 ${subject}`;
            const pushContent = `📧 **新邮件通知**\n\n**发件人**: ${from}\n**主题**: ${subject}\n${summaryBlock}\n\n---\n\n${displayContent}`;

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
        return { success: false, error: '未配置可用推送地址或推送 Token' };
    }

    // 如果是通过 legacy 模式且地址是 wxpusher.zjiecode.com
    if (!pushServiceUrl || pushServiceUrl.includes('wxpusher.zjiecode.com')) {
        const displayContent = await extractContentSmart(env, content, aiConfig);
        const summaryBlock = buildSummaryBlock(summaryContext, displayContent);
        const quickSummary = getQuickSummary(summaryContext, displayContent, subject);
        const legacyContent = `📧 **新邮件通知**\n\n**发件人**: ${from}\n**主题**: ${subject}\n${summaryBlock}\n\n---\n\n${displayContent}`;

        try {
            const legacyUrl = (pushServiceUrl || 'https://wxpusher.zjiecode.com').replace(/\/$/, '');
            const response = await fetch(`${legacyUrl}/api/send/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: legacyContent,
                    summary: `📧 ${quickSummary}`,
                    contentType: 1,
                    uids: [settings.wxpush_token],
                }),
            });

            const result = await response.json() as LegacyWxpusherResponse;
            if (response.ok && result.code === 1000) {
                return { success: true, response: JSON.stringify(result) };
            } else {
                return { success: false, error: result.msg || `HTTP ${response.status}` };
            }
        } catch (error) {
            return { success: false, error: String(error) };
        }
    }

    // 如果地址不是官方 WxPusher，尝试使用 /wxpush 接口 (可能是一个 go-wxpush 实例但未配置 push_config)
    try {
        const apiUrl = resolvePushApiUrl(pushServiceUrl);

        // 尝试提取最新回复内容
        const displayContent = await extractContentSmart(env, content, aiConfig);
        const summaryBlock = buildSummaryBlock(summaryContext, displayContent);
        const contentWithSummary = `${summaryBlock}\n\n${displayContent}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: `📧 ${subject}`,
                content: contentWithSummary,
                userid: settings.wxpush_token,
                template_name: settings.template_name || 'email',
            }),
        });

        const result = await response.json() as ProxyPushResponse;
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
