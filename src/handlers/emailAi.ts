
import { Env } from '../types';
import { success, error } from '../utils/response';
import { callLlmInWorker } from '../utils/aiClient';

/**
 * AI 解析/修复邮件内容
 */
export async function parseEmailContent(request: Request, env: Env, userKey: string): Promise<Response> {
    try {
        const body = await request.json() as { content: string; mode?: 'repair' | 'extract' };

        if (!body.content) return error('Content is required', 1, 400);

        // 获取 AI 配置 (优先尝试从 saved_configs 获取)
        let aiConfig = {
            apiKey: env.AI_API_KEY,
            provider: env.AI_PROVIDER,
            model: env.AI_MODEL
        };

        // 尝试查询用户保存的 AI 配置
        try {
            const savedConfig = await env.DB.prepare(`
                SELECT value FROM saved_configs WHERE user_key = ? AND category = 'ai_config' LIMIT 1
            `).bind(userKey).first<{ value: string }>();

            if (savedConfig) {
                const parsed = JSON.parse(savedConfig.value);
                if (parsed.apiKey) aiConfig.apiKey = parsed.apiKey;
                if (parsed.provider) aiConfig.provider = parsed.provider;
                if (parsed.model) aiConfig.model = parsed.model;
            }
        } catch (e) {
            // Ignore DB error
        }

        if (!aiConfig.apiKey) {
            return error('未配置 AI API Key (需在设置中保存 AI 配置或设置环境变量)', 1, 400);
        }

        let systemPrompt = '';
        if (body.mode === 'repair') {
            systemPrompt = `You are a text repair expert. The user will provide email content that may be garbled (Mojibake), incorrectly decoded (e.g. GBK vs UTF-8), or contain raw Quoted-Printable/Base64 sequences.
Your task is to:
1. Detect and fix any encoding errors to restore readable text.
2. If the text is HTML, extract the main human-readable content and convert it to clean Markdown.
3. Remove CSS styles, scripts, and excessively complex formatting.
4. Return ONLY the repaired, readable text content. Do not add conversational filler.`;
        } else {
            // Default: Extract latest
            systemPrompt = `You are an email formatting assistant. 
Your task is to extract the LATEST message content from an email thread, removing all quoted replies, signatures, and headers (like "On ... wrote:").
Return ONLY the cleaned latest message text. Do not add any explanations or markdown blocks unless necessary for the content itself.
If the email seems to be a new message without history, return it as is.
Keep the original language.`;
        }

        const response = await callLlmInWorker(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: body.content.substring(0, 10000) } // Limit length
            ],
            {
                message: '',
                apiKey: aiConfig.apiKey || '',
                provider: (aiConfig.provider as any) || 'gemini',
                model: aiConfig.model
            },
            env
        );

        return success({ content: response.text });

    } catch (e) {
        console.error('[EmailAI] Parse failed:', e);
        return error('AI 解析失败: ' + String(e), 1, 500);
    }
}
