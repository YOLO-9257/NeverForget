type JsonRecord = Record<string, unknown>;

interface StreamToolCallState {
    id?: string;
    type?: string;
    functionName?: string;
    functionArguments: string;
}

function isRecord(value: unknown): value is JsonRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeJsonParse(text: string): unknown | null {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function extractSsePayloads(raw: string): string[] {
    const payloads: string[] = [];

    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) {
            continue;
        }

        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') {
            continue;
        }

        payloads.push(payload);
    }

    return payloads;
}

function readOpenAiDelta(chunk: unknown): JsonRecord | null {
    if (!isRecord(chunk)) {
        return null;
    }

    const choices = chunk.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
        return null;
    }

    const firstChoice = choices[0];
    if (!isRecord(firstChoice)) {
        return null;
    }

    const delta = firstChoice.delta;
    return isRecord(delta) ? delta : null;
}

function mergeOpenAiToolCalls(chunks: unknown[]): JsonRecord[] {
    const merged = new Map<number, StreamToolCallState>();

    for (const chunk of chunks) {
        const delta = readOpenAiDelta(chunk);
        if (!delta) {
            continue;
        }

        const partialToolCalls = delta.tool_calls;
        if (!Array.isArray(partialToolCalls)) {
            continue;
        }

        for (const partial of partialToolCalls) {
            if (!isRecord(partial)) {
                continue;
            }

            const index = typeof partial.index === 'number'
                ? partial.index
                : merged.size;

            const current = merged.get(index) || {
                functionArguments: '',
            };

            if (typeof partial.id === 'string' && partial.id) {
                current.id = partial.id;
            }
            if (typeof partial.type === 'string' && partial.type) {
                current.type = partial.type;
            }

            const functionPayload = partial.function;
            if (isRecord(functionPayload)) {
                if (typeof functionPayload.name === 'string' && functionPayload.name) {
                    current.functionName = functionPayload.name;
                }
                if (typeof functionPayload.arguments === 'string') {
                    current.functionArguments += functionPayload.arguments;
                }
            }

            merged.set(index, current);
        }
    }

    return Array.from(merged.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, state]) => {
            const toolCall: JsonRecord = {
                type: state.type || 'function',
                function: {
                    name: state.functionName || '',
                    arguments: state.functionArguments,
                },
            };

            if (state.id) {
                toolCall.id = state.id;
            }

            return toolCall;
        });
}

export function parseLlmResponseText(text: string): unknown {
    const trimmed = text.trim();
    if (!trimmed) {
        throw new Error('Empty LLM response');
    }

    if (!trimmed.startsWith('data:')) {
        return JSON.parse(trimmed);
    }

    const payloads = extractSsePayloads(trimmed);
    if (payloads.length === 0) {
        throw new Error('Invalid SSE format: no data payload');
    }

    const parsedChunks = payloads
        .map(safeJsonParse)
        .filter((chunk): chunk is unknown => chunk !== null);

    if (parsedChunks.length === 0) {
        throw new Error('Invalid SSE format: no valid JSON payload');
    }

    let mergedContent = '';
    let hasOpenAiDelta = false;

    for (const chunk of parsedChunks) {
        const delta = readOpenAiDelta(chunk);
        if (!delta) {
            continue;
        }

        hasOpenAiDelta = true;
        if (typeof delta.content === 'string') {
            mergedContent += delta.content;
        }
    }

    if (hasOpenAiDelta) {
        const toolCalls = mergeOpenAiToolCalls(parsedChunks);
        const message: JsonRecord = {
            role: 'assistant',
            content: mergedContent,
        };

        if (toolCalls.length > 0) {
            message.tool_calls = toolCalls;
        }

        return {
            choices: [{ message }],
        };
    }

    // 非 OpenAI 流式格式时，优先使用最后一个有效 chunk（通常是完整结果）
    return parsedChunks[parsedChunks.length - 1];
}
