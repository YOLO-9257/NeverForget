-- 添加用户保存的配置表 (用于存储常用的 UserID, TemplateID 等)
CREATE TABLE IF NOT EXISTS saved_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_key TEXT NOT NULL,
    category TEXT NOT NULL, -- 'wxpush_userid', 'wxpush_templateid' 等
    name TEXT NOT NULL, -- 别名，如 "我", "老婆", "早安模板"
    value TEXT NOT NULL, -- 实际值，如 UID_xxx, 4396
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saved_configs_user_category ON saved_configs(user_key, category);
