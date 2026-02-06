-- NeverForget - 邮件转发设置表
-- 更新时间: 2026-02-03
-- 功能：存储用户的邮件监听与 WxPush 转发配置

-- 用户邮件转发设置表
CREATE TABLE IF NOT EXISTS user_email_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_key TEXT NOT NULL UNIQUE,           -- 关联用户标识
  
  -- 邮件接收配置
  enabled INTEGER DEFAULT 0,               -- 是否启用邮件转发 (0/1)
  email_address TEXT,                      -- 分配的接收邮件地址 (xxx@domain.com)
  
  -- WxPush 转发配置
  wxpush_token TEXT,                       -- WxPush 推送 Token
  wxpush_url TEXT,                         -- WxPush 服务地址 (可选，留空使用默认)
  
  -- 转发规则配置 (JSON)
  -- 格式: { "filters": [...], "template": "..." }
  forward_rules TEXT,
  
  -- 统计信息
  total_forwarded INTEGER DEFAULT 0,       -- 已转发邮件总数
  last_forwarded_at INTEGER,               -- 最后转发时间戳
  
  -- 元数据
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 邮件转发日志表
CREATE TABLE IF NOT EXISTS email_forward_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_key TEXT NOT NULL,                  -- 关联用户标识
  
  -- 邮件信息
  from_address TEXT NOT NULL,              -- 发件人地址
  subject TEXT,                            -- 邮件主题
  received_at INTEGER NOT NULL,            -- 接收时间戳
  
  -- 转发结果
  status TEXT NOT NULL,                    -- success | failed
  wxpush_response TEXT,                    -- WxPush 返回的响应
  error TEXT,                              -- 错误信息（如果有）
  
  -- 元数据
  processed_at INTEGER NOT NULL            -- 处理时间戳
);

-- 索引：用于快速查找用户邮件设置
CREATE INDEX IF NOT EXISTS idx_email_settings_user ON user_email_settings(user_key);
-- 索引：用于快速查找启用的邮件转发
CREATE INDEX IF NOT EXISTS idx_email_settings_enabled ON user_email_settings(enabled);
-- 索引：邮件日志按用户查询
CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_forward_logs(user_key);
-- 索引：邮件日志按时间查询
CREATE INDEX IF NOT EXISTS idx_email_logs_time ON email_forward_logs(received_at);
