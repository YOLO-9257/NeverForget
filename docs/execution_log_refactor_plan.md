# 执行日志三层架构重构 - 实施方案

> **版本**: 1.0  
> **日期**: 2026-02-13  
> **目标**: 将 `trigger_logs` 全量明细模式改造为 **Snapshot + Rollup + Detail** 三层模型，降低存储量 85%~95%，提升查询性能，保留完整的运维诊断能力。

---

## 一、现状分析

### 1.1 当前数据流

```
执行触发
  ├── scheduler.ts:117  → executeEmailSyncTask()  成功/失败 → 全量写 trigger_logs
  ├── scheduler.ts:248  → testRunReminder()        成功/失败 → 全量写 trigger_logs
  ├── scheduler.ts:331  → executeReminder()        成功        → 全量写 trigger_logs
  └── scheduler.ts:409  → executeReminder()        异常        → 全量写 trigger_logs
```

### 1.2 当前读取链路

| 接口 | 文件位置 | 查询方式 | 性能问题 |
|:---|:---|:---|:---|
| `GET /api/stats` | `src/index.ts:636` | 全表扫描 `trigger_logs` + `IN (reminderIds)` | 数据量大时极慢 |
| `GET /api/stats` 趋势图 | `src/index.ts:662` | 7 天范围全表聚合 | 同上 |
| `GET /api/stats/email-trend` | `src/handlers/statsHandler.ts:48` | 扫描 `trigger_logs` + `email_forward_logs` | 同上 |
| `GET /api/logs` | `src/index.ts:719` | `trigger_logs UNION ALL ai_action_logs` + 分页 | 大表联合 + COUNT |
| `GET /api/reminders/:id/logs` | 路由层 | 按 reminder_id 查明细 | 单任务还好 |

### 1.3 已有但未使用的表

迁移文件 `0020_complete_feature_set.sql` 中已定义但 **代码里没有写入逻辑**：

- `sync_statistics` (按天聚合统计)
- `sync_logs` (详细同步日志)
- `sync_status_snapshot` (实时状态快照)

---

## 二、目标架构：三层日志模型 + 自动升档

```
┌─────────────────────────────────────────────────────────┐
│                    Layer 1: Snapshot                     │
│         task_exec_snapshot（每任务 1 行）                  │
│  字段: last_status, last_error, last_duration_ms,       │
│        consecutive_failures, last_success_at,           │
│        total_count, success_count, failed_count         │
│  用途: 秒级查询任务当前状态                                │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                  Layer 2: Rollup                         │
│         task_exec_rollup（按小时聚合）                     │
│  字段: total, success, failed, slow_count,              │
│        avg_duration_ms, max_duration_ms, error_types    │
│  用途: 趋势图、成功率统计、看板                             │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                  Layer 3: Detail                         │
│         task_exec_detail（条件写入的明细）                  │
│  写入条件:                                               │
│    ✅ 单次任务(once) → 全量写                             │
│    ✅ 失败 → 全量写                                      │
│    ✅ 超时/慢请求(>5s) → 全量写                           │
│    ✅ 手动触发/测试 → 全量写                               │
│    ✅ 每任务每天首条成功 → 保留 1 条心跳                    │
│    ✅ 连续失败 ≥ 3 → 自动升档为全量明细                     │
│    ⭕ 高频成功 → 采样 5%                                  │
│  用途: 排障诊断、异常定位                                  │
└─────────────────────────────────────────────────────────┘
```

---

## 三、数据库变更 (SQL)

### 3.1 新增迁移文件 `migrations/0024_exec_log_refactor.sql`

```sql
-- ==============================================
-- 执行日志三层架构重构
-- ==============================================

-- ============ Layer 1: 任务执行快照表 ============
-- 每个任务只保留 1 行，实时更新，用于快速查询当前状态
CREATE TABLE IF NOT EXISTS task_exec_snapshot (
  reminder_id TEXT PRIMARY KEY,            -- 关联 reminders.id
  user_key TEXT NOT NULL,                  -- 冗余字段，避免 JOIN

  -- 最新一次执行信息
  last_status TEXT,                        -- success | failed
  last_error TEXT,                         -- 最近一次错误信息
  last_duration_ms INTEGER DEFAULT 0,      -- 最近一次耗时
  last_exec_at INTEGER,                    -- 最近一次执行时间
  last_success_at INTEGER,                 -- 最近一次成功时间

  -- 累计统计
  total_count INTEGER DEFAULT 0,           -- 总执行次数
  success_count INTEGER DEFAULT 0,         -- 成功次数
  failed_count INTEGER DEFAULT 0,          -- 失败次数

  -- 异常检测
  consecutive_failures INTEGER DEFAULT 0,  -- 连续失败次数（成功后归零）
  is_escalated INTEGER DEFAULT 0,          -- 是否处于升档模式（1=全量记录明细）
  escalated_until INTEGER,                 -- 升档模式截止时间

  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshot_user ON task_exec_snapshot(user_key);
CREATE INDEX IF NOT EXISTS idx_snapshot_status ON task_exec_snapshot(last_status);
CREATE INDEX IF NOT EXISTS idx_snapshot_failures ON task_exec_snapshot(consecutive_failures);


-- ============ Layer 2: 执行聚合统计表（按小时） ============
-- 用于趋势图和统计面板，是主要的查询数据源
CREATE TABLE IF NOT EXISTS task_exec_rollup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reminder_id TEXT NOT NULL,               -- 关联 reminders.id
  user_key TEXT NOT NULL,                  -- 冗余字段，避免 JOIN
  task_type TEXT DEFAULT 'reminder',       -- reminder | email_sync
  bucket_hour TEXT NOT NULL,               -- 聚合时段: YYYY-MM-DD HH (上海时间)

  -- 聚合指标
  total_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  slow_count INTEGER DEFAULT 0,            -- 慢请求数（耗时 > 5000ms）

  -- 耗时统计
  avg_duration_ms INTEGER DEFAULT 0,
  max_duration_ms INTEGER DEFAULT 0,
  min_duration_ms INTEGER DEFAULT 0,
  total_duration_ms INTEGER DEFAULT 0,     -- 用于增量计算 avg

  -- 错误分类 Top N
  error_types TEXT,                        -- JSON: {"NETWORK_ERROR": 2, "AUTH_FAILED": 1}

  updated_at INTEGER NOT NULL,

  UNIQUE(reminder_id, bucket_hour)
);

CREATE INDEX IF NOT EXISTS idx_rollup_user_hour ON task_exec_rollup(user_key, bucket_hour);
CREATE INDEX IF NOT EXISTS idx_rollup_type_hour ON task_exec_rollup(task_type, bucket_hour);
CREATE INDEX IF NOT EXISTS idx_rollup_reminder_hour ON task_exec_rollup(reminder_id, bucket_hour);


-- ============ Layer 3: 执行明细表（条件写入） ============
-- 只记录"有诊断价值"的事件，体量远小于旧 trigger_logs
CREATE TABLE IF NOT EXISTS task_exec_detail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reminder_id TEXT NOT NULL,
  user_key TEXT NOT NULL,
  task_type TEXT DEFAULT 'reminder',       -- reminder | email_sync

  -- 执行信息
  triggered_at INTEGER NOT NULL,
  status TEXT NOT NULL,                    -- success | failed
  response TEXT,                           -- 推送服务返回的响应（成功时可为简要）
  error TEXT,                              -- 错误信息
  duration_ms INTEGER DEFAULT 0,

  -- 写入原因标记（用于排查和清理策略）
  detail_reason TEXT NOT NULL,             -- once | failed | slow | escalated | sampled | heartbeat | manual

  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_detail_reminder_time ON task_exec_detail(reminder_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_detail_user_time ON task_exec_detail(user_key, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_detail_status ON task_exec_detail(status, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_detail_reason ON task_exec_detail(detail_reason);


-- ============ 初始化：从现有 reminders 表预填充 snapshot ============
-- 将已有任务的执行统计迁移到 snapshot 中
INSERT OR IGNORE INTO task_exec_snapshot (
  reminder_id, user_key, total_count, last_exec_at, updated_at
)
SELECT
  r.id,
  r.user_key,
  r.trigger_count,
  r.last_trigger_at,
  strftime('%s', 'now') * 1000
FROM reminders r;
```

### 3.2 保留策略说明

| 层 | 数据 | 建议保留周期 | 清理方式 |
|:---|:---|:---|:---|
| Snapshot | 每任务 1 行 | 永久（随任务删除而删除） | 随 `reminders` 级联 |
| Rollup | 按小时聚合 | **12~24 个月** | 定期清理 > 12 个月的行 |
| Detail - 成功 | 采样/心跳 | **7~15 天** | 定期批量删除 |
| Detail - 失败 | 全量 | **90~180 天** | 定期批量删除 |
| Detail - 单次任务 | 全量 | **180 天** | 定期批量删除 |
| 旧 trigger_logs | 全量（双写期间保留） | 双写稳定后 **30 天缓冲** → 下线 | 最终 DROP 或 RENAME |

---

## 四、代码改动清单

### 4.1 第 1 阶段：新增写入层（双写，不破坏现网）

#### 4.1.1 新建 `src/services/execLogger.ts`（核心模块）

**职责**：封装三层日志写入逻辑，所有执行结果通过此模块记录。

```typescript
/**
 * 执行日志服务 - 三层写入核心
 * @author zhangws
 *
 * 写入策略:
 *   Layer 1 (Snapshot): 每次执行必写，更新最新状态
 *   Layer 2 (Rollup):   每次执行必写，按小时聚合
 *   Layer 3 (Detail):   按策略写入，仅保留有价值的明细
 */

// ---- 主入口 ----
export async function recordExecution(
  env: Env,
  params: ExecRecord
): Promise<void>

// ---- 内部函数 ----
function updateSnapshot(env, params): Promise<void>
function upsertRollup(env, params): Promise<void>
function shouldWriteDetail(env, params, snapshot): DetailReason | null
function writeDetail(env, params, reason): Promise<void>

// ---- 类型定义 ----
interface ExecRecord {
  reminderId: string;
  userKey: string;
  taskType: 'reminder' | 'email_sync';
  scheduleType: string;     // once | daily | weekly | monthly | cron
  triggeredAt: number;
  status: 'success' | 'failed';
  response?: string | null;
  error?: string | null;
  durationMs: number;
  isManual?: boolean;        // 手动触发/测试
}

type DetailReason = 'once' | 'failed' | 'slow' | 'escalated' | 'sampled' | 'heartbeat' | 'manual';
```

**明细写入决策 `shouldWriteDetail()` 伪代码**：

```
function shouldWriteDetail(params, snapshot):
  // 1. 手动触发 → 全量
  if params.isManual → return 'manual'

  // 2. 单次任务 → 全量
  if params.scheduleType === 'once' → return 'once'

  // 3. 失败 → 全量
  if params.status === 'failed' → return 'failed'

  // 4. 慢请求 (> 5000ms) → 全量
  if params.durationMs > 5000 → return 'slow'

  // 5. 当前处于升档模式 → 全量
  if snapshot.is_escalated && now < snapshot.escalated_until → return 'escalated'

  // 6. 当天首条成功（心跳）→ 保留
  // 查询 detail 表是否已有当天该任务的 heartbeat 记录
  if 今天尚无心跳记录 → return 'heartbeat'

  // 7. 随机采样 5%
  if Math.random() < 0.05 → return 'sampled'

  // 8. 不写明细
  return null
```

**自动升档逻辑（在 `updateSnapshot` 中实现）**：

```
// 更新 snapshot 后检查：
if status === 'failed':
  consecutive_failures += 1
  if consecutive_failures >= 3 && !is_escalated:
    is_escalated = 1
    escalated_until = now + 2 * 3600 * 1000  // 升档持续 2 小时
else:
  consecutive_failures = 0
  is_escalated = 0
  escalated_until = null
```

#### 4.1.2 修改 `src/services/scheduler.ts`（4 处写入点）

所有写入 `trigger_logs` 的位置，**新增** `recordExecution()` 调用（双写，旧逻辑不动）。

| 行号 | 函数 | 改动 |
|:---|:---|:---|
| **L116~126** | `executeEmailSyncTask()` 成功路径 | 在 `trigger_logs INSERT` 后追加 `recordExecution()` |
| **L150~157** | `executeEmailSyncTask()` 异常路径 | 同上 |
| **L247~257** | `testRunReminder()` 成功路径 | 追加 `recordExecution({ isManual: true })` |
| **L266~273** | `testRunReminder()` 异常路径 | 同上 |
| **L330~340** | `executeReminder()` 成功路径 | 追加 `recordExecution()` |
| **L408~415** | `executeReminder()` 异常路径 | 同上 |

**代码改动示例（L116~126 位置）**：

```typescript
// --- 现有代码（保留，双写期间不动） ---
await env.DB.prepare(`
    INSERT INTO trigger_logs (reminder_id, triggered_at, status, response, error, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?)
`).bind(
    reminder.id, triggeredAt,
    result.success ? 'success' : 'failed',
    result.emailsForwarded > 0 ? `同步 ${result.emailsFound} 封, 转发 ${result.emailsForwarded} 封` : null,
    result.error || null,
    result.duration || 0
).run();

// --- 新增: 三层日志写入 ---
await recordExecution(env, {
    reminderId: reminder.id,
    userKey: reminder.user_key,
    taskType: 'email_sync',
    scheduleType: reminder.schedule_type,
    triggeredAt,
    status: result.success ? 'success' : 'failed',
    response: result.emailsForwarded > 0 ? `同步 ${result.emailsFound} 封, 转发 ${result.emailsForwarded} 封` : null,
    error: result.error || null,
    durationMs: result.duration || 0,
});
```

#### 4.1.3 新建 `src/services/logCleaner.ts`（定期清理）

**职责**：在每日 Cron 或按需调用中清理过期明细。

```typescript
/**
 * 日志清理服务
 * @author zhangws
 */
export async function cleanupOldLogs(env: Env): Promise<CleanupResult>

interface CleanupResult {
  detailSuccessDeleted: number;   // 成功明细（> 15 天）
  detailFailedDeleted: number;    // 失败明细（> 180 天）
  rollupDeleted: number;          // 聚合数据（> 12 个月）
}
```

**清理 SQL**：

```sql
-- 清理成功明细（采样/心跳），保留 15 天
DELETE FROM task_exec_detail
WHERE status = 'success'
  AND detail_reason IN ('sampled', 'heartbeat')
  AND triggered_at < ?
LIMIT 5000;

-- 清理失败明细，保留 180 天
DELETE FROM task_exec_detail
WHERE status = 'failed'
  AND triggered_at < ?
LIMIT 5000;

-- 清理单次任务明细，保留 180 天
DELETE FROM task_exec_detail
WHERE detail_reason = 'once'
  AND triggered_at < ?
LIMIT 5000;

-- 清理 rollup，保留 12 个月
DELETE FROM task_exec_rollup
WHERE bucket_hour < ?
LIMIT 5000;
```

#### 4.1.4 修改 `src/services/scheduler.ts` → `handleScheduledTrigger()`

在每日 0 点附近触发清理（可通过判断小时数）：

```typescript
// 在 handleScheduledTrigger 的 try 块末尾追加：
const hour = new Date(now).getUTCHours();
if (hour === 16) { // UTC 16:00 = 上海时间 00:00
    await cleanupOldLogs(env);
}
```

---

### 4.2 第 2 阶段：改造查询层（读新表）

#### 4.2.1 改造 `getStats()`（`src/index.ts:590~714`）

**改动目标**：统计数据改读 `task_exec_snapshot` + `task_exec_rollup`，不再全表扫描 `trigger_logs`。

**改动前（现有逻辑）**：
```
1. 查 reminders 表 → 获取 reminderIds
2. 用 reminderIds IN (...) 扫描 trigger_logs → 聚合统计
3. 用 reminderIds IN (...) + date() 扫描 trigger_logs → 7 天趋势
```

**改动后（新逻辑）**：
```
1. 从 task_exec_snapshot 聚合（SUM）→ 获取总次数、成功/失败数、今日次数
   SELECT
     SUM(total_count) as total_triggers,
     SUM(success_count) as success_triggers,
     SUM(failed_count) as failed_triggers
   FROM task_exec_snapshot
   WHERE user_key = ?

2. 从 task_exec_rollup 聚合 → 获取 7 天趋势（按 bucket_hour 的日期部分 GROUP BY）
   SELECT
     SUBSTR(bucket_hour, 1, 10) as day,
     SUM(success_count) as success,
     SUM(failed_count) as failed
   FROM task_exec_rollup
   WHERE user_key = ? AND bucket_hour >= ?
   GROUP BY day
   ORDER BY day ASC

3. 今日执行次数:
   SELECT SUM(total_count) as today
   FROM task_exec_rollup
   WHERE user_key = ? AND bucket_hour >= ? -- 今天 00:00 的 bucket
```

**预期效果**：查询从 O(trigger_logs全量) 降为 O(任务数) + O(7天*24小时=168行)。

#### 4.2.2 改造 `getEmailTrend()`（`src/handlers/statsHandler.ts:9~85`）

**改动目标**：同步执行次数从 `task_exec_rollup` 读取。

```sql
-- 替代原来扫描 trigger_logs 的查询
SELECT
  SUBSTR(bucket_hour, 1, 10) as day,
  SUM(success_count) as count
FROM task_exec_rollup
WHERE user_key = ?
  AND task_type = 'email_sync'
  AND bucket_hour >= ?
GROUP BY day
ORDER BY day ASC
```

#### 4.2.3 改造 `getAllLogs()`（`src/index.ts:716~894`）

**改动目标**：日志页默认读 `task_exec_detail`（而非 `trigger_logs`），支持更高效的分页。

**改动后逻辑**：

```sql
SELECT
  d.id, d.reminder_id, d.triggered_at, d.status,
  d.response, d.error, d.duration_ms, d.detail_reason,
  r.title AS reminder_title,
  r.type AS reminder_type,
  'scheduler' AS source,
  NULL AS action
FROM task_exec_detail d
INNER JOIN reminders r ON d.reminder_id = r.id
WHERE d.user_key = ?
  ${type ? 'AND d.task_type = ?' : ''}
  ${status ? 'AND d.status = ?' : ''}

UNION ALL

SELECT ... FROM ai_action_logs ...

ORDER BY triggered_at DESC
LIMIT ? OFFSET ?
```

**额外改进**：
- 默认加 **时间窗** 限制（最近 30 天），避免深翻页
- 前端增加 `detail_reason` 过滤器和标签展示

#### 4.2.4 前端改动清单

| 文件 | 改动 |
|:---|:---|
| `admin/src/pages/Dashboard/index.tsx` | 无需改动（数据结构不变，只是后端查询源变了） |
| `admin/src/pages/Dashboard/Charts.tsx` | 无需改动 |
| `admin/src/pages/Logs.tsx` | 增加 `detail_reason` 标签显示（小改） |
| `admin/src/types.ts` | `TriggerLog` 类型增加 `detail_reason?: string` 字段 |

---

### 4.3 第 3 阶段：稳定后下线旧逻辑

#### 4.3.1 验收条件

1. 双写运行 **≥ 2 周**，新旧统计数据对比偏差 < 1%
2. `task_exec_snapshot` 中部分任务出现过 `consecutive_failures >= 3` 并正确升档
3. `task_exec_detail` 行数约为同期 `trigger_logs` 新增行数的 5%~15%
4. 日志页和统计页响应时间稳定 < 200ms

#### 4.3.2 下线步骤

1. 移除 `scheduler.ts` 中所有 `trigger_logs INSERT` 语句（6 处）
2. `getStats()` / `getAllLogs()` / `getEmailTrend()` 中移除旧 `trigger_logs` 查询
3. 保留 `trigger_logs` 表 30 天作为备份缓冲
4. 30 天后执行：`ALTER TABLE trigger_logs RENAME TO trigger_logs_archive`

---

## 五、文件改动矩阵

| 文件 | 阶段 | 类型 | 改动说明 |
|:---|:---|:---|:---|
| `migrations/0024_exec_log_refactor.sql` | 1 | 🆕 新建 | 三层表结构 + 索引 + 初始数据迁移 |
| `src/services/execLogger.ts` | 1 | 🆕 新建 | 三层写入核心逻辑 |
| `src/services/logCleaner.ts` | 1 | 🆕 新建 | 定期清理服务 |
| `src/services/scheduler.ts` | 1 | ✏️ 修改 | 6 处追加 `recordExecution()` 调用 |
| `src/types/index.ts` | 1 | ✏️ 修改 | 新增 `ExecRecord`、`TaskExecSnapshot` 等类型 |
| `src/index.ts` (getStats) | 2 | ✏️ 修改 | 统计查询改读 snapshot + rollup |
| `src/index.ts` (getAllLogs) | 2 | ✏️ 修改 | 日志查询改读 task_exec_detail |
| `src/handlers/statsHandler.ts` | 2 | ✏️ 修改 | 邮件趋势改读 rollup |
| `admin/src/pages/Logs.tsx` | 2 | ✏️ 修改 | 增加 detail_reason 标签展示 |
| `admin/src/types.ts` | 2 | ✏️ 修改 | TriggerLog 增加 detail_reason 字段 |
| `src/services/scheduler.ts` | 3 | ✏️ 修改 | 移除 trigger_logs INSERT（6 处） |
| `src/index.ts` | 3 | ✏️ 修改 | 移除旧 trigger_logs 查询 |
| `src/handlers/statsHandler.ts` | 3 | ✏️ 修改 | 移除旧 trigger_logs 查询 |

---

## 六、Rollup 聚合键设计

### `bucket_hour` 格式

采用 **上海时间** 的小时字符串：`YYYY-MM-DD HH`

```typescript
function getBucketHour(timestampMs: number): string {
  const SHANGHAI_OFFSET = 8 * 3600 * 1000;
  const d = new Date(timestampMs + SHANGHAI_OFFSET);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hour = String(d.getUTCHours()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}`;
}
```

### Rollup UPSERT SQL

```sql
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
  updated_at = excluded.updated_at;
```

---

## 七、风险与回滚

| 风险 | 影响 | 缓解措施 |
|:---|:---|:---|
| 双写期间数据口径不一致 | 新旧统计可能有微小差异 | 双写 2 周后对比，偏差 < 1% 才切读 |
| D1 SQLite `UPSERT` 性能 | 高频 upsert 可能有锁竞争 | Rollup 按小时粒度，同一分钟内冲突概率低 |
| 采样率配置不当 | 成功明细丢失过多/过少 | 初始 5%，可通过环境变量 `EXEC_LOG_SAMPLE_RATE` 调整 |
| 升档模式触发过频 | 某些任务频繁抖动导致明细暴增 | 设置 `escalated_until` 冷却期（2 小时） |

### 回滚方案

1. **查询回滚**：将 `getStats()` / `getAllLogs()` 切回读 `trigger_logs`（代码级 Feature Flag）
2. **写入回滚**：移除 `recordExecution()` 调用，不影响旧 `trigger_logs` 写入
3. **数据不丢**：双写期间旧表数据完整保留，随时可回退

---

## 八、预期效果

| 指标 | 改造前 | 改造后 |
|:---|:---|:---|
| **日志存储量** | 每日数千~数万行 | Snapshot 固定行数 + Rollup 每任务24行/天 + Detail 约 5%~15% |
| **存储下降** | - | **85%~95%** |
| **统计查询耗时** | 全表扫描 trigger_logs | 读 snapshot (O(1) per task) + rollup (O(168)) |
| **日志页查询** | UNION ALL 大表 + COUNT | 小表分页，自带时间窗 |
| **异常诊断能力** | ✅ 全量明细 | ✅ 失败全量 + 升档全量 + 心跳 + 采样 |
| **趋势分析能力** | ⚠️ 全表聚合 | ✅ 预聚合 rollup，秒级响应 |
