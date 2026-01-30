-- 添加自定义 HTML 模板字段
-- 创建时间: 2026-01-25
-- 功能：支持用户自定义消息详情页的 HTML 内容，替代默认模板

-- 为 reminders 表添加 custom_html 字段（存储 Base64 编码的 HTML 内容）
ALTER TABLE reminders ADD COLUMN custom_html TEXT;
