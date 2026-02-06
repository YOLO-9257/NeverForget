
import { Env, AiChatRequest, AiContext, AiMessage } from '../types';
import { success, serverError, badRequest } from '../utils/response';
import { callLlmInWorker } from '../utils/aiClient';
import { TOOLS, executeTool } from '../utils/aiTools';

// 常量定义
const MAX_RECENT_MESSAGES = 20; // Increase buffer for detailed conversations
const MAX_TURNS = 5; // Max tool execution turns

const SUMMARY_INSTRUCTION = `
You are an expert AI memory manager. 
Your job is to read the current summary (if any) and a list of new recent messages between User and AI. 
Update the summary to include any new key information about the user's habits, preferences, tasks, or life details found in the recent messages.
Keep the summary concise but comprehensive. 
Discard trivial conversation (greetings, simple confirmations) unless they reveal a habit.
Output ONLY the new updated summary text. Do not output anything else.
`;

const BUTLER_SYSTEM_PROMPT = (summary: string) => `
You are "Smart Butler" (中控智能管家), a helpful, efficient, and thoughtful AI assistant.
You have access to the user's system to Query Reminders, Create Tasks, and Check Reports using your tools.
You manage the user's tasks and schedule.
You observe the user's habits and try to anticipate their needs.

Here is what you know about the user (Long-term Memory):
"""
${summary || "No prior information known."}
"""

Use this information to personalize your responses.
Always be polite, concise, and proactive.
If the user asks to schedule something, guide them or confirm details.
Replies must be in Chinese unless the user speaks English.
If you use a tool, answer the user based on the tool's output.
`;

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
        const systemPrompt = BUTLER_SYSTEM_PROMPT(summary);

        // We clone history to a working array that includes the system prompt and new user message
        const currentConversation: AiMessage[] = [
            { role: 'system', content: systemPrompt },
            ...recentHistory,
            { role: 'user', content: body.message }
        ];

        let finalReply = "";
        let toolExecutionsCount = 0;

        // 3. Agentic Loop
        while (toolExecutionsCount < MAX_TURNS) {
            console.log(`[AI Chat] Turn ${toolExecutionsCount + 1}`);

            let response;
            try {
                response = await callLlmInWorker(currentConversation, body, env, TOOLS);
            } catch (e: any) {
                console.error("LLM Call Failed", e);
                return serverError(`AI Service Unavailable: ${e.message}`);
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
                console.log(`[AI Chat] Tool Calls Detected: ${response.toolCalls.length}`);

                for (const toolCall of response.toolCalls) {
                    try {
                        const result = await executeTool(toolCall.name, toolCall.args, env, userKey);

                        // Feed result back to LLM as a User/System message representing Tool Output
                        currentConversation.push({
                            role: 'user', // Using 'user' role to simulate tool output is robust for simple LLM clients
                            content: `[System Tool Output] Tool '${toolCall.name}' returned: ${JSON.stringify(result)}`
                        });

                    } catch (toolError: any) {
                        currentConversation.push({
                            role: 'user',
                            content: `[System Tool Error] Tool '${toolCall.name}' failed: ${toolError.message}`
                        });
                    }
                }
                toolExecutionsCount++;
                // Continue loop to let LLM process the tool output
            } else {
                // No tools called, we are done
                if (!response.text) {
                    finalReply = "I'm sorry, I didn't understand that."; // Fallback
                } else {
                    finalReply = response.text; // Use the final text as reply (usually better than accumulated if last step summarizes)
                }
                break;
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

    } catch (error: any) {
        console.error('AI Chat Error:', error);
        return serverError(`AI Chat Error: ${error.message}`);
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
    } catch (error: any) {
        console.error('Get AI History Error:', error);
        return serverError(`Get AI History Error: ${error.message}`);
    }
}

