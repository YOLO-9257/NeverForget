-- 添加重试间隔字段，用于强提醒模式下的自定义重试间隔
-- 默认值 30 分钟

ALTER TABLE reminders ADD COLUMN retry_interval INTEGER DEFAULT 30;
