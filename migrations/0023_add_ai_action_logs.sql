-- 新增：智能管家动作日志
-- 用于记录 AI 创建任务、立即发送等动作，统一展示在执行日志页

CREATE TABLE IF NOT EXISTS ai_action_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_key TEXT NOT NULL,
  action TEXT NOT NULL,                     -- create_reminder | send_immediate_message | ...
  reminder_id TEXT,                         -- 可为空（例如立即发送）
  reminder_title TEXT,
  reminder_type TEXT DEFAULT 'reminder',    -- reminder | email_sync
  triggered_at INTEGER NOT NULL,            -- 动作发生时间
  status TEXT NOT NULL,                     -- success | failed
  response TEXT,
  error TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_action_logs_user_time
  ON ai_action_logs(user_key, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_action_logs_user_status
  ON ai_action_logs(user_key, status);

CREATE INDEX IF NOT EXISTS idx_ai_action_logs_reminder
  ON ai_action_logs(reminder_id, triggered_at DESC);
