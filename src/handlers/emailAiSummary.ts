/**
 * Phase 1.2: AI摘要与智能提取 - 后端API
 * 
 * 功能：
 * - 邮件AI摘要生成
 * - 关键信息提取（实体、待办事项）
 * - 异步处理队列
 * - 从邮件创建提醒
 */

import { Env, EmailSummaryResult, AIExtractedEntity, AIProcessingQueue, FetchedEmailExtended, AiMessage } from '../types';
import { success, badRequest, notFound, serverError } from '../utils/response';
import { callLlmInWorker } from '../utils/aiClient';

/**
 * 生成邮件摘要
 */
export async function generateEmailSummary(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const body = await request.json<{ email_id: string; force_refresh?: boolean }>();
        const { email_id, force_refresh = false } = body;

        if (!email_id) {
            return badRequest('缺少必要参数: email_id');
        }

        // 验证邮件所有权
        const email = await env.DB.prepare(`
            SELECT fe.* FROM fetched_emails fe
            JOIN email_accounts ea ON fe.account_id = ea.id
            WHERE fe.id = ? AND ea.user_key = ?
        `).bind(email_id, userKey).first<FetchedEmailExtended>();

        if (!email) {
            return notFound('邮件不存在');
        }

        // 检查是否已有摘要且不需要刷新
        if (email.ai_summary && !force_refresh) {
            return success({
                summary: email.ai_summary,
                entities: email.ai_entities ? JSON.parse(email.ai_entities) : [],
                action_items: email.ai_action_items ? JSON.parse(email.ai_action_items) : [],
                sentiment: email.ai_sentiment,
                importance_score: email.ai_importance_score,
                processed_at: email.ai_processed_at,
                cached: true,
            });
        }

        // 调用AI生成摘要
        const result = await generateSummaryWithAI(email, env);

        // 保存结果到数据库
        await saveSummaryToDB(env, email_id, result);

        return success({
            ...result,
            cached: false,
            processing_time_ms: Date.now(),
        });
    } catch (error) {
        console.error('生成邮件摘要失败:', error);
        return serverError('生成邮件摘要失败');
    }
}

/**
 * 使用AI生成摘要
 */
async function generateSummaryWithAI(
    email: FetchedEmailExtended,
    env: Env
): Promise<EmailSummaryResult> {
    const prompt = `请分析以下邮件内容，提供：
1. 一句话摘要（50字以内）
2. 关键实体（时间、地点、人物、截止日期等）
3. 待办事项（如果有）
4. 紧急程度判断（urgent/normal/low）
5. 重要性评分（0-1之间的小数）

请以JSON格式返回：
{
  "summary": "摘要内容",
  "entities": [{"type": "time/location/person/deadline", "value": "值"}],
  "action_items": ["待办1", "待办2"],
  "sentiment": "urgent|normal|low",
  "importance_score": 0.85
}

邮件主题：${email.subject}
发件人：${email.from_address}
内容：${email.content.substring(0, 3000)}`; // 限制长度

    try {
        const llmResponse = await callLlmInWorker(
            [{ role: 'user', content: prompt }],
            { message: prompt, provider: env.AI_PROVIDER || 'gemini', apiKey: env.AI_API_KEY, model: env.AI_MODEL },
            env
        );

        const aiResponse = llmResponse.text;

        // 解析AI响应
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                summary: parsed.summary || '无法生成摘要',
                entities: parsed.entities || [],
                action_items: parsed.action_items || [],
                sentiment: parsed.sentiment || 'normal',
                importance_score: parsed.importance_score || 0.5,
            };
        }

        // 如果解析失败，返回默认结果
        return {
            summary: email.subject,
            entities: [],
            action_items: [],
            sentiment: 'normal',
            importance_score: 0.5,
        };
    } catch (error) {
        console.error('AI摘要生成失败:', error);
        return {
            summary: email.subject,
            entities: [],
            action_items: [],
            sentiment: 'normal',
            importance_score: 0.5,
        };
    }
}

/**
 * 保存摘要到数据库
 */
async function saveSummaryToDB(
    env: Env,
    emailId: string,
    result: EmailSummaryResult
): Promise<void> {
    await env.DB.prepare(`
        UPDATE fetched_emails SET
            ai_summary = ?,
            ai_entities = ?,
            ai_action_items = ?,
            ai_sentiment = ?,
            ai_importance_score = ?,
            ai_processed_at = ?
        WHERE id = ?
    `).bind(
        result.summary,
        JSON.stringify(result.entities),
        JSON.stringify(result.action_items),
        result.sentiment,
        result.importance_score,
        Date.now(),
        emailId
    ).run();
}

/**
 * 批量生成摘要（异步）
 */
export async function batchGenerateSummaries(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const body = await request.json<{ email_ids: string[]; priority?: number }>();
        const { email_ids, priority = 0 } = body;

        if (!email_ids || !Array.isArray(email_ids) || email_ids.length === 0) {
            return badRequest('缺少必要参数: email_ids');
        }

        // 限制批量数量
        if (email_ids.length > 100) {
            return badRequest('单次批量处理最多100封邮件');
        }

        // 验证邮件所有权
        const placeholders = email_ids.map(() => '?').join(',');
        const emailCheck = await env.DB.prepare(`
            SELECT fe.id FROM fetched_emails fe
            JOIN email_accounts ea ON fe.account_id = ea.id
            WHERE fe.id IN (${placeholders}) AND ea.user_key = ?
        `).bind(...email_ids, userKey).all<{ id: string }>();

        const validIds = (emailCheck.results || []).map(r => r.id);

        // 添加到处理队列
        const now = Date.now();
        for (const emailId of validIds) {
            await env.DB.prepare(`
                INSERT OR REPLACE INTO ai_processing_queue (
                    email_id, priority, status, created_at
                ) VALUES (?, ?, 'pending', ?)
            `).bind(emailId, priority, now).run();
        }

        return success({
            message: `已成功添加 ${validIds.length} 封邮件到处理队列`,
            queued_count: validIds.length,
            invalid_count: email_ids.length - validIds.length,
        });
    } catch (error) {
        console.error('批量生成摘要失败:', error);
        return serverError('批量生成摘要失败');
    }
}

/**
 * 从邮件创建提醒
 */
export async function createReminderFromEmail(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const body = await request.json<{
            email_id: string;
            use_ai_extract?: boolean;
            custom_title?: string;
            schedule_type?: 'once' | 'daily' | 'weekly' | 'monthly';
            schedule_date?: string;
            schedule_time?: string;
        }>();

        const { email_id, use_ai_extract = true } = body;

        if (!email_id) {
            return badRequest('缺少必要参数: email_id');
        }

        // 获取邮件详情
        const email = await env.DB.prepare(`
            SELECT fe.*, ea.push_config, ea.push_url, ea.template_name 
            FROM fetched_emails fe
            JOIN email_accounts ea ON fe.account_id = ea.id
            WHERE fe.id = ? AND ea.user_key = ?
        `).bind(email_id, userKey).first<FetchedEmailExtended & { push_config: string; push_url: string; template_name: string }>();

        if (!email) {
            return notFound('邮件不存在');
        }

        let title = body.custom_title || email.subject;
        let content = email.ai_summary || email.content.substring(0, 200);
        let scheduleDate = body.schedule_date;
        let scheduleTime = body.schedule_time || '09:00';

        // 如果使用AI提取，尝试从实体中获取截止日期
        if (use_ai_extract && email.ai_entities) {
            const entities: AIExtractedEntity[] = JSON.parse(email.ai_entities);
            const deadline = entities.find(e => e.type === 'deadline' || e.type === 'time');
            if (deadline && !scheduleDate) {
                // 尝试解析日期
                const parsedDate = parseDateFromString(deadline.value);
                if (parsedDate) {
                    scheduleDate = parsedDate;
                }
            }
        }

        // 如果没有指定日期，默认为明天
        if (!scheduleDate) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            scheduleDate = tomorrow.toISOString().split('T')[0];
        }

        // 创建提醒
        const reminderId = `rem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const now = Date.now();

        await env.DB.prepare(`
            INSERT INTO reminders (
                id, user_key, title, content, schedule_type, schedule_date, schedule_time,
                timezone, push_config, push_url, template_name, status, next_trigger_at,
                trigger_count, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 0, ?, ?)
        `).bind(
            reminderId,
            userKey,
            title,
            content,
            body.schedule_type || 'once',
            scheduleDate,
            scheduleTime,
            'Asia/Shanghai',
            email.push_config,
            email.push_url,
            email.template_name,
            new Date(`${scheduleDate}T${scheduleTime}:00`).getTime(),
            now,
            now
        ).run();

        return success({
            message: '提醒创建成功',
            reminder_id: reminderId,
            title,
            schedule_date: scheduleDate,
            schedule_time: scheduleTime,
        });
    } catch (error) {
        console.error('从邮件创建提醒失败:', error);
        return serverError('从邮件创建提醒失败');
    }
}

/**
 * 从字符串解析日期
 */
function parseDateFromString(str: string): string | null {
    const today = new Date();
    
    // 尝试匹配 "明天"、"后天" 等
    if (str.includes('明天')) {
        const d = new Date(today);
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    }
    if (str.includes('后天')) {
        const d = new Date(today);
        d.setDate(d.getDate() + 2);
        return d.toISOString().split('T')[0];
    }
    
    // 尝试匹配 YYYY-MM-DD 格式
    const dateMatch = str.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (dateMatch) {
        return `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
    }
    
    return null;
}

/**
 * 获取AI处理队列状态
 */
export async function getAIQueueStatus(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        // 获取队列统计
        const stats = await env.DB.prepare(`
            SELECT 
                status,
                COUNT(*) as count
            FROM ai_processing_queue
            GROUP BY status
        `).all<{ status: string; count: number }>();

        // 获取最近的失败记录
        const recentFailures = await env.DB.prepare(`
            SELECT aq.*, fe.subject, fe.from_address
            FROM ai_processing_queue aq
            JOIN fetched_emails fe ON aq.email_id = fe.id
            JOIN email_accounts ea ON fe.account_id = ea.id
            WHERE aq.status = 'failed' AND ea.user_key = ?
            ORDER BY aq.created_at DESC
            LIMIT 10
        `).bind(userKey).all();

        return success({
            stats: stats.results || [],
            recent_failures: recentFailures.results || [],
        });
    } catch (error) {
        console.error('获取AI队列状态失败:', error);
        return serverError('获取AI队列状态失败');
    }
}

/**
 * 处理AI队列（定时任务调用）
 */
export async function processAIQueue(env: Env, batchSize: number = 10): Promise<void> {
    try {
        // 获取待处理的任务
        const pendingJobs = await env.DB.prepare(`
            SELECT aq.*, fe.subject, fe.from_address, fe.content
            FROM ai_processing_queue aq
            JOIN fetched_emails fe ON aq.email_id = fe.id
            WHERE aq.status = 'pending'
            ORDER BY aq.priority DESC, aq.created_at ASC
            LIMIT ?
        `).bind(batchSize).all<AIProcessingQueue & { subject: string; from_address: string; content: string }>();

        for (const job of pendingJobs.results || []) {
            try {
                // 更新状态为处理中
                await env.DB.prepare(`
                    UPDATE ai_processing_queue 
                    SET status = 'processing' 
                    WHERE id = ?
                `).bind(job.id).run();

                // 生成摘要
                const emailData: FetchedEmailExtended = {
                    id: 0,
                    account_id: '',
                    uid: 0,
                    from_address: job.from_address,
                    subject: job.subject,
                    content: job.content,
                    received_at: 0,
                    fetched_at: 0,
                    is_pushed: 0,
                    push_status: 'pending',
                    push_log: null,
                };
                const result = await generateSummaryWithAI(emailData, env);

                // 保存结果
                await saveSummaryToDB(env, job.email_id, result);

                // 更新状态为完成
                await env.DB.prepare(`
                    UPDATE ai_processing_queue 
                    SET status = 'completed', processed_at = ? 
                    WHERE id = ?
                `).bind(Date.now(), job.id).run();

            } catch (error) {
                console.error(`处理AI队列任务失败 (${job.id}):`, error);
                
                // 更新状态为失败
                await env.DB.prepare(`
                    UPDATE ai_processing_queue 
                    SET 
                        status = CASE WHEN retry_count >= 3 THEN 'failed' ELSE 'pending' END,
                        retry_count = retry_count + 1,
                        error_message = ?
                    WHERE id = ?
                `).bind(error instanceof Error ? error.message : 'Unknown error', job.id).run();
            }
        }
    } catch (error) {
        console.error('处理AI队列失败:', error);
    }
}

/**
 * 重新处理失败的AI任务
 */
export async function retryFailedAITasks(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        // 重置失败的队列项
        const result = await env.DB.prepare(`
            UPDATE ai_processing_queue
            SET status = 'pending', retry_count = 0, error_message = NULL
            WHERE status = 'failed'
            AND email_id IN (
                SELECT fe.id FROM fetched_emails fe
                JOIN email_accounts ea ON fe.account_id = ea.id
                WHERE ea.user_key = ?
            )
        `).bind(userKey).run();

        return success({
            message: '已重置失败的AI任务',
            affected_rows: result.meta?.changes || 0,
        });
    } catch (error) {
        console.error('重试AI任务失败:', error);
        return serverError('重试AI任务失败');
    }
}
