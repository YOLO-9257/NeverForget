
import { Env, AiChatRequest, AiContext, AiMessage } from '../types';
import { success, serverError, badRequest } from '../utils/response';
import { callLlmInWorker } from '../utils/aiClient';
import { TOOLS, executeTool } from '../utils/aiTools';

type JsonRecord = Record<string, unknown>;

// 常量定义
const MAX_RECENT_MESSAGES = 20; // Increase buffer for detailed conversations
const MAX_TURNS = 5; // Max tool execution turns
const TOOL_CONTEXT_CHAR_LIMIT = 6000;
const MAX_TOOL_CALLS_PER_TURN = 6;
const MAX_IDENTICAL_TOOL_RETRY = 2;
const MAX_CONSECUTIVE_FAILURE_ROUNDS = 2;

const SUMMARY_INSTRUCTION = `
You are an expert AI memory manager. 
Your job is to read the current summary (if any) and a list of new recent messages between User and AI. 
Update the summary to include any new key information about the user's habits, preferences, tasks, or life details found in the recent messages.
Keep the summary concise but comprehensive. 
Discard trivial conversation (greetings, simple confirmations) unless they reveal a habit.
Output ONLY the new updated summary text. Do not output anything else.
`;

const BUTLER_SYSTEM_PROMPT = (summary: string, timezone: string, referenceDate: string) => `
You are "Smart Butler" (中控智能管家), a helpful, efficient, and thoughtful AI assistant.
You can operate the user's full system through tools:
- Reminder lifecycle: query/create/update/delete/detail/trigger/ack.
- Email operations: search emails, summarize email, sync mailbox, create task from email, block sender.
- Ops and settings: list/test notification channels, get system health, update global settings.
- Workflow automation: create/list/toggle automation rules.
You manage the user's tasks, schedule, and operational configuration.
You observe the user's habits and proactively provide suggestions.
Current reference timezone: ${timezone}
Current reference date in that timezone: ${referenceDate}

Tool usage policy:
1. If the user asks about system data or system actions, call tools instead of guessing.
2. You may chain multiple tools to complete one request.
3. If IDs are missing, list/search first and infer likely targets; only ask follow-up when ambiguous.
4. Never fabricate execution results; respond based on tool output only.
5. On tool failures, explain reason and provide next actionable step.
6. Never repeat the exact same failed tool call more than once unless user explicitly asks to retry.
7. For non-destructive actions (create/query/trigger/test), execute directly when required info is sufficient. Do not ask for confirmation first unless user explicitly asks to review.
8. "Immediate" intent rule: if user uses words like "立即/立刻/马上/现在" and intent is to send a message now, call tool 'send_immediate_message' directly. Do not convert to "now + 1 minute", and do not ask for current clock time.
9. Recipient matching rule: if user says "给小晴发送..." or similar, pass recipient/config_name to the tool so it can match saved config list (e.g., wxpush_userid / push_config). If no exact match, proceed with default config.
10. Template rule: if user specifies a detail template (e.g., "详情模板使用甜蜜提醒"), pass template_name (or template) to the same immediate-send tool in the same call.

Ambiguity resolution policy:
1. Target ambiguity:
- If there are multiple possible reminders/emails/channels/rules, show concise candidates with id + name and ask user to pick.
- Do not execute destructive operations (delete/disable/update) when target is ambiguous.
2. Time ambiguity:
- When user says relative time (today/tomorrow/next Monday/下周一/明天下午), convert to an absolute date in your confirmation.
- If timezone is unclear, default to the reference timezone above and explicitly state it.
3. Pronoun ambiguity:
- For phrases like "那个/这个/刚才那个", try to infer from recent context; if confidence is low, ask a single clarification question.
4. Immediate shorthand:
- If user says "帮我立即发送/现在就发" without repeating content, reuse the latest unambiguous draft/content from recent context and execute via 'send_immediate_message' directly.
5. Immediate + constraints:
- If user adds extra constraints in the same sentence (recipient/template/channel), still execute immediately in one tool call; do not switch to scheduling flow.

Failure recovery policy:
1. Validation failure (missing fields/format): ask only for the missing field(s), with one concise example.
2. Not found/permission failure: list recoverable options (search/list first, then retry with chosen id).
3. External/transient failure: explain it is temporary, suggest retry, and provide one next step.
4. If consecutive tool attempts fail, stop retry loops and switch to clarification mode.

Here is what you know about the user (Long-term Memory):
"""
${summary || "No prior information known."}
"""

Use this information to personalize your responses.
Always be polite, concise, and proactive, but prioritize action and results.
Replies must be in Chinese unless the user speaks English.
If you use a tool, answer the user based on the tool's output.
`;

function isRecord(value: unknown): value is JsonRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeToolArgs(value: unknown): JsonRecord {
    return isRecord(value) ? value : {};
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function serializeToolResultForContext(value: unknown): string {
    let serialized = '';
    try {
        serialized = JSON.stringify(value);
    } catch {
        serialized = String(value);
    }

    if (serialized.length <= TOOL_CONTEXT_CHAR_LIMIT) {
        return serialized;
    }

    return `${serialized.slice(0, TOOL_CONTEXT_CHAR_LIMIT)}...[truncated]`;
}

function serializeToolArgsForKey(value: unknown): string {
    try {
        return JSON.stringify(value ?? {});
    } catch {
        return '[unserializable]';
    }
}

function formatDateInTimezone(date: Date, timezone: string): string {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(date);
    } catch {
        return date.toISOString().split('T')[0];
    }
}

function buildRecoveryHint(toolName: string, errorMessage: string): string {
    const lower = errorMessage.toLowerCase();

    if (lower.includes('缺少') || lower.includes('required') || lower.includes('不能为空') || lower.includes('无效')) {
        return `[System Recovery Hint] 参数缺失或格式错误。请先向用户补问必要字段，再重试工具 '${toolName}'。`;
    }

    if (lower.includes('不存在') || lower.includes('not found') || lower.includes('无权限') || lower.includes('access')) {
        return `[System Recovery Hint] 目标不存在或无权限。先调用列表/搜索工具，给出候选ID，再让用户确认。`;
    }

    if (lower.includes('timeout') || lower.includes('网络') || lower.includes('temporary') || lower.includes('503')) {
        return `[System Recovery Hint] 疑似临时故障。向用户说明可稍后重试，并避免重复同一调用。`;
    }

    return `[System Recovery Hint] 工具执行失败。请改为澄清问题或给出下一步可执行选项，不要重复同一失败调用。`;
}

export async function handleAiChat(request: Request, env: Env, userKey: string): Promise<Response> {
    try {
        const body: AiChatRequest = await request.json();

        if (!body.message) {
            return badRequest('Message is required');
        }

        // 1. Fetch User Context
        const context = await env.DB.prepare(`
            SELECT * FROM ai_contexts WHERE user_key = ?
        `).bind(userKey).first<AiContext>();

        let summary = context?.summary || '';
        let recentHistory: AiMessage[] = context?.recent_history ? JSON.parse(context.recent_history) : [];

        // 2. Construct Initial Messages
        const timezone = env.TIMEZONE || 'UTC';
        const referenceDate = formatDateInTimezone(new Date(), timezone);
        const systemPrompt = BUTLER_SYSTEM_PROMPT(summary, timezone, referenceDate);

        // We clone history to a working array that includes the system prompt and new user message
        const currentConversation: AiMessage[] = [
            { role: 'system', content: systemPrompt },
            ...recentHistory,
            { role: 'user', content: body.message }
        ];

        let finalReply = "";
        let toolExecutionsCount = 0;
        let consecutiveFailureRounds = 0;
        const toolCallAttempts = new Map<string, number>();

        // 3. Agentic Loop
        while (toolExecutionsCount < MAX_TURNS) {
            console.log(`[AI Chat] Turn ${toolExecutionsCount + 1}`);

            let response;
            try {
                response = await callLlmInWorker(currentConversation, body, env, TOOLS);
            } catch (e: unknown) {
                console.error("LLM Call Failed", e);
                return serverError(`AI Service Unavailable: ${getErrorMessage(e)}`);
            }

            // Append Model Response to History
            // Even if it's a tool call, the model might have spoken some text "Okay, I'm checking..."
            // Or if it's just a tool call, text might be empty.
            // 重要：OpenAI API 不接受空 content，需要确保只添加非空文本
            if (response.text && response.text.trim() !== '') {
                currentConversation.push({ role: 'model', content: response.text });
                finalReply += response.text + "\n"; // Accumulate text for final output if multiple steps
            }

            // Check for Tool Calls
            if (response.toolCalls && response.toolCalls.length > 0) {
                const limitedToolCalls = response.toolCalls.slice(0, MAX_TOOL_CALLS_PER_TURN);
                console.log(`[AI Chat] Tool Calls Detected: ${response.toolCalls.length}, executing: ${limitedToolCalls.length}`);

                if (response.toolCalls.length > MAX_TOOL_CALLS_PER_TURN) {
                    currentConversation.push({
                        role: 'user',
                        content: `[System Guard] Too many tool calls in one turn. Only first ${MAX_TOOL_CALLS_PER_TURN} were executed.`
                    });
                }

                let successCountInRound = 0;
                let failureCountInRound = 0;
                let lastFailedTool = '';
                let lastFailedMessage = '';

                for (const toolCall of limitedToolCalls) {
                    const key = `${toolCall.name}:${serializeToolArgsForKey(toolCall.args)}`;
                    const attempt = (toolCallAttempts.get(key) || 0) + 1;
                    toolCallAttempts.set(key, attempt);

                    if (attempt > MAX_IDENTICAL_TOOL_RETRY) {
                        failureCountInRound++;
                        lastFailedTool = toolCall.name;
                        lastFailedMessage = '重复调用同一失败工具参数';
                        currentConversation.push({
                            role: 'user',
                            content: `[System Tool Guard] Skipped repeated tool call '${toolCall.name}' with same args after ${MAX_IDENTICAL_TOOL_RETRY} attempts.`
                        });
                        currentConversation.push({
                            role: 'user',
                            content: buildRecoveryHint(toolCall.name, lastFailedMessage)
                        });
                        continue;
                    }

                    try {
                        const toolArgs = normalizeToolArgs(toolCall.args);
                        const result = await executeTool(toolCall.name, toolArgs, env, userKey);
                        const safeResult = serializeToolResultForContext(result);
                        successCountInRound++;

                        // Feed result back to LLM as a User/System message representing Tool Output
                        currentConversation.push({
                            role: 'user', // Using 'user' role to simulate tool output is robust for simple LLM clients
                            content: `[System Tool Output] Tool '${toolCall.name}' returned: ${safeResult}`
                        });

                    } catch (toolError: unknown) {
                        const toolErrorMessage = getErrorMessage(toolError) || 'Unknown error';
                        failureCountInRound++;
                        lastFailedTool = toolCall.name;
                        lastFailedMessage = toolErrorMessage;
                        currentConversation.push({
                            role: 'user',
                            content: `[System Tool Error] Tool '${toolCall.name}' failed: ${toolErrorMessage}`
                        });
                        currentConversation.push({
                            role: 'user',
                            content: buildRecoveryHint(toolCall.name, toolErrorMessage)
                        });
                    }
                }

                if (successCountInRound === 0 && failureCountInRound > 0) {
                    consecutiveFailureRounds++;
                    currentConversation.push({
                        role: 'user',
                        content: `[System Failure State] Consecutive failure rounds: ${consecutiveFailureRounds}`
                    });
                } else {
                    consecutiveFailureRounds = 0;
                }

                if (consecutiveFailureRounds >= MAX_CONSECUTIVE_FAILURE_ROUNDS) {
                    if (!response.text || !response.text.trim()) {
                        finalReply = `我连续两次执行都失败了（最近失败工具：${lastFailedTool || 'unknown'}）。请您补充更明确的信息（例如具体ID/时间/账户），我再继续操作。`;
                    }
                    break;
                }

                toolExecutionsCount++;
                // Continue loop to let LLM process the tool output
            } else {
                // No tools called, we are done
                if (!response.text) {
                    finalReply = "抱歉，我没能理解您的请求。请换一种说法再试。"; // Fallback
                } else {
                    finalReply = response.text; // Use the final text as reply (usually better than accumulated if last step summarizes)
                }
                break;
            }
        }

        if (!finalReply || !finalReply.trim()) {
            if (toolExecutionsCount >= MAX_TURNS) {
                finalReply = `我已执行到最大步骤（${MAX_TURNS}轮）仍未完成。请补充更明确的目标信息（如具体ID/账户/时间）后我继续处理。`;
            } else {
                finalReply = '抱歉，我目前无法安全完成这次操作。请补充更具体的信息后重试。';
            }
        }

        // 4. Update History (Persist only the logical flow, maybe simplify)
        // We append the ORIGINAL user message and the FINAL summary reply to the stored history
        // To save space and keeping it clean, we might skipping the intermediate tool steps in the Database History?
        // OR we keep them to maintain context of what happened. 
        // Let's keep the User Message and the Final Reply for now to save tokens, 
        // unless the user wants detailed memory of tool usage. 
        // For "Smart Butler", remembering "I set a task" is important.
        // So we append: User: "Set task", Model: "Done, I created task ID 123".

        recentHistory.push({ role: 'user', content: body.message, timestamp: Date.now() });
        recentHistory.push({ role: 'model', content: finalReply, timestamp: Date.now() });

        // 5. Compression Logic
        let isCompressed = false;
        if (recentHistory.length >= MAX_RECENT_MESSAGES) {
            try {
                const messagesToCompress = recentHistory;
                const compressionPrompt = `
Old Summary: ${summary}

Recent Conversation:
${messagesToCompress.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}

Instruction: ${SUMMARY_INSTRUCTION}
`;
                // Simple call without tools for compression
                const compressionResponse = await callLlmInWorker([
                    { role: 'user', content: compressionPrompt }
                ], body, env); // No tools pass

                const newSummary = compressionResponse.text; // Access text property

                if (newSummary && newSummary.length > 10) {
                    summary = newSummary;
                    recentHistory = recentHistory.slice(-2);
                    isCompressed = true;
                }
            } catch (e) {
                console.error("Compression Failed", e);
            }
        }

        // 6. Save to DB
        const now = Date.now();
        await env.DB.prepare(`
            INSERT INTO ai_contexts (user_key, summary, recent_history, last_updated)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_key) DO UPDATE SET
            summary = excluded.summary,
            recent_history = excluded.recent_history,
            last_updated = excluded.last_updated
        `).bind(userKey, summary, JSON.stringify(recentHistory), now).run();

        return success({
            reply: finalReply,
            context_updated: isCompressed
        });

    } catch (error: unknown) {
        console.error('AI Chat Error:', error);
        return serverError(`AI Chat Error: ${getErrorMessage(error)}`);
    }
}

export async function getAiHistory(request: Request, env: Env, userKey: string): Promise<Response> {
    try {
        const context = await env.DB.prepare(`
            SELECT * FROM ai_contexts WHERE user_key = ?
        `).bind(userKey).first<AiContext>();

        return success({
            summary: context?.summary || '',
            history: context?.recent_history ? JSON.parse(context.recent_history) : []
        });
    } catch (error: unknown) {
        console.error('Get AI History Error:', error);
        return serverError(`Get AI History Error: ${getErrorMessage(error)}`);
    }
}

