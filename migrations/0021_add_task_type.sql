-- 添加任务类型支持（增量更新）
-- 用于区分定时任务和邮件任务

-- 1. 为 trigger_logs 表添加 type 字段（如果还不存在）
-- 注意：reminders 表的 type 字段已存在，跳过
ALTER TABLE trigger_logs ADD COLUMN type TEXT;

-- 2. 创建索引支持按类型查询（如果不存在）
-- reminders 表索引
CREATE INDEX IF NOT EXISTS idx_reminders_type ON reminders(type);
CREATE INDEX IF NOT EXISTS idx_reminders_user_type ON reminders(user_key, type);
CREATE INDEX IF NOT EXISTS idx_reminders_status_type ON reminders(status, type);

-- trigger_logs 表索引
CREATE INDEX IF NOT EXISTS idx_logs_type ON trigger_logs(type);
CREATE INDEX IF NOT EXISTS idx_logs_reminder_type ON trigger_logs(reminder_id, type);
CREATE INDEX IF NOT EXISTS idx_logs_time_type ON trigger_logs(triggered_at, type);

-- 3. 更新现有数据的类型（根据 related_id 判断邮件任务）
-- 更新邮件相关任务的类型
UPDATE reminders 
SET type = 'email_sync' 
WHERE (type IS NULL OR type = 'reminder')
AND related_id IS NOT NULL
AND related_id IN (
    SELECT id FROM email_accounts
);

-- 更新邮件相关日志的类型
UPDATE trigger_logs 
SET type = 'email_sync' 
WHERE type IS NULL
AND reminder_id IN (
    SELECT id FROM reminders WHERE type = 'email_sync'
);

-- 为剩余的日志设置默认类型
UPDATE trigger_logs 
SET type = 'reminder' 
WHERE type IS NULL;
