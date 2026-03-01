/**
 * 执行日志服务 - 三层写入核心
 * @author zhangws
 *
 * 写入策略:
 *   Layer 1 (Snapshot): 每次执行必写，更新最新状态
 *   Layer 2 (Rollup):   每次执行必写，按小时聚合
 *   Layer 3 (Detail):   按策略写入，仅保留有价值的明细
 */

import { Env } from '../types';

// ---- 类型定义 ----

/** 执行记录参数 */
export interface ExecRecord {
    reminderId: string;
    userKey: string;
    taskType: 'reminder' | 'email_sync';
    scheduleType: string;       // once | daily | weekly | monthly | cron
    triggeredAt: number;
    status: 'success' | 'failed';
    response?: string | null;
    error?: string | null;
    durationMs: number;
    isManual?: boolean;         // 手动触发/测试
}

/** 明细写入原因 */
export type DetailReason = 'once' | 'failed' | 'slow' | 'escalated' | 'sampled' | 'heartbeat' | 'manual';

/** 快照行数据 */
interface SnapshotRow {
    reminder_id: string;
    consecutive_failures: number;
    is_escalated: number;
    escalated_until: number | null;
}

// ---- 常量 ----

/** 慢请求阈值（毫秒） */
const SLOW_THRESHOLD_MS = 5000;

/** 升档持续时长（毫秒）：2 小时 */
const ESCALATION_DURATION_MS = 2 * 3600 * 1000;

/** 连续失败触发升档的次数 */
const ESCALATION_FAILURE_COUNT = 3;

/** 默认采样率 */
const DEFAULT_SAMPLE_RATE = 0.05;

// ---- 工具函数 ----

/**
 * 根据毫秒时间戳计算上海时间的小时桶键
 * 格式: YYYY-MM-DD HH
 */
function getBucketHour(timestampMs: number): string {
    const SHANGHAI_OFFSET = 8 * 3600 * 1000;
    const d = new Date(timestampMs + SHANGHAI_OFFSET);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hour = String(d.getUTCHours()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}`;
}

/**
 * 获取上海时间的日期字符串
 * 格式: YYYY-MM-DD
 */
function getShanghaiDate(timestampMs: number): string {
    const SHANGHAI_OFFSET = 8 * 3600 * 1000;
    const d = new Date(timestampMs + SHANGHAI_OFFSET);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ---- 主入口 ----

/**
 * 记录一次执行结果到三层日志模型
 * 所有执行结果统一通过此函数记录
 */
export async function recordExecution(
    env: Env,
    params: ExecRecord
): Promise<void> {
    try {
        // Layer 1: 更新快照（必写）
        const snapshot = await updateSnapshot(env, params);

        // Layer 2: 更新聚合（必写）
        await upsertRollup(env, params);

        // Layer 3: 条件写入明细
        const reason = await shouldWriteDetail(env, params, snapshot);
        if (reason) {
            await writeDetail(env, params, reason);
        }
    } catch (err) {
        // 三层日志写入失败不应影响业务主流程，仅打印错误
        console.error('[ExecLogger] 三层日志写入失败:', err);
    }
}

// ---- Layer 1: 快照更新 ----

/**
 * 更新任务执行快照（UPSERT）
 * 包含自动升档逻辑：连续失败 >= 3 次时启动升档模式
 */
async function updateSnapshot(
    env: Env,
    params: ExecRecord
): Promise<SnapshotRow> {
    const now = Date.now();
    const isSuccess = params.status === 'success';

    // 先查询当前快照状态
    const existing = await env.DB.prepare(`
        SELECT reminder_id, consecutive_failures, is_escalated, escalated_until
        FROM task_exec_snapshot
        WHERE reminder_id = ?
    `).bind(params.reminderId).first<SnapshotRow>();

    let consecutiveFailures = 0;
    let isEscalated = 0;
    let escalatedUntil: number | null = null;

    if (existing) {
        if (isSuccess) {
            // 成功：重置连续失败，关闭升档
            consecutiveFailures = 0;
            isEscalated = 0;
            escalatedUntil = null;
        } else {
            // 失败：累加连续失败计数
            consecutiveFailures = (existing.consecutive_failures || 0) + 1;

            // 检查是否需要升档
            if (consecutiveFailures >= ESCALATION_FAILURE_COUNT && !existing.is_escalated) {
                isEscalated = 1;
                escalatedUntil = now + ESCALATION_DURATION_MS;
                console.log(`[ExecLogger] 任务 ${params.reminderId} 连续失败 ${consecutiveFailures} 次，已自动升档，持续至 ${new Date(escalatedUntil).toISOString()}`);
            } else {
                // 保持现有升档状态
                isEscalated = existing.is_escalated;
                escalatedUntil = existing.escalated_until;
            }
        }
    } else {
        // 首次记录
        consecutiveFailures = isSuccess ? 0 : 1;
    }

    // UPSERT 快照
    await env.DB.prepare(`
        INSERT INTO task_exec_snapshot (
            reminder_id, user_key,
            last_status, last_error, last_duration_ms, last_exec_at, last_success_at,
            total_count, success_count, failed_count,
            consecutive_failures, is_escalated, escalated_until,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(reminder_id) DO UPDATE SET
            last_status = excluded.last_status,
            last_error = excluded.last_error,
            last_duration_ms = excluded.last_duration_ms,
            last_exec_at = excluded.last_exec_at,
            last_success_at = CASE WHEN excluded.last_status = 'success' THEN excluded.last_exec_at ELSE last_success_at END,
            total_count = total_count + 1,
            success_count = success_count + CASE WHEN excluded.last_status = 'success' THEN 1 ELSE 0 END,
            failed_count = failed_count + CASE WHEN excluded.last_status = 'failed' THEN 1 ELSE 0 END,
            consecutive_failures = excluded.consecutive_failures,
            is_escalated = excluded.is_escalated,
            escalated_until = excluded.escalated_until,
            updated_at = excluded.updated_at
    `).bind(
        params.reminderId,
        params.userKey,
        params.status,
        params.error || null,
        params.durationMs,
        params.triggeredAt,
        isSuccess ? params.triggeredAt : null,
        isSuccess ? 1 : 0,
        isSuccess ? 0 : 1,
        consecutiveFailures,
        isEscalated,
        escalatedUntil,
        now
    ).run();

    return {
        reminder_id: params.reminderId,
        consecutive_failures: consecutiveFailures,
        is_escalated: isEscalated,
        escalated_until: escalatedUntil,
    };
}

// ---- Layer 2: 聚合更新 ----

/**
 * 按小时粒度 UPSERT 聚合统计
 */
async function upsertRollup(
    env: Env,
    params: ExecRecord
): Promise<void> {
    const bucketHour = getBucketHour(params.triggeredAt);
    const now = Date.now();
    const isSuccess = params.status === 'success';
    const isSlow = params.durationMs > SLOW_THRESHOLD_MS ? 1 : 0;

    await env.DB.prepare(`
        INSERT INTO task_exec_rollup (
            reminder_id, user_key, task_type, bucket_hour,
            total_count, success_count, failed_count, slow_count,
            avg_duration_ms, max_duration_ms, min_duration_ms, total_duration_ms,
            updated_at
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(reminder_id, bucket_hour) DO UPDATE SET
            total_count = total_count + 1,
            success_count = success_count + excluded.success_count,
            failed_count = failed_count + excluded.failed_count,
            slow_count = slow_count + excluded.slow_count,
            total_duration_ms = total_duration_ms + excluded.total_duration_ms,
            avg_duration_ms = (total_duration_ms + excluded.total_duration_ms) / (total_count + 1),
            max_duration_ms = MAX(max_duration_ms, excluded.max_duration_ms),
            min_duration_ms = MIN(min_duration_ms, excluded.min_duration_ms),
            updated_at = excluded.updated_at
    `).bind(
        params.reminderId,
        params.userKey,
        params.taskType,
        bucketHour,
        isSuccess ? 1 : 0,      // success_count
        isSuccess ? 0 : 1,      // failed_count
        isSlow,                  // slow_count
        params.durationMs,       // avg_duration_ms（首次插入等于自身）
        params.durationMs,       // max_duration_ms
        params.durationMs,       // min_duration_ms
        params.durationMs,       // total_duration_ms
        now
    ).run();
}

// ---- Layer 3: 明细决策与写入 ----

/**
 * 判断是否需要写入明细，返回写入原因，null 表示不写
 */
async function shouldWriteDetail(
    env: Env,
    params: ExecRecord,
    snapshot: SnapshotRow
): Promise<DetailReason | null> {
    const now = Date.now();

    // 1. 手动触发 → 全量
    if (params.isManual) return 'manual';

    // 2. 单次任务 → 全量
    if (params.scheduleType === 'once') return 'once';

    // 3. 失败 → 全量
    if (params.status === 'failed') return 'failed';

    // 4. 慢请求 (> 5000ms) → 全量
    if (params.durationMs > SLOW_THRESHOLD_MS) return 'slow';

    // 5. 当前处于升档模式 → 全量
    if (snapshot.is_escalated && snapshot.escalated_until && now < snapshot.escalated_until) {
        return 'escalated';
    }

    // 6. 当天首条成功（心跳）→ 保留
    const todayDate = getShanghaiDate(params.triggeredAt);
    const todayBucketStart = `${todayDate} 00`;
    const todayBucketEnd = `${todayDate} 23`;

    const heartbeatExists = await env.DB.prepare(`
        SELECT 1 FROM task_exec_detail
        WHERE reminder_id = ?
          AND detail_reason = 'heartbeat'
          AND triggered_at >= (
              SELECT MIN(triggered_at) FROM task_exec_detail
              WHERE reminder_id = ? AND triggered_at >= ?
          )
        LIMIT 1
    `).bind(
        params.reminderId,
        params.reminderId,
        // 计算当天上海时间 00:00 对应的 UTC 毫秒时间戳
        (() => {
            const SHANGHAI_OFFSET = 8 * 3600 * 1000;
            const ONE_DAY_MS = 24 * 3600 * 1000;
            // 当前日期的上海时间 00:00
            return params.triggeredAt - ((params.triggeredAt + SHANGHAI_OFFSET) % ONE_DAY_MS);
        })()
    ).first();

    if (!heartbeatExists) return 'heartbeat';

    // 7. 随机采样 5%
    if (Math.random() < DEFAULT_SAMPLE_RATE) return 'sampled';

    // 8. 不写明细
    return null;
}

/**
 * 写入执行明细记录
 */
async function writeDetail(
    env: Env,
    params: ExecRecord,
    reason: DetailReason
): Promise<void> {
    await env.DB.prepare(`
        INSERT INTO task_exec_detail (
            reminder_id, user_key, task_type,
            triggered_at, status, response, error, duration_ms,
            detail_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        params.reminderId,
        params.userKey,
        params.taskType,
        params.triggeredAt,
        params.status,
        params.response || null,
        params.error || null,
        params.durationMs,
        reason
    ).run();
}
