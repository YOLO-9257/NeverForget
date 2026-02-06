-- NeverForget - IMAP 客户端配置表
-- 更新时间: 2026-02-03
-- 功能：为 user_email_settings 添加 IMAP 相关字段

ALTER TABLE user_email_settings ADD COLUMN enable_imap INTEGER DEFAULT 0;       -- 是否启用主动拉取
ALTER TABLE user_email_settings ADD COLUMN imap_host TEXT;                      -- IMAP 服务器地址
ALTER TABLE user_email_settings ADD COLUMN imap_port INTEGER DEFAULT 993;       -- IMAP 端口
ALTER TABLE user_email_settings ADD COLUMN imap_user TEXT;                      -- IMAP 用户名
ALTER TABLE user_email_settings ADD COLUMN imap_password TEXT;                  -- IMAP 密码 (加密存储)
ALTER TABLE user_email_settings ADD COLUMN imap_tls INTEGER DEFAULT 1;          -- 是否使用 TLS (1=Yes, 0=No)
ALTER TABLE user_email_settings ADD COLUMN last_sync_at INTEGER;                -- 最后同步时间
ALTER TABLE user_email_settings ADD COLUMN sync_status TEXT;                    -- 同步状态 (idle, syncing, error)
ALTER TABLE user_email_settings ADD COLUMN sync_error TEXT;                     -- 最后一次同步错误信息
