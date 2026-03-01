import { Env } from '../types';
import { callLlmInWorker } from '../utils/aiClient';

export interface AiRuntimeConfig {
    apiKey?: string;
    provider?: string;
    model?: string;
    baseUrl?: string;
}

export interface PushSummaryContext {
    summary?: string;
    sentiment?: 'urgent' | 'normal' | 'low';
    importance_score?: number;
    action_items?: string[];
}

export function resolveAiProvider(provider?: string, fallback?: 'gemini' | 'openai'): 'gemini' | 'openai' {
    if (provider === 'gemini' || provider === 'openai') {
        return provider;
    }
    return fallback || 'gemini';
}

export async function extractContentSmart(
    env: Env,
    content: string,
    aiConfig?: AiRuntimeConfig
): Promise<string> {
    if (!content) return '(无内容)';

    // 优先使用用户配置的 AI，其次使用全局环境变量
    const apiKey = aiConfig?.apiKey || env.AI_API_KEY;
    const normalizedInput = normalizePlainText(convertHtmlToText(content));

    // 1) AI 分析（优先）
    if (apiKey && normalizedInput) {
        const aiResult = await analyzeEmailContentWithAi(env, normalizedInput, aiConfig);
        if (aiResult) {
            return aiResult;
        }
    }

    // 2) 规则回退分析
    const fallbackResult = analyzeEmailContentByRules(normalizedInput || content);
    if (fallbackResult) {
        return fallbackResult;
    }

    return '(无内容)';
}

export function getQuickSummary(
    summaryContext: PushSummaryContext | undefined,
    displayContent: string,
    subject: string
): string {
    const preferred = summaryContext?.summary?.trim();
    if (preferred) {
        return preferred.slice(0, 60);
    }

    const fallback = normalizePlainText(displayContent);
    if (!fallback) {
        return subject.slice(0, 60);
    }

    const firstLine = fallback.split('\n').find(line => line.trim()) || subject;
    return firstLine.trim().slice(0, 60);
}

export function buildSummaryBlock(
    summaryContext: PushSummaryContext | undefined,
    displayContent: string
): string {
    const quickSummary = getQuickSummary(summaryContext, displayContent, '新邮件');
    const sentimentMap: Record<string, string> = {
        urgent: '紧急',
        normal: '普通',
        low: '低优先级',
    };
    const sentimentLabel = summaryContext?.sentiment
        ? (sentimentMap[summaryContext.sentiment] || '普通')
        : '普通';
    const importanceText = typeof summaryContext?.importance_score === 'number'
        ? summaryContext.importance_score.toFixed(2)
        : '0.50';
    const actionItems = (summaryContext?.action_items || [])
        .filter(item => typeof item === 'string' && item.trim())
        .slice(0, 3);

    let block = `\n**摘要**: ${quickSummary}\n**紧急度**: ${sentimentLabel}\n**重要度**: ${importanceText}`;
    if (actionItems.length > 0) {
        block += `\n**待办**: ${actionItems.join('；')}`;
    }
    return block;
}

async function analyzeEmailContentWithAi(
    env: Env,
    normalizedContent: string,
    aiConfig?: AiRuntimeConfig
): Promise<string | null> {
    try {
        const response = await callLlmInWorker(
            [
                {
                    role: 'system',
                    content: `You are an email content analyst.
Your task:
1) Keep only the latest meaningful message.
2) Remove quoted history, signatures, routing headers, trackers, and noise.
3) Return plain text only (no HTML, no Markdown code fences).
4) Keep original language and key details.`,
                },
                { role: 'user', content: normalizedContent.substring(0, 12000) }
            ],
            {
                message: '',
                apiKey: aiConfig?.apiKey || env.AI_API_KEY || '',
                provider: resolveAiProvider(aiConfig?.provider, env.AI_PROVIDER),
                model: aiConfig?.model || env.AI_MODEL,
                baseUrl: aiConfig?.baseUrl
            },
            env
        );

        const text = normalizePlainText(convertHtmlToText(response.text || ''));
        if (!text) {
            return null;
        }
        return text;
    } catch (e) {
        console.warn('[Email Service] AI 分析失败，回退规则分析:', e);
        return null;
    }
}

function analyzeEmailContentByRules(rawContent: string): string {
    const asText = normalizePlainText(convertHtmlToText(rawContent));
    if (!asText) {
        return '';
    }

    let latest = extractLatestEmailContent(asText);

    // 清理常见引用行
    latest = latest
        .replace(/^\s*>.*$/gm, '')
        .replace(/^\s*(From|Sent|To|Subject|发件人|收件人|时间|主题)\s*:.*$/gim, '');

    latest = normalizePlainText(latest);
    return latest || asText;
}

function convertHtmlToText(content: string): string {
    if (!content) {
        return '';
    }

    const looksLikeHtml = /<\/?[a-z][^>]*>/i.test(content) || /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/.test(content);
    if (!looksLikeHtml) {
        return content;
    }

    let text = content;

    // 移除脚本和样式
    text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');

    // 常见块级标签转换为换行
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/(p|div|section|article|tr|table|h[1-6])>/gi, '\n');
    text = text.replace(/<li[^>]*>/gi, '- ');
    text = text.replace(/<\/li>/gi, '\n');

    // 去除所有标签
    text = text.replace(/<[^>]+>/g, ' ');

    // 反解 HTML 实体
    text = decodeHtmlEntities(text);

    return text;
}

function decodeHtmlEntities(content: string): string {
    if (!content) {
        return '';
    }

    const namedEntities: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        nbsp: ' ',
    };

    return content.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
        if (entity.startsWith('#x') || entity.startsWith('#X')) {
            const code = Number.parseInt(entity.slice(2), 16);
            return Number.isFinite(code) ? String.fromCodePoint(code) : match;
        }

        if (entity.startsWith('#')) {
            const code = Number.parseInt(entity.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : match;
        }

        return namedEntities[entity] || match;
    });
}

function normalizePlainText(content: string): string {
    return content
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
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
    return text.trim();
}
