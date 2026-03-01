/**
 * 提醒任务 CRUD 处理器
 */

import { Env, CreateReminderRequest, UpdateReminderRequest, Reminder, PushConfig } from '../types';
import { success, badRequest, notFound, serverError } from '../utils/response';
import { generateId } from '../utils/auth';
import { calculateNextTrigger, formatTimestamp, isValidTimeFormat, isValidDateFormat, isValidCronExpression } from '../utils/time';
import { ensureAiActionLogsTable } from '../services/aiActionLogger';
import { ensureRemindersSchema } from '../services/reminderSchema';

/**
 * 创建提醒
 */
export async function createReminder(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const schemaReady = await ensureRemindersSchema(env);
        if (!schemaReady) {
            console.warn('[Reminder] reminders 表结构自愈失败，继续尝试创建任务');
        }

        const body = await request.json() as CreateReminderRequest;

        // 参数验证
        const validationError = validateCreateRequest(body);
        if (validationError) {
            return badRequest(validationError);
        }

        const now = Date.now();
        const id = generateId('rem');

        // 计算首次触发时间
        const nextTrigger = calculateNextTrigger(
            body.schedule_type,
            body.schedule_time || null,
            body.schedule_date || null,
            body.schedule_weekday ?? null,
            body.schedule_day ?? null,
            body.timezone || env.TIMEZONE,
            undefined,
            body.schedule_cron || null
        );

        // 一次性任务如果时间已过，拒绝创建
        if (body.schedule_type === 'once' && nextTrigger === null) {
            return badRequest('指定的时间已过，无法创建一次性提醒');
        }

        // 插入数据库
        await env.DB.prepare(`
      INSERT INTO reminders (
        id, user_key, title, content,
        schedule_type, schedule_time, schedule_cron, schedule_date, 
        schedule_weekday, schedule_day, timezone,
        push_config, push_url, template_name,
        status, type, next_trigger_at, trigger_count,
        ack_required, ack_status, retry_interval,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 0, ?, 'none', ?, ?, ?)
    `).bind(
            id,
            userKey,
            body.title,
            body.content,
            body.schedule_type,
            body.schedule_time || null,
            body.schedule_cron || null,
            body.schedule_date || null,
            body.schedule_weekday ?? null,
            body.schedule_day ?? null,
            body.timezone || env.TIMEZONE,
            JSON.stringify(body.push_config || {}),
            body.push_url || null,
            body.template_name || null,
            body.type || 'reminder',
            nextTrigger,
            body.ack_required ? 1 : 0,
            body.retry_interval ?? 30,  // 默认 30 分钟
            now,
            now
        ).run();

        return success({
            id,
            next_trigger: formatTimestamp(nextTrigger),
            created_at: new Date(now).toISOString(),
        }, '提醒创建成功');
    } catch (error) {
        console.error('创建提醒失败:', error);
        return serverError('创建提醒失败');
    }
}

/**
 * 获取提醒列表
 */
export async function listReminders(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const url = new URL(request.url);
        const status = url.searchParams.get('status'); // 可选：按状态筛选
        const type = url.searchParams.get('type'); // 可选：按类型筛选 (reminder | email_sync)
        const keyword = url.searchParams.get('keyword')?.trim(); // 可选：按标题/内容搜索
        const sortByRaw = url.searchParams.get('sort_by') || 'created_at';
        const sortOrderRaw = (url.searchParams.get('sort_order') || 'desc').toLowerCase();
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const sortOrder = sortOrderRaw === 'asc' ? 'ASC' : 'DESC';

        const sortByMap: Record<string, string> = {
            created_at: 'created_at',
            updated_at: 'updated_at',
            next_trigger_at: 'next_trigger_at',
            trigger_count: 'trigger_count',
            title: 'title',
            status: 'status',
        };
        const sortBy = sortByMap[sortByRaw] || 'created_at';

        let query = `SELECT * FROM reminders WHERE user_key = ?`;
        const params: any[] = [userKey];

        if (status) {
            query += ` AND status = ?`;
            params.push(status);
        }

        if (type) {
            query += ` AND type = ?`;
            params.push(type);
        }

        if (keyword) {
            query += ` AND (title LIKE ? OR content LIKE ?)`;
            params.push(`%${keyword}%`, `%${keyword}%`);
        }

        if (sortBy === 'next_trigger_at') {
            query += ` ORDER BY (next_trigger_at IS NULL) ASC, next_trigger_at ${sortOrder}`;
        } else {
            query += ` ORDER BY ${sortBy} ${sortOrder}`;
        }
        query += ` LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const result = await env.DB.prepare(query).bind(...params).all<Reminder>();

        // 查询总数
        let countQuery = `SELECT COUNT(*) as total FROM reminders WHERE user_key = ?`;
        const countParams: any[] = [userKey];
        if (status) {
            countQuery += ` AND status = ?`;
            countParams.push(status);
        }
        if (type) {
            countQuery += ` AND type = ?`;
            countParams.push(type);
        }
        if (keyword) {
            countQuery += ` AND (title LIKE ? OR content LIKE ?)`;
            countParams.push(`%${keyword}%`, `%${keyword}%`);
        }
        const countResult = await env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>();

        const items = (result.results || []).map(r => ({
            id: r.id,
            title: r.title,
            content: r.content,
            type: r.type || 'reminder',
            related_id: r.related_id || null,
            schedule_type: r.schedule_type,
            schedule_time: r.schedule_time,
            schedule_cron: r.schedule_cron,
            schedule_date: r.schedule_date,
            schedule_weekday: r.schedule_weekday,
            schedule_day: r.schedule_day,
            timezone: r.timezone,
            next_trigger_at: r.next_trigger_at,
            last_trigger_at: r.last_trigger_at,
            next_trigger: formatTimestamp(r.next_trigger_at),
            status: r.status,
            trigger_count: r.trigger_count,
            ack_required: !!r.ack_required,
            ack_status: r.ack_status || 'none',
            retry_interval: r.retry_interval || 30,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }));

        return success({
            total: countResult?.total || 0,
            items,
        });
    } catch (error) {
        console.error('获取提醒列表失败:', error);
        return serverError('获取提醒列表失败');
    }
}

/**
 * 获取单个提醒详情
 */
export async function getReminder(
    id: string,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const reminder = await env.DB.prepare(`
      SELECT * FROM reminders WHERE id = ? AND user_key = ?
    `).bind(id, userKey).first<Reminder>();

        if (!reminder) {
            return notFound('提醒不存在');
        }

        // 解析 push_config，隐藏 secret
        const pushConfig: PushConfig = JSON.parse(reminder.push_config);
        const safePushConfig = {
            ...pushConfig,
            secret: '******', // 隐藏敏感信息
        };

        return success({
            ...reminder,
            push_config: safePushConfig,
            next_trigger: formatTimestamp(reminder.next_trigger_at),
            last_trigger: formatTimestamp(reminder.last_trigger_at),
            created_at: new Date(reminder.created_at).toISOString(),
            updated_at: new Date(reminder.updated_at).toISOString(),
        });
    } catch (error) {
        console.error('获取提醒详情失败:', error);
        return serverError('获取提醒详情失败');
    }
}

/**
 * 更新提醒
 */
export async function updateReminder(
    id: string,
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const body = await request.json() as UpdateReminderRequest;

        // 检查提醒是否存在
        const existing = await env.DB.prepare(`
      SELECT * FROM reminders WHERE id = ? AND user_key = ?
    `).bind(id, userKey).first<Reminder>();

        if (!existing) {
            return notFound('提醒不存在');
        }

        const now = Date.now();
        const updates: string[] = [];
        const values: any[] = [];

        const scheduleChanged =
            body.schedule_type !== undefined ||
            body.schedule_time !== undefined ||
            body.schedule_cron !== undefined ||
            body.schedule_date !== undefined ||
            body.schedule_weekday !== undefined ||
            body.schedule_day !== undefined ||
            body.timezone !== undefined;

        // 动态构建更新语句
        if (body.title !== undefined) {
            updates.push('title = ?');
            values.push(body.title);
        }
        if (body.content !== undefined) {
            updates.push('content = ?');
            values.push(body.content);
        }
        if (body.status !== undefined) {
            if (!['active', 'paused'].includes(body.status)) {
                return badRequest('状态仅支持 active 或 paused');
            }
            updates.push('status = ?');
            values.push(body.status);
        }
        if (body.schedule_type !== undefined) {
            const validTypes = ['once', 'daily', 'weekly', 'monthly', 'cron'];
            if (!validTypes.includes(body.schedule_type)) {
                return badRequest(`无效的调度类型，支持: ${validTypes.join(', ')}`);
            }
            updates.push('schedule_type = ?');
            values.push(body.schedule_type);
        }
        if (body.schedule_time !== undefined) {
            if (!isValidTimeFormat(body.schedule_time)) {
                return badRequest('时间格式无效，应为 HH:mm');
            }
            updates.push('schedule_time = ?');
            values.push(body.schedule_time);
        }
        if (body.schedule_cron !== undefined) {
            if (!body.schedule_cron.trim()) {
                return badRequest('Cron 表达式不能为空');
            }
            if (!isValidCronExpression(body.schedule_cron)) {
                return badRequest('Cron 表达式无效');
            }
            updates.push('schedule_cron = ?');
            values.push(body.schedule_cron.trim());
        }
        if (body.schedule_date !== undefined) {
            if (!isValidDateFormat(body.schedule_date)) {
                return badRequest('日期格式无效，应为 YYYY-MM-DD');
            }
            updates.push('schedule_date = ?');
            values.push(body.schedule_date);
        }
        if (body.schedule_weekday !== undefined) {
            if (body.schedule_weekday < 0 || body.schedule_weekday > 6) {
                return badRequest('周几应为 0-6');
            }
            updates.push('schedule_weekday = ?');
            values.push(body.schedule_weekday);
        }
        if (body.schedule_day !== undefined) {
            if (body.schedule_day < 1 || body.schedule_day > 31) {
                return badRequest('日期应为 1-31');
            }
            updates.push('schedule_day = ?');
            values.push(body.schedule_day);
        }
        if (body.timezone !== undefined) {
            if (!body.timezone.trim()) {
                return badRequest('时区不能为空');
            }
            updates.push('timezone = ?');
            values.push(body.timezone.trim());
        }
        if (body.push_config !== undefined) {
            // 如果前端传来的 secret 是脱敏值 "******"，则保留数据库原有的 secret
            let finalPushConfig = body.push_config;
            if (body.push_config.secret === '******') {
                const existingPushConfig: PushConfig = JSON.parse(existing.push_config);
                finalPushConfig = {
                    ...body.push_config,
                    secret: existingPushConfig.secret, // 保留原有 secret
                };
            }
            updates.push('push_config = ?');
            values.push(JSON.stringify(finalPushConfig));
        }
        if (body.push_url !== undefined) {
            updates.push('push_url = ?');
            values.push(body.push_url);
        }
        if (body.template_name !== undefined) {
            updates.push('template_name = ?');
            values.push(body.template_name || null);
        }
        if (body.ack_required !== undefined) {
            updates.push('ack_required = ?');
            values.push(body.ack_required ? 1 : 0);
        }
        if (body.retry_interval !== undefined) {
            if (body.retry_interval < 1) {
                return badRequest('retry_interval 需大于 0');
            }
            updates.push('retry_interval = ?');
            values.push(body.retry_interval);
        }

        // 调试日志：输出即将更新的字段
        console.log(`[updateReminder] id=${id}, 更新字段: [${updates.join(', ')}]`);
        console.log(`[updateReminder] template_name in body: ${body.template_name}`);

        if (updates.length === 0) {
            return badRequest('没有需要更新的字段');
        }

        updates.push('updated_at = ?');
        values.push(now);

        // 如果调度相关字段有变更，校验并重新计算下次触发时间
        if (scheduleChanged) {
            const mergedType = body.schedule_type ?? existing.schedule_type;
            const mergedTime = body.schedule_time ?? existing.schedule_time;
            const mergedDate = body.schedule_date ?? existing.schedule_date;
            const mergedWeekday = body.schedule_weekday ?? existing.schedule_weekday;
            const mergedDay = body.schedule_day ?? existing.schedule_day;
            const mergedCron = body.schedule_cron ?? existing.schedule_cron;
            const mergedTimezone = body.timezone ?? existing.timezone;

            switch (mergedType) {
                case 'once':
                    if (!mergedDate || !mergedTime) {
                        return badRequest('一次性提醒需要 schedule_date 和 schedule_time');
                    }
                    break;
                case 'daily':
                    if (!mergedTime) {
                        return badRequest('每日提醒需要 schedule_time');
                    }
                    break;
                case 'weekly':
                    if (mergedWeekday === null || mergedWeekday === undefined || !mergedTime) {
                        return badRequest('每周提醒需要 schedule_weekday 和 schedule_time');
                    }
                    break;
                case 'monthly':
                    if (mergedDay === null || mergedDay === undefined || !mergedTime) {
                        return badRequest('每月提醒需要 schedule_day 和 schedule_time');
                    }
                    break;
                case 'cron':
                    if (!mergedCron) {
                        return badRequest('Cron 提醒需要 schedule_cron');
                    }
                    if (!isValidCronExpression(mergedCron)) {
                        return badRequest('Cron 表达式无效');
                    }
                    break;
            }

            const nextTrigger = calculateNextTrigger(
                mergedType,
                mergedTime,
                mergedDate,
                mergedWeekday,
                mergedDay,
                mergedTimezone,
                undefined,
                mergedCron
            );

            if (mergedType === 'once' && nextTrigger === null) {
                return badRequest('指定的时间已过');
            }

            updates.push('next_trigger_at = ?');
            values.push(nextTrigger);
        }

        values.push(id, userKey);

        await env.DB.prepare(`
      UPDATE reminders SET ${updates.join(', ')} WHERE id = ? AND user_key = ?
    `).bind(...values).run();

        return success({ id, updated_at: new Date(now).toISOString() }, '更新成功');
    } catch (error) {
        console.error('更新提醒失败:', error);
        return serverError('更新提醒失败');
    }
}

/**
 * 删除提醒
 */
export async function deleteReminder(
    id: string,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const result = await env.DB.prepare(`
      DELETE FROM reminders WHERE id = ? AND user_key = ?
    `).bind(id, userKey).run();

        if (result.meta.changes === 0) {
            return notFound('提醒不存在');
        }

        return success({ id }, '删除成功');
    } catch (error) {
        console.error('删除提醒失败:', error);
        return serverError('删除提醒失败');
    }
}

/**
 * 手动触发提醒 (立即执行)
 */
export async function triggerReminder(
    id: string,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const reminder = await env.DB.prepare(`
      SELECT * FROM reminders WHERE id = ? AND user_key = ?
    `).bind(id, userKey).first<Reminder>();

        if (!reminder) {
            return notFound('提醒不存在');
        }

        const { testRunReminder } = await import('../services/scheduler');
        const result = await testRunReminder(reminder, env);

        if (result.success) {
            return success({ id, status: 'success' }, '触发成功');
        } else {
            return badRequest(`触发失败: ${result.error || '未知错误'}`);
        }
    } catch (error) {
        console.error('手动触发提醒失败:', error);
        return serverError('手动触发提醒失败');
    }
}

/**
 * 获取提醒的执行日志
 */
export async function getReminderLogs(
    id: string,
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        // 先验证提醒是否属于当前用户
        const reminder = await env.DB.prepare(`
      SELECT id FROM reminders WHERE id = ? AND user_key = ?
    `).bind(id, userKey).first();

        if (!reminder) {
            return notFound('提醒不存在');
        }

        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
        const type = url.searchParams.get('type'); // 可选：按类型筛选 (reminder | email)

        const toIso = (value: unknown): string => {
            const numeric = typeof value === 'number' ? value : Number(value);
            const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(String(value ?? ''));
            return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
        };

        const aiLogsReady = await ensureAiActionLogsTable(env);

        // 优先读取三层日志明细（新模型），不可用时回退旧表
        let useNewModel = false;
        try {
            const detailCheck = await env.DB.prepare(`
                SELECT COUNT(*) as cnt
                FROM task_exec_detail
                WHERE reminder_id = ? AND user_key = ?
                LIMIT 1
            `).bind(id, userKey).first<{ cnt: number }>();
            if (detailCheck && detailCheck.cnt > 0) {
                useNewModel = true;
            }
        } catch {
            useNewModel = false;
        }

        if (useNewModel) {
            let newQuery = `
                SELECT * FROM (
                    SELECT
                        d.id AS id,
                        d.reminder_id AS reminder_id,
                        d.triggered_at AS triggered_at,
                        d.status AS status,
                        d.response AS response,
                        d.error AS error,
                        d.duration_ms AS duration_ms,
                        d.detail_reason AS detail_reason,
                        'scheduler' AS source,
                        NULL AS action
                    FROM task_exec_detail d
                    WHERE d.reminder_id = ?
                      AND d.user_key = ?
                      ${type ? `AND d.task_type = ?` : ''}
            `;

            if (aiLogsReady) {
                newQuery += `
                    UNION ALL

                    SELECT
                        a.id AS id,
                        a.reminder_id AS reminder_id,
                        a.triggered_at AS triggered_at,
                        a.status AS status,
                        a.response AS response,
                        a.error AS error,
                        a.duration_ms AS duration_ms,
                        NULL AS detail_reason,
                        'ai_butler' AS source,
                        a.action AS action
                    FROM ai_action_logs a
                    WHERE a.reminder_id = ?
                      AND a.user_key = ?
                      ${type ? `AND COALESCE(a.reminder_type, 'reminder') = ?` : ''}
                `;
            }

            newQuery += `
                ) all_logs
                ORDER BY triggered_at DESC
                LIMIT ?
            `;

            const newParams: unknown[] = [id, userKey];
            if (type) newParams.push(type);
            if (aiLogsReady) {
                newParams.push(id, userKey);
                if (type) newParams.push(type);
            }
            newParams.push(limit);

            const newResult = await env.DB.prepare(newQuery).bind(...newParams).all();
            const newLogs = (newResult.results || []).map((log: any) => ({
                ...log,
                triggered_at: toIso(log.triggered_at),
            }));

            return success({ logs: newLogs });
        }

        if (!aiLogsReady) {
            let legacyQuery = `
                SELECT l.*
                FROM trigger_logs l
                INNER JOIN reminders r ON l.reminder_id = r.id
                WHERE l.reminder_id = ?
                  AND r.user_key = ?
            `;
            const legacyParams: unknown[] = [id, userKey];
            if (type) {
                legacyQuery += ` AND r.type = ?`;
                legacyParams.push(type);
            }
            legacyQuery += ` ORDER BY l.triggered_at DESC LIMIT ?`;
            legacyParams.push(limit);

            const legacyResult = await env.DB.prepare(legacyQuery).bind(...legacyParams).all();
            const legacyLogs = (legacyResult.results || []).map((log: any) => ({
                ...log,
                source: 'scheduler',
                action: null,
                triggered_at: toIso(log.triggered_at),
            }));

            return success({ logs: legacyLogs });
        }

        const legacyQuery = `
            SELECT * FROM (
                SELECT
                    l.id AS id,
                    l.reminder_id AS reminder_id,
                    l.triggered_at AS triggered_at,
                    l.status AS status,
                    l.response AS response,
                    l.error AS error,
                    l.duration_ms AS duration_ms,
                    NULL AS detail_reason,
                    'scheduler' AS source,
                    NULL AS action
                FROM trigger_logs l
                INNER JOIN reminders r ON l.reminder_id = r.id
                WHERE l.reminder_id = ?
                  AND r.user_key = ?
                  ${type ? `AND r.type = ?` : ''}

                UNION ALL

                SELECT
                    a.id AS id,
                    a.reminder_id AS reminder_id,
                    a.triggered_at AS triggered_at,
                    a.status AS status,
                    a.response AS response,
                    a.error AS error,
                    a.duration_ms AS duration_ms,
                    NULL AS detail_reason,
                    'ai_butler' AS source,
                    a.action AS action
                FROM ai_action_logs a
                WHERE a.reminder_id = ?
                  AND a.user_key = ?
                  ${type ? `AND COALESCE(a.reminder_type, 'reminder') = ?` : ''}
            ) all_logs
            ORDER BY triggered_at DESC
            LIMIT ?
        `;

        const legacyParams: unknown[] = [id, userKey];
        if (type) legacyParams.push(type);
        legacyParams.push(id, userKey);
        if (type) legacyParams.push(type);
        legacyParams.push(limit);

        const legacyResult = await env.DB.prepare(legacyQuery).bind(...legacyParams).all();

        const legacyLogs = (legacyResult.results || []).map((log: any) => ({
            ...log,
            triggered_at: toIso(log.triggered_at),
        }));

        return success({ logs: legacyLogs });
    } catch (error) {
        console.error('获取执行日志失败:', error);
        return serverError('获取执行日志失败');
    }
}

/**
 * 验证创建请求参数
 */
function validateCreateRequest(body: CreateReminderRequest): string | null {
    if (!body.title || body.title.trim() === '') {
        return '标题不能为空';
    }
    if (!body.content || body.content.trim() === '') {
        return '内容不能为空';
    }
    if (!body.schedule_type) {
        return '调度类型不能为空';
    }

    const validTypes = ['once', 'daily', 'weekly', 'monthly', 'cron'];
    if (!validTypes.includes(body.schedule_type)) {
        return `无效的调度类型，支持: ${validTypes.join(', ')}`;
    }

    // 根据类型验证必要参数
    switch (body.schedule_type) {
        case 'once':
            if (!body.schedule_date || !body.schedule_time) {
                return '一次性提醒需要指定日期 (schedule_date) 和时间 (schedule_time)';
            }
            if (!isValidDateFormat(body.schedule_date)) {
                return '日期格式无效，应为 YYYY-MM-DD';
            }
            if (!isValidTimeFormat(body.schedule_time)) {
                return '时间格式无效，应为 HH:mm';
            }
            break;
        case 'daily':
            if (!body.schedule_time) {
                return '每日提醒需要指定时间 (schedule_time)';
            }
            if (!isValidTimeFormat(body.schedule_time)) {
                return '时间格式无效，应为 HH:mm';
            }
            break;
        case 'weekly':
            if (body.schedule_weekday === undefined || !body.schedule_time) {
                return '每周提醒需要指定周几 (schedule_weekday: 0-6) 和时间 (schedule_time)';
            }
            if (body.schedule_weekday < 0 || body.schedule_weekday > 6) {
                return '周几应为 0-6 (0=周日)';
            }
            if (!isValidTimeFormat(body.schedule_time)) {
                return '时间格式无效，应为 HH:mm';
            }
            break;
        case 'monthly':
            if (body.schedule_day === undefined || !body.schedule_time) {
                return '每月提醒需要指定几号 (schedule_day: 1-31) 和时间 (schedule_time)';
            }
            if (body.schedule_day < 1 || body.schedule_day > 31) {
                return '日期应为 1-31';
            }
            if (!isValidTimeFormat(body.schedule_time)) {
                return '时间格式无效，应为 HH:mm';
            }
            break;
        case 'cron':
            if (!body.schedule_cron) {
                return 'Cron 类型提醒需要指定 Cron 表达式 (schedule_cron)';
            }
            if (!isValidCronExpression(body.schedule_cron)) {
                return 'Cron 表达式无效';
            }
            break;
    }

    // 验证推送配置 (普通任务必须有推送配置，邮箱同步等特殊任务可选)
    if (body.type !== 'email_sync') {
        if (!body.push_config) {
            return '推送配置 (push_config) 不能为空';
        }
        if (!body.push_config.appid) {
            return 'push_config.appid 不能为空';
        }
        if (!body.push_config.secret) {
            return 'push_config.secret 不能为空';
        }
        if (!body.push_config.userid) {
            return 'push_config.userid 不能为空';
        }
        if (!body.push_config.template_id) {
            return 'push_config.template_id 不能为空';
        }
    }

    return null;
}

/**
 * 确认提醒 (Callback)
 * 无需认证，通过 URL 参数中的 Token 或 ID 直接访问
 * 支持两种动作：
 *   - completed: 标记为已完成，重算下次触发时间
 *   - snooze: 稍后提醒，保持 pending 状态
 */
export async function ackReminder(
    id: string,
    request: Request,
    env: Env
): Promise<Response> {
    try {
        // 解析请求体，获取 action（默认为 completed）
        let action: 'completed' | 'snooze' = 'completed';
        try {
            const body = await request.json() as { action?: string };
            if (body.action === 'snooze') {
                action = 'snooze';
            }
        } catch {
            // 无 body 或解析失败，使用默认 action
        }

        console.log(`[Ack] 任务 ${id}, action=${action}`);

        // 检查任务是否存在
        const reminder = await env.DB.prepare(`SELECT * FROM reminders WHERE id = ?`).bind(id).first<Reminder>();
        if (!reminder) {
            return notFound('提醒不存在');
        }

        const now = Date.now();

        if (action === 'snooze') {
            // snooze 动作：只返回成功，不更新状态
            // 任务将按原计划继续重试
            console.log(`[Ack] 任务 ${id} 选择稍后提醒，保持 pending 状态`);
            return success({ id, status: 'pending', action: 'snooze' }, '已收到，稍后会继续提醒');
        }

        // completed 动作：标记完成并重新计算下次触发时间
        await env.DB.prepare(`
            UPDATE reminders 
            SET ack_status = 'completed', last_ack_at = ?, updated_at = ?
            WHERE id = ?
        `).bind(now, now, id).run();

        // 重新计算下一次真正触发的时间
        const nextTrigger = calculateNextTrigger(
            reminder.schedule_type,
            reminder.schedule_time,
            reminder.schedule_date,
            reminder.schedule_weekday,
            reminder.schedule_day,
            reminder.timezone,
            new Date(now), // 基于当前时间计算下一次
            reminder.schedule_cron
        );

        if (nextTrigger) {
            await env.DB.prepare(`
                UPDATE reminders SET next_trigger_at = ? WHERE id = ?
            `).bind(nextTrigger, id).run();
            console.log(`[Ack] 任务 ${id} 已确认完成，下次触发时间: ${new Date(nextTrigger).toISOString()}`);
        }

        return success({ id, status: 'completed', action: 'completed' }, '已确认完成');
    } catch (error) {
        console.error('确认提醒失败:', error);
        return serverError('确认提醒失败');
    }
}

