/**
 * 通用 AI 服务模块
 * 支持多模型管理、切换和通用调用接口
 */

export type AiProvider = 'gemini' | 'openai' | 'custom';

// AI 模型配置概要
export interface AiProfile {
    id: string;
    name: string;
    provider: AiProvider;
    apiKey: string;
    baseUrl?: string;
    model?: string;
    isDefault?: boolean;
}

// 通用 AI 响应接口
export interface AiResponse {
    text: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

/**
 * 获取所有保存的 AI Profile
 */
export function getAiProfiles(): AiProfile[] {
    const saved = localStorage.getItem('ai_profiles');
    if (!saved) {
        // 尝试迁移旧配置
        const oldConfig = localStorage.getItem('llm_api_config');
        if (oldConfig) {
            try {
                const parsed = JSON.parse(oldConfig);
                const defaultProfile: AiProfile = {
                    id: crypto.randomUUID(),
                    name: 'Default Model',
                    provider: parsed.provider,
                    apiKey: parsed.apiKey,
                    baseUrl: parsed.baseUrl,
                    model: parsed.model,
                    isDefault: true
                };
                saveAiProfiles([defaultProfile]);
                return [defaultProfile];
            } catch (error) {
                console.warn('迁移旧 AI 配置失败:', error);
            }
        }
        return [];
    }
    try {
        return JSON.parse(saved);
    } catch {
        return [];
    }
}

/**
 * 保存 AI Profile 列表
 */
export function saveAiProfiles(profiles: AiProfile[]): void {
    localStorage.setItem('ai_profiles', JSON.stringify(profiles));
}

/**
 * 获取默认 AI Profile
 */
export function getDefaultProfile(): AiProfile | null {
    const profiles = getAiProfiles();
    return profiles.find(p => p.isDefault) || profiles[0] || null;
}

/**
 * 调用 AI 模型生成内容
 */
export async function generateContent(
    prompt: string,
    profileId?: string, // 如果不传则使用默认
    systemPrompt?: string
): Promise<string> {
    const profiles = getAiProfiles();
    const profile = profileId
        ? profiles.find(p => p.id === profileId)
        : (profiles.find(p => p.isDefault) || profiles[0]);

    if (!profile) {
        throw new Error('未找到可用的 AI 模型配置');
    }

    try {
        if (profile.provider === 'gemini') {
            return await callGeminiApi(prompt, profile, systemPrompt);
        } else {
            return await callOpenAiCompatibleApi(prompt, profile, systemPrompt);
        }
    } catch (error) {
        console.error('AI API 调用失败:', error);
        throw error;
    }
}

/**
 * 调用 Gemini API
 */
async function callGeminiApi(prompt: string, profile: AiProfile, systemPrompt?: string): Promise<string> {
    const baseUrl = profile.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    const model = profile.model || 'gemini-2.0-flash';

    // Gemini 原生支持 system_instruction 但 v1beta rest api 格式较复杂
    // 这里简单地将 system prompt 拼接到 user prompt 前面，或者使用 chat 格式
    let finalPrompt = prompt;
    if (systemPrompt) {
        finalPrompt = `${systemPrompt}\n\nUser Input:\n${prompt}`;
    }

    const response = await fetch(`${baseUrl}/models/${model}:generateContent?key=${profile.apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: finalPrompt }] }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2000,
            },
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * 解析响应文本，支持普通 JSON 和 SSE (Server-Sent Events) 流式格式
 * SSE 格式通常以 "data: {json}" 开头
 */
function parseResponseText(text: string): unknown {
    const trimmed = text.trim();

    // 检查是否是 SSE 格式 (以 "data:" 开头)
    if (trimmed.startsWith('data:')) {
        // 解析 SSE 流式响应 - 合并所有 chunk 的 content
        const lines = trimmed.split('\n');
        let mergedContent = '';

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('data:')) {
                const dataContent = trimmedLine.substring(5).trim();
                // 跳过 "[DONE]" 结束标记
                if (dataContent && dataContent !== '[DONE]') {
                    try {
                        const chunk = JSON.parse(dataContent);
                        // OpenAI 流式响应的每个 chunk 包含 choices[0].delta.content
                        const delta = chunk.choices?.[0]?.delta;
                        if (delta?.content) {
                            mergedContent += delta.content;
                        }
                    } catch {
                        // 跳过无法解析的 chunk
                    }
                }
            }
        }

        if (mergedContent) {
            // 返回一个类似完整 OpenAI 响应的结构
            return {
                choices: [{
                    message: {
                        role: 'assistant',
                        content: mergedContent
                    }
                }]
            };
        }

        throw new Error('Invalid SSE format: unable to parse response');
    }

    // 普通 JSON 格式
    return JSON.parse(trimmed);
}

/**
 * 调用 OpenAI 兼容 API
 */
async function callOpenAiCompatibleApi(prompt: string, profile: AiProfile, systemPrompt?: string): Promise<string> {
    const baseUrl = profile.baseUrl || 'https://api.openai.com/v1';
    const model = profile.model || (profile.provider === 'openai' ? 'gpt-4o-mini' : 'default');

    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${profile.apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: 0.7,
            max_tokens: 2000,
            stream: false,  // 显式禁用流式响应
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`${profile.provider} API Error (${response.status}): ${errText}`);
    }

    // 使用 parseResponseText 支持 SSE 和普通 JSON 格式（后备方案）
    const responseText = await response.text();
    const data = parseResponseText(responseText) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content || '';
}
