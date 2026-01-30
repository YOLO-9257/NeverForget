-- 移除自定义 HTML 模板字段（重构）
-- 创建时间: 2026-01-28
-- 说明：将模板定制职责移交到 go-wxpush 服务，cf-reminder 仅通过 template_name 引用

-- 注意：SQLite 不支持 DROP COLUMN
-- 实际上现有数据可以保留，只是代码不再使用该字段
-- 此迁移仅作为文档记录重构历史

-- 如果需要完全清理数据，可以执行以下操作：
-- UPDATE reminders SET custom_html = NULL WHERE custom_html IS NOT NULL;
