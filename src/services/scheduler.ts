/**
 * 调度服务 - 处理定时任务的触发和执行
 */

import { Env, Reminder, PushConfig, EmailAccount } from '../types';
import { sendPush } from './pusher';
import { calculateNextTrigger } from '../utils/time';
import { runImapPolling, syncEmailAccount } from './imapPoller';

/**
 * 处理定时触发
 * 由 Cron Trigger 调用，每分钟执行一次
 */
export async function handleScheduledTrigger(env: Env): Promise<void> {
    const now = Date.now();

    console.log(`[Scheduler] 开始执行定时任务检查, 当前时间: ${new Date(now).toISOString()}`);

    try {
        // 执行到期的提醒任务（包括普通提醒和邮箱同步任务）
        await executeScheduledReminders(env, now);

        console.log(`[Scheduler] 所有任务执行完成`);
    } catch (error) {
        console.error(`[Scheduler] 执行出错:`, error);
    }
}

/**
 * 执行邮箱同步任务
 * 针对 type='email_sync' 的任务，调用对应账户的 IMAP 同步
 */
async function executeEmailSyncTask(
    reminder: Reminder,
    env: Env,
    triggeredAt: number
): Promise<void> {
    const accountId = reminder.related_id;
    if (!accountId) {
        console.error(`[Scheduler] 邮箱同步任务 ${reminder.id} 缺少 related_id`);
        return;
    }

    console.log(`[Scheduler] 执行邮箱同步任务: ${reminder.id} -> 账户 ${accountId}`);

    try {
        // 调用邮箱同步服务
        const result = await syncEmailAccount(env, accountId);

        // 记录执行日志到 trigger_logs
        await env.DB.prepare(`
            INSERT INTO trigger_logs (reminder_id, triggered_at, status, response, error, duration_ms)
            VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
            reminder.id,
            triggeredAt,
            result.success ? 'success' : 'failed',
            result.emailsForwarded > 0 ? `同步 ${result.emailsFound} 封, 转发 ${result.emailsForwarded} 封` : null,
            result.error || null,
            result.duration || 0
        ).run();

        // 更新下次触发时间
        const nextTrigger = calculateNextTrigger(
            reminder.schedule_type,
            reminder.schedule_time,
            reminder.schedule_date,
            reminder.schedule_weekday,
            reminder.schedule_day,
            reminder.timezone,
            new Date(triggeredAt)
        );

        if (nextTrigger) {
            await env.DB.prepare(`
                UPDATE reminders 
                SET next_trigger_at = ?, last_trigger_at = ?, trigger_count = trigger_count + 1, updated_at = ?
                WHERE id = ?
            `).bind(nextTrigger, triggeredAt, triggeredAt, reminder.id).run();
        }

    } catch (error) {
        console.error(`[Scheduler] 邮箱同步任务 ${reminder.id} 执行异常:`, error);
        await env.DB.prepare(`
            INSERT INTO trigger_logs (reminder_id, triggered_at, status, error, duration_ms)
            VALUES (?, ?, 'failed', ?, 0)
        `).bind(
            reminder.id,
            triggeredAt,
            error instanceof Error ? error.message : '未知错误'
        ).run();
    }
}

/**
 * 执行到期的提醒任务
 */
async function executeScheduledReminders(env: Env, now: number): Promise<void> {
    // 查询所有到期且状态为 active 的任务
    const result = await env.DB.prepare(`
      SELECT * FROM reminders 
      WHERE next_trigger_at <= ? 
        AND status = 'active'
      ORDER BY next_trigger_at ASC
      LIMIT 50
    `).bind(now).all<Reminder>();

    const reminders = result.results || [];

    console.log(`[Scheduler] 找到 ${reminders.length} 个待执行任务`);

    if (reminders.length === 0) {
        return;
    }

    // 并发执行所有到期任务
    const executePromises = reminders.map(reminder =>
        executeReminder(reminder, env, now)
    );

    await Promise.allSettled(executePromises);
}

/**
 * 手动触发/测试提醒任务（不更新下次执行时间）
 */
export async function testRunReminder(
    reminder: Reminder,
    env: Env
): Promise<{ success: boolean; error?: string }> {
    const triggeredAt = Date.now();
    console.log(`[Scheduler] 手动触发任务: ${reminder.id} - ${reminder.title}`);

    try {
        const pushConfig: PushConfig = JSON.parse(reminder.push_config);

        // 获取外部推送服务地址
        const pushServiceUrl = env.PUSH_SERVICE_URL || env.DEFAULT_PUSH_URL || env.WORKER_BASE_URL;

        // 设置详情页基础地址
        pushConfig.base_url = pushServiceUrl;

        // 设置模板名称（优先使用任务级别配置，否则使用消息模板中的配置）
        if (reminder.template_name) {
            pushConfig.template_name = reminder.template_name;
        }
        // 如果 pushConfig 中已有 template_name，会被自动使用

        // 调试日志
        console.log(`[Scheduler] reminder.template_name = ${reminder.template_name}`);
        console.log(`[Scheduler] pushConfig.template_name = ${pushConfig.template_name}`);

        const result = await sendPush(
            pushServiceUrl,
            pushConfig,
            reminder.title,
            reminder.content
        );

        // 记录执行日志
        await env.DB.prepare(`
            INSERT INTO trigger_logs (reminder_id, triggered_at, status, response, error, duration_ms)
            VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
            reminder.id,
            triggeredAt,
            result.success ? 'success' : 'failed',
            result.response ? JSON.stringify(result.response) : null,
            result.error || null,
            result.duration
        ).run();

        // **注意：手动触发不更新 reminders 表的 next_trigger_at**

        return { success: result.success, error: result.error };

    } catch (error) {
        console.error(`[Scheduler] 手动任务 ${reminder.id} 执行异常:`, error);

        await env.DB.prepare(`
            INSERT INTO trigger_logs (reminder_id, triggered_at, status, error, duration_ms)
            VALUES (?, ?, 'failed', ?, 0)
        `).bind(
            reminder.id,
            triggeredAt,
            error instanceof Error ? error.message : '未知错误'
        ).run();

        return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
}

/**
 * 执行单个提醒任务
 * 根据 reminder.type 分发到不同的执行逻辑
 */
async function executeReminder(
    reminder: Reminder,
    env: Env,
    triggeredAt: number
): Promise<void> {
    console.log(`[Scheduler] 执行任务: ${reminder.id} - ${reminder.title} (类型: ${reminder.type || 'reminder'})`);

    // 根据任务类型分发到不同的执行逻辑
    if (reminder.type === 'email_sync') {
        return executeEmailSyncTask(reminder, env, triggeredAt);
    }

    // 以下是普通提醒任务的执行逻辑

    try {
        // 解析推送配置
        const pushConfig: PushConfig = JSON.parse(reminder.push_config);

        // 获取外部推送服务地址
        const pushServiceUrl = env.PUSH_SERVICE_URL || env.DEFAULT_PUSH_URL || env.WORKER_BASE_URL;

        // 设置详情页基础地址
        pushConfig.base_url = pushServiceUrl;

        // 生成回调链接 (如果需要确认)
        if (reminder.ack_required) {
            pushConfig.callback_url = `${env.WORKER_BASE_URL}/api/reminders/${reminder.id}/ack`;
        }

        // 设置模板名称（优先使用任务级别配置）
        if (reminder.template_name) {
            pushConfig.template_name = reminder.template_name;
        }

        // 调试日志
        console.log(`[Scheduler-Cron] reminder.template_name = ${reminder.template_name}`);
        console.log(`[Scheduler-Cron] pushConfig.template_name = ${pushConfig.template_name}`);

        // 发送推送
        const result = await sendPush(
            pushServiceUrl,
            pushConfig,
            reminder.title,
            reminder.content
        );

        // 记录执行日志
        await env.DB.prepare(`
      INSERT INTO trigger_logs (reminder_id, triggered_at, status, response, error, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
            reminder.id,
            triggeredAt,
            result.success ? 'success' : 'failed',
            result.response ? JSON.stringify(result.response) : null,
            result.error || null,
            result.duration
        ).run();

        // 状态更新逻辑
        let updates: Promise<any>;

        if (reminder.ack_required) {
            // 需要确认：进入“催命”模式，每30分钟提醒一次，直到确认
            const retryMinutes = reminder.retry_interval || 30; // 默认 30 分钟
            const nextNagTime = triggeredAt + retryMinutes * 60 * 1000;
            updates = env.DB.prepare(`
                UPDATE reminders 
                SET next_trigger_at = ?,
                    last_trigger_at = ?,
                    trigger_count = trigger_count + 1,
                    ack_status = 'pending',
                    updated_at = ?
                WHERE id = ?
              `).bind(nextNagTime, triggeredAt, triggeredAt, reminder.id).run();
            console.log(`[Scheduler] 任务 ${reminder.id} 等待确认，${retryMinutes}分钟后重试: ${new Date(nextNagTime).toISOString()}`);
        } else {
            // 不需要确认：正常计算下次触发时间
            const nextTrigger = calculateNextTrigger(
                reminder.schedule_type,
                reminder.schedule_time,
                reminder.schedule_date,
                reminder.schedule_weekday,
                reminder.schedule_day,
                reminder.timezone,
                new Date(triggeredAt)
            );

            if (nextTrigger === null) {
                // 一次性任务或已过期，标记为已完成
                updates = env.DB.prepare(`
            UPDATE reminders 
            SET status = 'completed',
                last_trigger_at = ?,
                trigger_count = trigger_count + 1,
                updated_at = ?
            WHERE id = ?
          `).bind(triggeredAt, triggeredAt, reminder.id).run();
                console.log(`[Scheduler] 任务 ${reminder.id} 已完成（一次性任务）`);
            } else {
                // 周期任务，更新下次触发时间
                updates = env.DB.prepare(`
            UPDATE reminders 
            SET next_trigger_at = ?,
                last_trigger_at = ?,
                trigger_count = trigger_count + 1,
                updated_at = ?
            WHERE id = ?
          `).bind(nextTrigger, triggeredAt, triggeredAt, reminder.id).run();
                console.log(`[Scheduler] 任务 ${reminder.id} 下次触发时间: ${new Date(nextTrigger).toISOString()}`);
            }
        }

        await updates;

        if (result.success) {
            console.log(`[Scheduler] 任务 ${reminder.id} 推送成功`);
        } else {
            console.warn(`[Scheduler] 任务 ${reminder.id} 推送失败: ${result.error}`);
        }
    } catch (error) {
        console.error(`[Scheduler] 任务 ${reminder.id} 执行异常:`, error);

        // 记录错误日志
        await env.DB.prepare(`
      INSERT INTO trigger_logs (reminder_id, triggered_at, status, error, duration_ms)
      VALUES (?, ?, 'failed', ?, 0)
    `).bind(
            reminder.id,
            triggeredAt,
            error instanceof Error ? error.message : '未知错误'
        ).run();
    }
}
