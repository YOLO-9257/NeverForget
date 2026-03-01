-- ==============================================
-- 执行日志三层架构重构
-- 版本: 0024
-- 日期: 2026-02-13
-- 目标: 将 trigger_logs 全量明细改造为
--       Snapshot + Rollup + Detail 三层模型
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
