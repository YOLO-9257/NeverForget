-- NeverForget - 邮箱模块重构与任务化集成
-- 更新时间: 2026-02-04
-- 功能：创建 email_accounts 表，扩展 reminders 表支持多类型任务

-- ============================================
-- Part 1: 创建 email_accounts 表
-- ============================================

CREATE TABLE IF NOT EXISTS email_accounts (
  id TEXT PRIMARY KEY,                    -- 账户ID，格式：eml_xxx
  user_key TEXT NOT NULL,                 -- 用户标识
  name TEXT NOT NULL,                     -- 账户名称（如：工作邮箱、个人邮箱）
  
  -- IMAP 服务器配置
  imap_host TEXT NOT NULL,                -- IMAP 服务器地址
  imap_port INTEGER DEFAULT 993,          -- IMAP 端口
  imap_user TEXT NOT NULL,                -- IMAP 用户名（邮箱地址）
  imap_password TEXT NOT NULL,            -- IMAP 密码（AES-GCM 加密存储）
  imap_tls INTEGER DEFAULT 1,             -- 是否使用 TLS (1=Yes, 0=No)
  
  -- 推送配置（复用 reminders 的结构）
  push_config TEXT,                       -- JSON: {appid, secret, userid, template_id, ...}
  push_url TEXT,                          -- 自定义推送服务地址 (go-wxpush)
  template_name TEXT,                     -- go-wxpush 模板名称
  
  -- 过滤规则 (JSON)
  filter_rules TEXT,                      -- JSON: {allow_senders, block_senders, match_keywords, ...}
  
  -- 状态与统计
  enabled INTEGER DEFAULT 1,              -- 是否启用
  last_sync_at INTEGER,                   -- 最后同步时间戳
  sync_status TEXT DEFAULT 'idle',        -- idle | syncing | error
  sync_error TEXT,                        -- 最后一次同步错误信息
  total_synced INTEGER DEFAULT 0,         -- 已同步邮件总数
  total_forwarded INTEGER DEFAULT 0,      -- 已转发邮件总数
  
  -- 元数据
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ============================================
-- Part 2: 扩展 reminders 表
-- ============================================

-- 添加任务类型字段
ALTER TABLE reminders ADD COLUMN type TEXT DEFAULT 'reminder';
-- 添加关联ID字段（用于 email_sync 类型关联 email_accounts.id）
ALTER TABLE reminders ADD COLUMN related_id TEXT;

-- ============================================
-- Part 3: 索引
-- ============================================

-- 按用户查询邮箱账户
CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON email_accounts(user_key);
-- 按启用状态查询
CREATE INDEX IF NOT EXISTS idx_email_accounts_enabled ON email_accounts(enabled);
-- 按任务类型查询 reminders
CREATE INDEX IF NOT EXISTS idx_reminders_type ON reminders(type);
-- 按关联ID查询 reminders
CREATE INDEX IF NOT EXISTS idx_reminders_related ON reminders(related_id);

-- ============================================
-- Part 4: 数据迁移（从旧表 user_email_settings）
-- ============================================

-- 将启用了 IMAP 的旧配置迁移到新表
-- 注意：此迁移只在 user_email_settings 存在且有 enable_imap 字段时执行
-- SQLite 不支持条件迁移，需要在应用层处理

-- 迁移说明（应用层实现）：
-- 1. 读取 user_email_settings 中 enable_imap=1 的记录
-- 2. 为每条记录创建 email_accounts 条目
-- 3. 创建对应的 reminders 条目（type='email_sync', schedule_cron='*/10 * * * *'）
-- 4. 迁移完成后可选择性删除旧表
