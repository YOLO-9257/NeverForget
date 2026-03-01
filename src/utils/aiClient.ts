import { AiChatRequest, AiMessage, Env } from '../types';
import { parseLlmResponseText } from './llmResponseParser';

// 重试配置
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

type JsonRecord = Record<string, unknown>;

export interface ToolCall {
    id?: string;
    name: string;
    args: unknown;
}

export interface ToolDefinition {
    name: string;
    description?: string;
    parameters?: unknown;
}

export interface LlmResponse {
    text: string;
    toolCalls?: ToolCall[];
}

function isRecord(value: unknown): value is JsonRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function safeJsonParse(text: string): unknown | null {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function extractMessageText(content: unknown): string {
    if (typeof content === 'string') {
        return content;
    }

    if (!Array.isArray(content)) {
        return '';
    }

    const parts: string[] = [];
    for (const item of content) {
        if (!isRecord(item)) {
            continue;
        }

        if (typeof item.text === 'string') {
            parts.push(item.text);
            continue;
        }

        if (typeof item.content === 'string') {
            parts.push(item.content);
        }
    }

    return parts.join('');
}

function parseToolArguments(rawArguments: unknown): unknown {
    if (typeof rawArguments !== 'string') {
        return rawArguments ?? {};
    }

    const parsed = safeJsonParse(rawArguments);
    return parsed ?? {};
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function buildGeminiBody(messages: AiMessage[], tools?: ToolDefinition[]): JsonRecord {
    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const contents = chatMessages.map((message) => ({
        role: message.role === 'model' ? 'model' : 'user',
        parts: [{ text: message.content }],
    }));

    const body: JsonRecord = {
        contents,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2000,
        },
    };

    if (systemMessage) {
        body.systemInstruction = {
            parts: [{ text: systemMessage.content }],
        };
    }

    if (tools && tools.length > 0) {
        body.tools = [{
            function_declarations: tools.map((tool) => ({
                name: tool.name,
                description: tool.description || '',
                parameters: tool.parameters ?? { type: 'object', properties: {} },
            })),
        }];
    }

    return body;
}

function buildOpenAiBody(messages: AiMessage[], modelName: string, tools?: ToolDefinition[]): JsonRecord {
    const openaiMessages = messages
        .filter(m => m.content && m.content.trim() !== '')
        .map((message) => ({
            role: message.role === 'model' ? 'assistant' : message.role,
            content: message.content,
        }));

    const body: JsonRecord = {
        model: modelName,
        messages: openaiMessages,
        temperature: 0.7,
        max_tokens: 2000,
        stream: false,
    };

    if (tools && tools.length > 0) {
        body.tools = tools.map((tool) => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description || '',
                parameters: tool.parameters ?? { type: 'object', properties: {} },
            },
        }));
        body.tool_choice = 'auto';
    }

    return body;
}

/**
 * 简单的 AI 客户端，用于 Worker 端调用外部 LLM
 */
export async function callLlmInWorker(
    messages: AiMessage[],
    config: AiChatRequest,
    env: Env,
    tools?: ToolDefinition[]
): Promise<LlmResponse> {
    const provider = config.provider || env.AI_PROVIDER || 'gemini';
    const apiKey = config.apiKey || env.AI_API_KEY;

    if (!apiKey) {
        throw new Error('Missing API Key provided in request or environment');
    }

    if (provider === 'gemini') {
        return callGemini(messages, apiKey, config.baseUrl, config.model, tools);
    }

    return callOpenAI(messages, apiKey, config.baseUrl, config.model, tools);
}

async function callGemini(
    messages: AiMessage[],
    apiKey: string,
    baseUrl?: string,
    model?: string,
    tools?: ToolDefinition[]
): Promise<LlmResponse> {
    const url = baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    const modelName = model || 'gemini-2.0-flash';
    const body = buildGeminiBody(messages, tools);

    let lastErrorMessage = '';

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(`${url}/models/${modelName}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Gemini API Error: ${response.status} ${errText}`);
            }

            const responseText = await response.text();
            const parsed = parseLlmResponseText(responseText);
            const parsedRecord = isRecord(parsed) ? parsed : {};

            const candidates = asArray(parsedRecord.candidates);
            const firstCandidate = isRecord(candidates[0]) ? candidates[0] : null;
            const content = firstCandidate && isRecord(firstCandidate.content)
                ? firstCandidate.content
                : null;
            const parts = asArray(content?.parts);

            let text = '';
            const toolCalls: ToolCall[] = [];

            for (const rawPart of parts) {
                const part = isRecord(rawPart) ? rawPart : null;
                if (!part) {
                    continue;
                }

                if (typeof part.text === 'string') {
                    text += part.text;
                }

                const functionCall = isRecord(part.functionCall) ? part.functionCall : null;
                if (functionCall && typeof functionCall.name === 'string' && functionCall.name) {
                    toolCalls.push({
                        name: functionCall.name,
                        args: functionCall.args ?? {},
                    });
                }
            }

            return { text, toolCalls: toolCalls.length ? toolCalls : undefined };
        } catch (error) {
            lastErrorMessage = getErrorMessage(error);
            console.warn(`[Gemini] Attempt ${attempt}/${MAX_RETRIES} failed: ${lastErrorMessage}`);

            if (attempt < MAX_RETRIES) {
                await delay(RETRY_DELAY_MS * attempt);
            }
        }
    }

    throw new Error(`Gemini API failed after ${MAX_RETRIES} retries: ${lastErrorMessage}`);
}

async function callOpenAI(
    messages: AiMessage[],
    apiKey: string,
    baseUrl?: string,
    model?: string,
    tools?: ToolDefinition[]
): Promise<LlmResponse> {
    const url = baseUrl || 'https://api.openai.com/v1';
    const modelName = model || 'gpt-4o-mini';
    const body = buildOpenAiBody(messages, modelName, tools);

    let lastErrorMessage = '';

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(`${url}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`OpenAI API Error: ${response.status} ${errText}`);
            }

            const responseText = await response.text();
            const parsed = parseLlmResponseText(responseText);
            const parsedRecord = isRecord(parsed) ? parsed : {};

            const choices = asArray(parsedRecord.choices);
            const firstChoice = isRecord(choices[0]) ? choices[0] : null;
            const message = firstChoice && isRecord(firstChoice.message)
                ? firstChoice.message
                : null;

            const text = extractMessageText(message?.content);
            const rawToolCalls = asArray(message?.tool_calls);
            const toolCalls: ToolCall[] = [];

            for (const rawToolCall of rawToolCalls) {
                const toolCallRecord = isRecord(rawToolCall) ? rawToolCall : null;
                if (!toolCallRecord) {
                    continue;
                }

                if (toolCallRecord.type !== 'function') {
                    continue;
                }

                const functionPayload = isRecord(toolCallRecord.function)
                    ? toolCallRecord.function
                    : null;

                if (!functionPayload || typeof functionPayload.name !== 'string' || !functionPayload.name) {
                    continue;
                }

                toolCalls.push({
                    id: typeof toolCallRecord.id === 'string' ? toolCallRecord.id : undefined,
                    name: functionPayload.name,
                    args: parseToolArguments(functionPayload.arguments),
                });
            }

            return { text, toolCalls: toolCalls.length ? toolCalls : undefined };
        } catch (error) {
            lastErrorMessage = getErrorMessage(error);
            console.warn(`[OpenAI] Attempt ${attempt}/${MAX_RETRIES} failed: ${lastErrorMessage}`);

            if (attempt < MAX_RETRIES) {
                await delay(RETRY_DELAY_MS * attempt);
            }
        }
    }

    throw new Error(`OpenAI API failed after ${MAX_RETRIES} retries: ${lastErrorMessage}`);
}
