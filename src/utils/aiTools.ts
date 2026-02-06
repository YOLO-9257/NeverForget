
import { Env, Reminder, CreateReminderRequest, PushConfig } from '../types';
import { calculateNextTrigger, formatTimestamp } from '../utils/time';
import { generateId } from '../utils/auth';

/**
 * AI 可调用的工具集定义
 */
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: any; // JSON Schema
}

// 工具列表定义（供 LLM 使用）
export const TOOLS: ToolDefinition[] = [
    {
        name: "query_reminders",
        description: "查询用户的提醒任务列表，支持按状态筛选",
        parameters: {
            type: "object",
            properties: {
                status: {
                    type: "string",
                    enum: ["active", "paused", "completed", "failed"],
                    description: "按任务状态筛选 (可选)"
                },
                limit: {
                    type: "integer",
                    description: "返回数量限制 (默认 10)",
                    default: 10
                }
            }
        }
    },
    {
        name: "create_reminder",
        description: "创建一个新的定时提醒任务",
        parameters: {
            type: "object",
            required: ["title", "content", "schedule_type", "push_config"],
            properties: {
                title: { type: "string", description: "提醒标题" },
                content: { type: "string", description: "提醒内容" },
                schedule_type: {
                    type: "string",
                    enum: ["once", "daily", "weekly", "monthly"],
                    description: "调度类型: once(一次性), daily(每天), weekly(每周), monthly(每月)"
                },
                schedule_time: { type: "string", description: "时间 (HH:mm)，daily/weekly/monthly/once 必填" },
                schedule_date: { type: "string", description: "日期 (YYYY-MM-DD)，仅 once 类型需要" },
                schedule_weekday: { type: "integer", description: "周几 (0-6, 0日)，仅 weekly 需要" },
                schedule_day: { type: "integer", description: "几号 (1-31)，仅 monthly 需要" },
                push_config: {
                    type: "object",
                    description: "推送配置信息",
                    properties: {
                        template_name: { type: "string", description: "使用的模板名称，例如 '默认模板'" }
                    }
                }
            }
        }
    },
    {
        name: "get_system_report",
        description: "获取系统运行报告（任务总数、最近执行日志等）",
        parameters: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "save_config",
        description: "保存常用配置（如模板ID、用户ID）",
        parameters: {
            type: "object",
            required: ["category", "name", "value"],
            properties: {
                category: {
                    type: "string",
                    enum: ["wxpush_templateid", "wxpush_userid"],
                    description: "配置分类"
                },
                name: { type: "string", description: "配置名称/别名 (如 '晨报模板')" },
                value: { type: "string", description: "配置值 (如模板ID)" }
            }
        }
    },
    {
        name: "list_configs",
        description: "列出已保存的配置",
        parameters: {
            type: "object",
            properties: {
                category: {
                    type: "string",
                    enum: ["wxpush_templateid", "wxpush_userid"],
                    description: "按分类筛选 (可选)"
                }
            }
        }
    }
];

/**
 * 工具执行器
 */
export async function executeTool(
    name: string,
    args: any,
    env: Env,
    userKey: string
): Promise<any> {
    console.log(`[AI Tool] Executing ${name} with args:`, JSON.stringify(args));

    switch (name) {
        case 'query_reminders':
            return await queryReminders(args, env, userKey);
        case 'create_reminder':
            return await createReminderTool(args, env, userKey);
        case 'get_system_report':
            return await getSystemReport(env, userKey);
        case 'save_config':
            return await saveConfig(args, env, userKey);
        case 'list_configs':
            return await listConfigs(args, env, userKey);
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// --- Implementation Details ---

async function queryReminders(args: any, env: Env, userKey: string) {
    const limit = Math.min(args.limit || 10, 50);
    let query = `SELECT id, title, content, schedule_type, next_trigger_at, status FROM reminders WHERE user_key = ?`;
    const params: any[] = [userKey];

    if (args.status) {
        query += ` AND status = ?`;
        params.push(args.status);
    }

    query += ` ORDER BY next_trigger_at ASC LIMIT ?`;
    params.push(limit);

    const result = await env.DB.prepare(query).bind(...params).all<Reminder>();
    return {
        count: result.results.length,
        items: result.results.map(r => ({
            ...r,
            next_trigger: formatTimestamp(r.next_trigger_at)
        }))
    };
}

async function createReminderTool(args: any, env: Env, userKey: string) {
    // 1. Resolve Push Config
    // 用户可能只提供了 template_name，我们需要找到对应的完整配置
    // 尝试查找最近的一个任务
    let lastTask = await env.DB.prepare(`
        SELECT push_config FROM reminders WHERE user_key = ? ORDER BY created_at DESC LIMIT 1
    `).bind(userKey).first<Reminder>();

    let pushConfig: PushConfig | null = null;

    // 如果没有任务，尝试从邮件设置中获取 (Backup)
    if (!lastTask || !lastTask.push_config) {
        const emailSettings = await env.DB.prepare(`
            SELECT push_config FROM email_settings WHERE user_key = ? AND push_config IS NOT NULL LIMIT 1
        `).bind(userKey).first<{ push_config: string }>();

        if (emailSettings && emailSettings.push_config) {
            pushConfig = JSON.parse(emailSettings.push_config);
        }
    } else {
        pushConfig = JSON.parse(lastTask.push_config);
    }

    let templateName = args.push_config?.template_name;

    if (pushConfig) {
        // 如果 args 指定了 template_name，覆盖它
        if (templateName) {
            pushConfig.template_name = templateName;
        }
    } else {
        return { error: "系统中没有您的历史任务或邮件配置，无法自动获取推送配置 (AppID/Secret)。请先在网页端手动创建一个任务。" };
    }

    // 2. Validate & Calculate Trigger
    const now = Date.now();
    const id = generateId('rem');

    // 简单参数映射
    const scheduleType = args.schedule_type;
    const scheduleTime = args.schedule_time;
    const scheduleDate = args.schedule_date; // for once
    const scheduleWeekday = args.schedule_weekday; // for weekly
    const scheduleDay = args.schedule_day; // for monthly

    const nextTrigger = calculateNextTrigger(
        scheduleType,
        scheduleTime,
        scheduleDate,
        scheduleWeekday,
        scheduleDay,
        env.TIMEZONE, // args.timezone || env.TIMEZONE (simplification)
        new Date(now)
    );

    if (scheduleType === 'once' && nextTrigger === null) {
        return { error: "指定的时间已过，无法创建一次性提醒" };
    }

    // 3. Insert
    try {
        await env.DB.prepare(`
            INSERT INTO reminders (
                id, user_key, title, content,
                schedule_type, schedule_time, schedule_date,
                schedule_weekday, schedule_day, timezone,
                push_config, status, next_trigger_at, trigger_count,
                created_at, updated_at, template_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 0, ?, ?, ?)
        `).bind(
            id, userKey, args.title, args.content,
            scheduleType, scheduleTime, scheduleDate,
            scheduleWeekday, scheduleDay, env.TIMEZONE,
            JSON.stringify(pushConfig), nextTrigger,
            now, now, templateName
        ).run();

        return {
            success: true,
            id: id,
            next_trigger: formatTimestamp(nextTrigger),
            message: `成功创建任务 "${args.title}"，下次触发时间: ${formatTimestamp(nextTrigger)}`
        };
    } catch (e: any) {
        return { error: `数据库写入失败: ${e.message}` };
    }
}

async function getSystemReport(env: Env, userKey: string) {
    const totalReminders = await env.DB.prepare(`SELECT count(*) as c FROM reminders WHERE user_key = ?`).bind(userKey).first('c');
    const activeReminders = await env.DB.prepare(`SELECT count(*) as c FROM reminders WHERE user_key = ? AND status='active'`).bind(userKey).first('c');

    // 最近日志
    const recentLogs = await env.DB.prepare(`
        SELECT l.triggered_at, l.status, r.title
        FROM trigger_logs l
        JOIN reminders r ON l.reminder_id = r.id
        WHERE r.user_key = ?
        ORDER BY l.triggered_at DESC LIMIT 5
    `).bind(userKey).all();

    return {
        stats: {
            total_tasks: totalReminders,
            active_tasks: activeReminders
        },
        recent_execution_logs: recentLogs.results.map((l: any) => ({
            time: formatTimestamp(l.triggered_at),
            title: l.title,
            status: l.status
        }))
    };
}

async function saveConfig(args: any, env: Env, userKey: string) {
    const { category, name, value } = args;
    const now = Date.now();

    // Check duplication
    const existing = await env.DB.prepare(`SELECT id FROM saved_configs WHERE user_key=? AND category=? AND name=?`)
        .bind(userKey, category, name).first();

    if (existing) {
        await env.DB.prepare(`UPDATE saved_configs SET value=?, created_at=? WHERE id=?`)
            .bind(value, now, existing.id).run();
    } else {
        await env.DB.prepare(`INSERT INTO saved_configs (user_key, category, name, value, created_at) VALUES (?, ?, ?, ?, ?)`)
            .bind(userKey, category, name, value, now).run();
    }
    return { success: true, message: `配置 ${name} 已保存` };
}

async function listConfigs(args: any, env: Env, userKey: string) {
    let query = `SELECT category, name, value FROM saved_configs WHERE user_key = ?`;
    const params: any[] = [userKey];

    if (args.category) {
        query += ` AND category = ?`;
        params.push(args.category);
    }

    const result = await env.DB.prepare(query).bind(...params).all();
    return { items: result.results };
}
