-- 添加任务类型支持
-- 用于区分定时任务和邮件任务

-- 1. 为 reminders 表添加 type 字段
ALTER TABLE reminders ADD COLUMN type TEXT DEFAULT 'reminder';

-- 创建索引支持按类型查询
CREATE INDEX idx_reminders_type ON reminders(type);

-- 2. 为 trigger_logs 表添加 type 字段
ALTER TABLE trigger_logs ADD COLUMN type TEXT;

-- 创建索引支持按类型查询日志
CREATE INDEX idx_logs_type ON trigger_logs(type);

-- 3. 创建复合索引优化过滤查询
CREATE INDEX idx_reminders_user_type ON reminders(user_key, type);
CREATE INDEX idx_reminders_status_type ON reminders(status, type);
CREATE INDEX idx_logs_reminder_type ON trigger_logs(reminder_id, type);
CREATE INDEX idx_logs_time_type ON trigger_logs(triggered_at, type);

-- 更新现有数据的类型（根据相关ID判断）
-- 更新邮件相关任务的类型
UPDATE reminders 
SET type = 'email_sync' 
WHERE id IN (
    SELECT related_id FROM email_accounts 
    WHERE related_id IS NOT NULL
);

-- 更新邮件相关日志的类型
UPDATE trigger_logs 
SET type = 'email' 
WHERE reminder_id IN (
    SELECT id FROM reminders WHERE type = 'email_sync'
);

-- 为剩余的日志设置默认类型
UPDATE trigger_logs 
SET type = 'reminder' 
WHERE type IS NULL;
