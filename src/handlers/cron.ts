/**
 * Cron 触发处理器
 */

import { Env } from '../types';
import { handleScheduledTrigger } from '../services/scheduler';

/**
 * 处理 Cron 触发事件
 * 由 Cloudflare Workers 的 Cron Trigger 调用
 */
export async function handleCron(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
): Promise<void> {
    console.log(`[Cron] 触发时间: ${new Date(event.scheduledTime).toISOString()}`);

    // 使用 waitUntil 确保所有异步操作完成
    ctx.waitUntil(handleScheduledTrigger(env));
}
