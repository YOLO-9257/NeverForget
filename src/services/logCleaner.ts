/**
 * 日志清理服务
 * 定期清理过期的三层日志数据
 * @author zhangws
 */

import { Env } from '../types';

/** 清理结果 */
export interface CleanupResult {
    detailSuccessDeleted: number;    // 成功明细（> 15 天）
    detailFailedDeleted: number;     // 失败明细（> 180 天）
    detailOnceDeleted: number;       // 单次任务明细（> 180 天）
    rollupDeleted: number;           // 聚合数据（> 12 个月）
}

// ---- 常量 ----

const ONE_DAY_MS = 24 * 3600 * 1000;

/** 成功明细保留天数 */
const DETAIL_SUCCESS_RETENTION_DAYS = 15;

/** 失败明细保留天数 */
const DETAIL_FAILED_RETENTION_DAYS = 180;

/** 单次任务明细保留天数 */
const DETAIL_ONCE_RETENTION_DAYS = 180;

/** Rollup 保留月数 */
const ROLLUP_RETENTION_MONTHS = 12;

/** 每次清理批量大小 */
const BATCH_SIZE = 5000;

/**
 * 清理过期日志数据
 * 建议在每日凌晨（上海时间 00:00 = UTC 16:00）调用
 */
export async function cleanupOldLogs(env: Env): Promise<CleanupResult> {
    const now = Date.now();

    const result: CleanupResult = {
        detailSuccessDeleted: 0,
        detailFailedDeleted: 0,
        detailOnceDeleted: 0,
        rollupDeleted: 0,
    };

    try {
        // 1. 清理成功明细（采样/心跳/手动/慢请求/升档），保留 15 天
        const successCutoff = now - DETAIL_SUCCESS_RETENTION_DAYS * ONE_DAY_MS;
        const successResult = await env.DB.prepare(`
            DELETE FROM task_exec_detail
            WHERE status = 'success'
              AND detail_reason IN ('sampled', 'heartbeat', 'manual', 'slow', 'escalated')
              AND triggered_at < ?
            LIMIT ?
        `).bind(successCutoff, BATCH_SIZE).run();
        result.detailSuccessDeleted = Number(successResult.meta?.changes || 0);

        // 2. 清理失败明细，保留 180 天
        const failedCutoff = now - DETAIL_FAILED_RETENTION_DAYS * ONE_DAY_MS;
        const failedResult = await env.DB.prepare(`
            DELETE FROM task_exec_detail
            WHERE status = 'failed'
              AND triggered_at < ?
            LIMIT ?
        `).bind(failedCutoff, BATCH_SIZE).run();
        result.detailFailedDeleted = Number(failedResult.meta?.changes || 0);

        // 3. 清理单次任务明细，保留 180 天
        const onceCutoff = now - DETAIL_ONCE_RETENTION_DAYS * ONE_DAY_MS;
        const onceResult = await env.DB.prepare(`
            DELETE FROM task_exec_detail
            WHERE detail_reason = 'once'
              AND triggered_at < ?
            LIMIT ?
        `).bind(onceCutoff, BATCH_SIZE).run();
        result.detailOnceDeleted = Number(onceResult.meta?.changes || 0);

        // 4. 清理 Rollup，保留 12 个月
        // 计算 12 个月前的 bucket_hour 上界
        const rollupCutoffDate = new Date(now);
        rollupCutoffDate.setMonth(rollupCutoffDate.getMonth() - ROLLUP_RETENTION_MONTHS);
        const rollupCutoffHour = `${rollupCutoffDate.getUTCFullYear()}-${String(rollupCutoffDate.getUTCMonth() + 1).padStart(2, '0')}-${String(rollupCutoffDate.getUTCDate()).padStart(2, '0')} 00`;

        const rollupResult = await env.DB.prepare(`
            DELETE FROM task_exec_rollup
            WHERE bucket_hour < ?
            LIMIT ?
        `).bind(rollupCutoffHour, BATCH_SIZE).run();
        result.rollupDeleted = Number(rollupResult.meta?.changes || 0);

        const totalDeleted = result.detailSuccessDeleted + result.detailFailedDeleted
            + result.detailOnceDeleted + result.rollupDeleted;

        if (totalDeleted > 0) {
            console.log(`[LogCleaner] 清理完成: 成功明细 ${result.detailSuccessDeleted} 条, ` +
                `失败明细 ${result.detailFailedDeleted} 条, 单次明细 ${result.detailOnceDeleted} 条, ` +
                `聚合 ${result.rollupDeleted} 条`);
        }

        return result;
    } catch (err) {
        console.error('[LogCleaner] 清理日志失败:', err);
        return result;
    }
}
