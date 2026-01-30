-- NeverForget - 数据库结构（全量合并版）
-- 更新时间: 2026-01-30

-- 提醒任务表
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,                    -- 任务ID，格式：rem_xxx
  user_key TEXT NOT NULL,                 -- 用户标识
  title TEXT NOT NULL,                    -- 提醒标题
  content TEXT NOT NULL,                  -- 提醒内容
  
  -- 调度配置
  schedule_type TEXT NOT NULL,            -- once | daily | weekly | monthly | cron
  schedule_time TEXT,                     -- HH:mm 格式
  schedule_cron TEXT,                     -- Cron 表达式
  schedule_date TEXT,                     -- 一次性任务的日期 YYYY-MM-DD
  schedule_weekday INTEGER,               -- 周几 0-6 (0=周日)
  schedule_day INTEGER,                   -- 几号 1-31
  timezone TEXT DEFAULT 'Asia/Shanghai',  -- 时区
  
  -- 推送配置
  push_config TEXT NOT NULL,              -- JSON: {appid, secret, userid, template_id}
  push_url TEXT,                          -- 自定义推送服务地址 (go-wxpush)
  template_name TEXT,                     -- go-wxpush 模板名称
  
  -- 状态与触发
  status TEXT DEFAULT 'active',           -- active | paused | completed | failed
  next_trigger_at INTEGER,                -- 下次触发时间戳
  last_trigger_at INTEGER,                -- 上次触发时间戳
  trigger_count INTEGER DEFAULT 0,        -- 已触发次数
  
  -- 确认/强提醒配置
  ack_required INTEGER DEFAULT 0,         -- 是否需要确认 (0/1)
  ack_status TEXT DEFAULT 'none',         -- 确认状态 (none, pending, completed)
  last_ack_at INTEGER,                    -- 最近确认时间
  retry_interval INTEGER DEFAULT 30,      -- 强提醒重试间隔（分钟）
  
  -- 元数据
  created_at INTEGER NOT NULL,            -- 创建时间戳
  updated_at INTEGER NOT NULL             -- 更新时间戳
);

-- 执行日志表
CREATE TABLE IF NOT EXISTS trigger_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reminder_id TEXT NOT NULL,              -- 关联的提醒ID
  triggered_at INTEGER NOT NULL,          -- 触发时间戳
  status TEXT NOT NULL,                   -- success | failed
  response TEXT,                          -- 推送服务返回的响应
  error TEXT,                             -- 错误信息
  duration_ms INTEGER,                    -- 执行耗时
  
  FOREIGN KEY (reminder_id) REFERENCES reminders(id) ON DELETE CASCADE
);

-- 索引：用于快速查找待执行任务
CREATE INDEX IF NOT EXISTS idx_reminders_next_trigger ON reminders(next_trigger_at, status);
-- 索引：用于按用户查询
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_key);
-- 索引：用于按状态查询
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
-- 索引：日志关联查询
CREATE INDEX IF NOT EXISTS idx_logs_reminder ON trigger_logs(reminder_id);
-- 索引：日志时间查询
CREATE INDEX IF NOT EXISTS idx_logs_triggered_at ON trigger_logs(triggered_at);
