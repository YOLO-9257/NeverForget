import { AiChatRequest, AiMessage, Env } from '../types';

// 重试配置
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export interface ToolCall {
    id?: string;
    name: string;
    args: any;
}

export interface LlmResponse {
    text: string;
    toolCalls?: ToolCall[];
}

/**
 * 解析响应文本，支持普通 JSON 和 SSE (Server-Sent Events) 流式格式
 * SSE 格式通常以 "data: {json}" 开头
 */
function parseResponseText(text: string): any {
    const trimmed = text.trim();

    // 检查是否是 SSE 格式 (以 "data:" 开头)
    if (trimmed.startsWith('data:')) {
        // 解析 SSE 流式响应
        const lines = trimmed.split('\n');
        let lastDataLine: string | null = null;

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('data:')) {
                const dataContent = trimmedLine.substring(5).trim();
                // 跳过 "[DONE]" 结束标记
                if (dataContent !== '[DONE]') {
                    lastDataLine = dataContent;
                }
            }
        }

        // 如果找到了有效的 data 行，尝试解析
        if (lastDataLine) {
            // 对于流式响应，可能需要合并多个 chunk
            // 这里我们取最后一个有效的 data 行（通常包含完整响应）
            // 或者尝试解析第一个 chunk
            const firstDataLine = lines
                .map(l => l.trim())
                .find(l => l.startsWith('data:') && !l.includes('[DONE]'));

            if (firstDataLine) {
                const dataContent = firstDataLine.substring(5).trim();
                try {
                    return JSON.parse(dataContent);
                } catch (e) {
                    // 如果第一个 chunk 解析失败，尝试合并所有 chunk 的 content
                    return extractFromSSEChunks(lines);
                }
            }
        }

        throw new Error(`Invalid SSE format: unable to parse response`);
    }

    // 普通 JSON 格式
    return JSON.parse(trimmed);
}

/**
 * 从 SSE chunks 中提取并合并内容
 */
function extractFromSSEChunks(lines: string[]): any {
    const chunks: any[] = [];

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('data:')) {
            const dataContent = trimmedLine.substring(5).trim();
            if (dataContent && dataContent !== '[DONE]') {
                try {
                    chunks.push(JSON.parse(dataContent));
                } catch (e) {
                    // 跳过无法解析的 chunk
                }
            }
        }
    }

    if (chunks.length === 0) {
        throw new Error('No valid chunks found in SSE response');
    }

    // 合并 OpenAI 格式的流式响应 chunks
    // OpenAI 流式响应的每个 chunk 包含 choices[0].delta.content
    if (chunks[0]?.choices?.[0]?.delta !== undefined) {
        let mergedContent = '';
        for (const chunk of chunks) {
            const delta = chunk.choices?.[0]?.delta;
            if (delta?.content) {
                mergedContent += delta.content;
            }
        }
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

    // 如果不是流式格式，返回第一个完整的 chunk
    return chunks[0];
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 简单的 AI 客户端，用于 Worker 端调用外部 LLM
 */
export async function callLlmInWorker(
    messages: AiMessage[],
    config: AiChatRequest,
    env: Env,
    tools?: any[] // Generic tool definitions
): Promise<LlmResponse> {
    const provider = config.provider || env.AI_PROVIDER || 'gemini';
    const apiKey = config.apiKey || env.AI_API_KEY;

    if (!apiKey) {
        throw new Error('Missing API Key provided in request or environment');
    }

    if (provider === 'gemini') {
        return await callGemini(messages, apiKey, config.baseUrl, config.model, tools);
    } else {
        return await callOpenAI(messages, apiKey, config.baseUrl, config.model, tools);
    }
}

async function callGemini(messages: AiMessage[], apiKey: string, baseUrl?: string, model?: string, tools?: any[]): Promise<LlmResponse> {
    const url = baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    const modelName = model || 'gemini-2.0-flash';

    // Separate system prompt
    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const contents = chatMessages.map(m => {
        return {
            role: m.role === 'model' ? 'model' : 'user',
            parts: [{ text: m.content }]
        };
    });

    const body: any = {
        contents,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2000,
        }
    };

    if (systemMessage) {
        body.systemInstruction = {
            parts: [{ text: systemMessage.content }]
        };
    }

    if (tools && tools.length > 0) {
        body.tools = [{
            function_declarations: tools.map(t => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters
            }))
        }];
    }

    let lastError: Error | null = null;

    // 自动重试机制
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(`${url}/models/${modelName}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Gemini API Error: ${response.status} ${errText}`);
            }

            // 使用 parseResponseText 支持 SSE 和普通 JSON 格式
            const responseText = await response.text();
            const data: any = parseResponseText(responseText);

            const candidate = data.candidates?.[0];
            const content = candidate?.content;
            const parts = content?.parts || [];

            let text = "";
            const toolCalls: ToolCall[] = [];

            for (const part of parts) {
                if (part.text) {
                    text += part.text;
                }
                if (part.functionCall) {
                    toolCalls.push({
                        name: part.functionCall.name,
                        args: part.functionCall.args
                    });
                }
            }

            return { text, toolCalls: toolCalls.length ? toolCalls : undefined };

        } catch (e: any) {
            lastError = e;
            console.warn(`[Gemini] Attempt ${attempt}/${MAX_RETRIES} failed: ${e.message}`);

            if (attempt < MAX_RETRIES) {
                // 等待后重试
                await delay(RETRY_DELAY_MS * attempt);
            }
        }
    }

    // 所有重试都失败
    throw new Error(`Gemini API failed after ${MAX_RETRIES} retries: ${lastError?.message}`);
}


async function callOpenAI(messages: AiMessage[], apiKey: string, baseUrl?: string, model?: string, tools?: any[]): Promise<LlmResponse> {
    const url = baseUrl || 'https://api.openai.com/v1';
    const modelName = model || 'gpt-4o-mini';

    // OpenAI API 不接受空 content，需要过滤掉空消息
    const openaiMessages = messages
        .filter(m => m.content && m.content.trim() !== '')
        .map(m => ({
            role: m.role === 'model' ? 'assistant' : m.role,
            content: m.content
        }));

    const body: any = {
        model: modelName,
        messages: openaiMessages,
        temperature: 0.7,
        max_tokens: 2000,
        stream: false  // 显式禁用流式响应
    };

    if (tools && tools.length > 0) {
        body.tools = tools.map(t => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters
            }
        }));
        body.tool_choice = "auto";
    }

    let lastError: Error | null = null;

    // 自动重试机制
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(`${url}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`OpenAI API Error: ${response.status} ${errText}`);
            }

            // 使用 parseResponseText 支持 SSE 和普通 JSON 格式
            const responseText = await response.text();
            const data: any = parseResponseText(responseText);

            const choice = data.choices?.[0];
            const message = choice?.message;

            const text = message?.content || "";
            const toolCalls: ToolCall[] = [];

            if (message?.tool_calls) {
                for (const tc of message.tool_calls) {
                    if (tc.type === 'function') {
                        try {
                            toolCalls.push({
                                id: tc.id,
                                name: tc.function.name,
                                args: JSON.parse(tc.function.arguments)
                            });
                        } catch (e) {
                            console.error("Failed to parse tool args", e);
                        }
                    }
                }
            }

            return { text, toolCalls: toolCalls.length ? toolCalls : undefined };

        } catch (e: any) {
            lastError = e;
            console.warn(`[OpenAI] Attempt ${attempt}/${MAX_RETRIES} failed: ${e.message}`);

            if (attempt < MAX_RETRIES) {
                // 等待后重试
                await delay(RETRY_DELAY_MS * attempt);
            }
        }
    }

    // 所有重试都失败
    throw new Error(`OpenAI API failed after ${MAX_RETRIES} retries: ${lastError?.message}`);
}
