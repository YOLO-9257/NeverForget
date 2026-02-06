-- 为邮件转发设置添加推送配置选择字段
-- 更新时间: 2026-02-03
-- 功能：允许邮件转发使用与定时任务相同的推送配置

-- 添加推送配置 JSON 字段（存储完整的 push_config）
ALTER TABLE user_email_settings ADD COLUMN push_config TEXT;
-- 添加模板名称字段（可选，用于覆盖模板）
ALTER TABLE user_email_settings ADD COLUMN template_name TEXT;
