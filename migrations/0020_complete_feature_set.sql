-- NeverForget - Phase 1~4 完整数据库迁移脚本
-- 版本: 2.0.0
-- 包含：智能分类、AI摘要、多渠道通知、监控追踪、工作流

-- ==========================================
-- Phase 1.1: 智能邮件分类系统
-- ==========================================

-- 邮件分类规则表
CREATE TABLE email_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3498db',
  icon TEXT DEFAULT '📁', -- emoji图标
  conditions TEXT NOT NULL, -- JSON: {sender_contains, subject_contains, body_contains, priority_threshold}
  auto_archive INTEGER DEFAULT 0,
  auto_mark_as_read INTEGER DEFAULT 0,
  notify_on_match INTEGER DEFAULT 1,
  match_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 为账户添加默认分类
CREATE TABLE email_category_defaults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  conditions_template TEXT, -- JSON模板
  sort_order INTEGER DEFAULT 0
);

-- 插入默认分类
INSERT INTO email_category_defaults (name, color, icon, conditions_template, sort_order) VALUES
('工作', '#e74c3c', '💼', '{"priority_threshold": 0.7}', 1),
('个人', '#3498db', '👤', '{"sender_contains": ["@gmail.com", "@qq.com"]}', 2),
('账单', '#f39c12', '💰', '{"subject_contains": ["账单", "发票", "收据", "payment", "invoice"]}', 3),
('通知', '#9b59b6', '📢', '{"subject_contains": ["通知", "公告", "提醒"]}', 4),
('广告', '#95a5a6', '📮', '{"priority_threshold": 0.2}', 5);

-- ==========================================
-- Phase 1.2: AI摘要与智能提取
-- ==========================================

-- 扩展 fetched_emails 表
ALTER TABLE fetched_emails ADD COLUMN ai_summary TEXT;
ALTER TABLE fetched_emails ADD COLUMN ai_category TEXT; -- 工作/个人/广告/账单/通知
ALTER TABLE fetched_emails ADD COLUMN ai_entities TEXT; -- JSON: [{type, value, position}]
ALTER TABLE fetched_emails ADD COLUMN ai_action_items TEXT; -- JSON: ["action1", "action2"]
ALTER TABLE fetched_emails ADD COLUMN ai_sentiment TEXT DEFAULT 'normal'; -- urgent | normal | low
ALTER TABLE fetched_emails ADD COLUMN ai_importance_score REAL DEFAULT 0.5; -- 0-1
ALTER TABLE fetched_emails ADD COLUMN ai_processed_at INTEGER; -- AI处理时间
ALTER TABLE fetched_emails ADD COLUMN category_id INTEGER REFERENCES email_categories(id);

-- AI处理队列（用于异步处理）
CREATE TABLE ai_processing_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id TEXT NOT NULL UNIQUE,
  priority INTEGER DEFAULT 0, -- 0=普通, 1=高优先级
  status TEXT DEFAULT 'pending', -- pending | processing | completed | failed
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  processed_at INTEGER
);

CREATE INDEX idx_ai_queue_status ON ai_processing_queue(status, priority, created_at);

-- ==========================================
-- Phase 1.3: 多渠道通知系统
-- ==========================================

-- 通知渠道配置表
CREATE TABLE notification_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_key TEXT NOT NULL,
  type TEXT NOT NULL, -- wechat_work | dingtalk | feishu | webhook | email | pushover
  name TEXT NOT NULL,
  config TEXT NOT NULL, -- JSON: 各渠道特定的配置
  enabled INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 0, -- 优先级，数字越小优先级越高
  daily_quota INTEGER DEFAULT 100, -- 每日限额
  daily_used INTEGER DEFAULT 0,
  last_used_at INTEGER,
  health_status TEXT DEFAULT 'unknown', -- healthy | unhealthy | unknown
  health_checked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 渠道健康检查记录
CREATE TABLE channel_health_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  status TEXT NOT NULL, -- healthy | unhealthy
  response_time_ms INTEGER,
  error_message TEXT,
  checked_at INTEGER NOT NULL
);

-- 修改 reminders 表支持多渠道
ALTER TABLE reminders ADD COLUMN channel_ids TEXT; -- JSON数组: [1, 2, 3]
ALTER TABLE reminders ADD COLUMN channel_strategy TEXT DEFAULT 'priority'; -- priority | broadcast | round_robin

-- 插入示例渠道配置说明
-- wechat_work: {"corp_id": "xxx", "corp_secret": "xxx", "agent_id": "xxx"}
-- dingtalk: {"webhook_url": "xxx", "secret": "xxx"}
-- feishu: {"webhook_url": "xxx", "secret": "xxx"}
-- webhook: {"url": "xxx", "secret": "xxx", "method": "POST", "headers": {}}
-- email: {"smtp_host": "xxx", "smtp_port": 587, "username": "xxx", "password": "xxx", "to_address": "xxx"}

-- ==========================================
-- Phase 2.1: 同步状态监控
-- ==========================================

-- 同步统计表（按天聚合）
CREATE TABLE sync_statistics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD
  total_attempts INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  timeout_count INTEGER DEFAULT 0,
  emails_synced INTEGER DEFAULT 0,
  emails_forwarded INTEGER DEFAULT 0,
  avg_duration_ms INTEGER,
  max_duration_ms INTEGER,
  min_duration_ms INTEGER,
  error_types TEXT, -- JSON: {"AUTH_FAILED": 2, "NETWORK_ERROR": 1}
  UNIQUE(account_id, date)
);

-- 详细同步日志表
CREATE TABLE sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  status TEXT, -- success | failed | timeout | cancelled
  stage TEXT, -- connecting | authenticating | fetching | processing | completed
  emails_found INTEGER DEFAULT 0,
  emails_new INTEGER DEFAULT 0,
  emails_forwarded INTEGER DEFAULT 0,
  emails_filtered INTEGER DEFAULT 0,
  error_code TEXT, -- 错误代码便于分类统计
  error_message TEXT,
  error_stack TEXT,
  duration_ms INTEGER,
  server_response_time_ms INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX idx_sync_logs_account ON sync_logs(account_id, started_at DESC);
CREATE INDEX idx_sync_logs_status ON sync_logs(status, error_code);

-- 实时监控快照表（用于快速查询当前状态）
CREATE TABLE sync_status_snapshot (
  account_id TEXT PRIMARY KEY,
  current_status TEXT DEFAULT 'idle', -- idle | syncing | error
  last_sync_started_at INTEGER,
  last_sync_ended_at INTEGER,
  last_sync_status TEXT,
  last_sync_error TEXT,
  consecutive_failures INTEGER DEFAULT 0,
  next_scheduled_sync_at INTEGER,
  updated_at INTEGER NOT NULL
);

-- ==========================================
-- Phase 2.2: 推送追踪与失败重试
-- ==========================================

-- 推送追踪表
CREATE TABLE push_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL, -- 关联的邮件ID或提醒ID
  message_type TEXT NOT NULL, -- email | reminder
  channel_id INTEGER NOT NULL,
  channel_type TEXT NOT NULL,
  
  -- 推送内容摘要（用于追踪）
  title TEXT,
  content_preview TEXT,
  
  -- 状态追踪
  status TEXT NOT NULL DEFAULT 'pending', -- pending | sending | sent | delivered | read | failed | cancelled
  
  -- 时间戳
  created_at INTEGER NOT NULL,
  scheduled_at INTEGER, -- 计划发送时间（用于延迟发送）
  sent_at INTEGER,
  delivered_at INTEGER,
  read_at INTEGER,
  failed_at INTEGER,
  
  -- 错误与重试
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at INTEGER,
  retry_delays TEXT, -- JSON: [60, 300, 900] 单位秒
  
  -- 响应数据
  provider_message_id TEXT, -- 渠道返回的消息ID
  provider_response TEXT, -- 渠道返回的原始响应
  
  -- 用户交互
  clicked_at INTEGER,
  clicked_url TEXT,
  
  FOREIGN KEY (channel_id) REFERENCES notification_channels(id)
);

CREATE INDEX idx_push_tracking_message ON push_tracking(message_id, message_type);
CREATE INDEX idx_push_tracking_status ON push_tracking(status, next_retry_at);
CREATE INDEX idx_push_tracking_channel ON push_tracking(channel_id, created_at DESC);

-- 推送统计表（按渠道按天聚合）
CREATE TABLE push_statistics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD
  total_attempts INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  clicked_count INTEGER DEFAULT 0,
  avg_latency_ms INTEGER, -- 平均发送延迟
  UNIQUE(channel_id, date)
);

-- 死信队列（多次失败后需要人工处理）
CREATE TABLE dead_letter_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_push_id INTEGER NOT NULL,
  message_id TEXT NOT NULL,
  channel_id INTEGER NOT NULL,
  final_error TEXT NOT NULL,
  failed_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolution TEXT, -- manual_retry | discarded | redirected
  redirected_channel_id INTEGER,
  notes TEXT
);

-- ==========================================
-- Phase 3.2: 邮件处理工作流
-- ==========================================

-- 工作流规则表
CREATE TABLE workflow_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  
  -- 触发条件（与分类规则类似但更丰富）
  conditions TEXT NOT NULL, -- JSON
  condition_logic TEXT DEFAULT 'AND', -- AND | OR
  
  -- 执行动作
  actions TEXT NOT NULL, -- JSON数组
  
  -- 执行配置
  enabled INTEGER DEFAULT 1,
  execution_count INTEGER DEFAULT 0,
  last_executed_at INTEGER,
  last_execution_result TEXT, -- success | failed
  last_error TEXT,
  
  -- 限制配置
  max_executions_per_day INTEGER DEFAULT 100,
  cooldown_minutes INTEGER DEFAULT 0, -- 同一触发源冷却时间
  
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 工作流执行日志
CREATE TABLE workflow_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL,
  email_id TEXT NOT NULL,
  triggered_at INTEGER NOT NULL,
  completed_at INTEGER,
  status TEXT, -- success | failed | partial
  actions_executed TEXT, -- JSON: [{action_type, status, result, error}]
  error_message TEXT,
  duration_ms INTEGER
);

CREATE INDEX idx_workflow_executions_rule ON workflow_executions(rule_id, triggered_at DESC);

-- ==========================================
-- Phase 4.1: Webhook与集成
-- ==========================================

-- Webhook订阅表
CREATE TABLE webhook_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_key TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT, -- 用于签名验证
  
  -- 订阅的事件类型
  events TEXT NOT NULL, -- JSON数组: ["email.received", "email.synced", "push.sent"]
  
  -- 过滤条件
  filters TEXT, -- JSON: {account_ids: [], min_importance: 0.5}
  
  -- 状态
  enabled INTEGER DEFAULT 1,
  health_status TEXT DEFAULT 'unknown',
  last_triggered_at INTEGER,
  last_error_at INTEGER,
  last_error_message TEXT,
  
  -- 统计
  total_triggers INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Webhook投递日志
CREATE TABLE webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL, -- JSON
  payload_hash TEXT, -- 用于去重
  
  -- 投递状态
  status TEXT NOT NULL, -- pending | delivering | delivered | failed
  
  -- 请求详情
  request_method TEXT DEFAULT 'POST',
  request_headers TEXT, -- JSON
  request_body TEXT,
  response_status INTEGER,
  response_body TEXT,
  response_time_ms INTEGER,
  
  -- 重试
  retry_count INTEGER DEFAULT 0,
  next_retry_at INTEGER,
  
  -- 时间戳
  created_at INTEGER NOT NULL,
  delivered_at INTEGER,
  failed_at INTEGER
);

CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status, next_retry_at);
CREATE INDEX idx_webhook_deliveries_subscription ON webhook_deliveries(subscription_id, created_at DESC);

-- ==========================================
-- 通用索引优化
-- ==========================================

-- 账户查询优化
CREATE INDEX idx_email_accounts_status ON email_accounts(sync_status, enabled);
DROP INDEX IF EXISTS idx_fetched_emails_account;
CREATE INDEX idx_fetched_emails_account ON fetched_emails(account_id, received_at DESC);
CREATE INDEX idx_fetched_emails_category ON fetched_emails(category_id, received_at DESC);
CREATE INDEX idx_fetched_emails_ai ON fetched_emails(ai_category, ai_importance_score DESC);

-- 统计查询优化
CREATE INDEX idx_sync_statistics_date ON sync_statistics(date, account_id);
CREATE INDEX idx_push_statistics_date ON push_statistics(date, channel_id);

-- 监控查询优化
CREATE INDEX idx_channel_health ON channel_health_logs(channel_id, checked_at DESC);
CREATE INDEX idx_workflow_rules_account ON workflow_rules(account_id, enabled);

