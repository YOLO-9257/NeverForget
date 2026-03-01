-- ==============================================
-- 修复迁移：回填 task_exec_snapshot 成功/失败统计
-- 版本: 0025
-- 日期: 2026-02-14
-- 目标:
--   1) 补齐 snapshot 中 success_count / failed_count
--   2) 修复 last_status / last_error / last_duration_ms
--   3) 避免仅有 total_count 时新模型统计失真
-- ==============================================

-- 1) 防御性补齐：确保所有 reminders 都有 snapshot 行
INSERT OR IGNORE INTO task_exec_snapshot (
  reminder_id,
  user_key,
  total_count,
  last_exec_at,
  updated_at
)
SELECT
  r.id,
  r.user_key,
  COALESCE(r.trigger_count, 0),
  r.last_trigger_at,
  strftime('%s', 'now') * 1000
FROM reminders r;

-- 2) 从 trigger_logs 聚合回填统计
WITH agg AS (
  SELECT
    t.reminder_id,
    COUNT(*) AS total_count,
    SUM(CASE WHEN t.status = 'success' THEN 1 ELSE 0 END) AS success_count,
    SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
    MAX(t.triggered_at) AS last_exec_at,
    MAX(CASE WHEN t.status = 'success' THEN t.triggered_at END) AS last_success_at
  FROM trigger_logs t
  GROUP BY t.reminder_id
),
last_row AS (
  SELECT
    t1.reminder_id,
    t1.status AS last_status,
    t1.error AS last_error,
    COALESCE(t1.duration_ms, 0) AS last_duration_ms
  FROM trigger_logs t1
  WHERE t1.id = (
    SELECT t2.id
    FROM trigger_logs t2
    WHERE t2.reminder_id = t1.reminder_id
    ORDER BY t2.triggered_at DESC, t2.id DESC
    LIMIT 1
  )
)
UPDATE task_exec_snapshot
SET
  total_count = CASE
    WHEN (SELECT a.total_count FROM agg a WHERE a.reminder_id = task_exec_snapshot.reminder_id) IS NULL
      THEN COALESCE(total_count, 0)
    ELSE MAX(
      COALESCE(total_count, 0),
      COALESCE((SELECT a.total_count FROM agg a WHERE a.reminder_id = task_exec_snapshot.reminder_id), 0)
    )
  END,
  success_count = MAX(
    COALESCE(success_count, 0),
    COALESCE((SELECT a.success_count FROM agg a WHERE a.reminder_id = task_exec_snapshot.reminder_id), 0)
  ),
  failed_count = MAX(
    COALESCE(failed_count, 0),
    COALESCE((SELECT a.failed_count FROM agg a WHERE a.reminder_id = task_exec_snapshot.reminder_id), 0)
  ),
  last_exec_at = COALESCE(
    (SELECT a.last_exec_at FROM agg a WHERE a.reminder_id = task_exec_snapshot.reminder_id),
    last_exec_at
  ),
  last_success_at = COALESCE(
    (SELECT a.last_success_at FROM agg a WHERE a.reminder_id = task_exec_snapshot.reminder_id),
    last_success_at
  ),
  last_status = COALESCE(
    (SELECT lr.last_status FROM last_row lr WHERE lr.reminder_id = task_exec_snapshot.reminder_id),
    last_status
  ),
  last_error = COALESCE(
    (SELECT lr.last_error FROM last_row lr WHERE lr.reminder_id = task_exec_snapshot.reminder_id),
    last_error
  ),
  last_duration_ms = COALESCE(
    (SELECT lr.last_duration_ms FROM last_row lr WHERE lr.reminder_id = task_exec_snapshot.reminder_id),
    last_duration_ms,
    0
  ),
  updated_at = strftime('%s', 'now') * 1000;
