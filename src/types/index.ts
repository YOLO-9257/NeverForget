/**
 * 分布式低成本定时提醒系统 - 类型定义
 */

// Cloudflare Workers 环境变量类型
export interface Env {
    DB: D1Database;
    API_KEYS: string;           // 逗号分隔的 API Key 列表
    ENCRYPTION_KEY?: string;    // 加密密钥（可选）
    WORKER_BASE_URL: string;    // Worker 自身的基础 URL（用于生成详情页链接）
    DEFAULT_PUSH_URL: string;   // 默认推送服务地址（旧版兼容）
    PUSH_SERVICE_URL: string;   // 外部推送服务地址 (go-wxpush)
    TIMEZONE: string;           // 默认时区
    EMAIL_DOMAIN?: string;      // 邮件接收域名（可选）

    // AI 配置 (可选)
    AI_API_KEY?: string;        // 全局 AI API Key (Gemini/OpenAI)
    AI_PROVIDER?: 'gemini' | 'openai'; // 默认 gemini
    AI_MODEL?: string;          // 模型名称
}

// 调度类型
export type ScheduleType = 'once' | 'daily' | 'weekly' | 'monthly' | 'cron';

// 任务状态
export type ReminderStatus = 'active' | 'paused' | 'completed' | 'failed';

// 推送配置
export interface PushConfig {
    appid: string;
    secret: string;
    userid: string;
    template_id: string;
    base_url?: string;
    template_name?: string;         // go-wxpush 模板名称
    callback_url?: string;          // 回调地址
}

// 提醒任务（数据库模型）
export interface Reminder {
    id: string;
    user_key: string;
    title: string;
    content: string;

    // 调度配置
    schedule_type: ScheduleType;
    schedule_time: string | null;
    schedule_cron: string | null;
    schedule_date: string | null;
    schedule_weekday: number | null;
    schedule_day: number | null;
    timezone: string;

    // 推送配置
    push_config: string;        // JSON 字符串
    push_url: string | null;
    template_name: string | null; // go-wxpush 模板名称

    // 状态
    status: ReminderStatus;
    next_trigger_at: number | null;
    last_trigger_at: number | null;
    trigger_count: number;

    // 确认相关
    ack_required?: number; // 0 or 1
    ack_status?: 'none' | 'pending' | 'completed';
    last_ack_at?: number | null;
    retry_interval?: number; // 强提醒重试间隔（分钟），默认 30

    // 任务类型（新增）
    type?: 'reminder' | 'email_sync';
    related_id?: string | null;       // 关联ID（如 email_account.id）

    // 元数据
    created_at: number;
    updated_at: number;
}

// 创建提醒请求
export interface CreateReminderRequest {
    title: string;
    content: string;
    schedule_type: ScheduleType;
    schedule_time?: string;       // HH:mm 格式
    schedule_cron?: string;       // Cron 表达式
    schedule_date?: string;       // YYYY-MM-DD 格式（一次性任务）
    schedule_weekday?: number;    // 0-6，0=周日
    schedule_day?: number;        // 1-31
    timezone?: string;
    type?: ReminderType;
    push_config?: PushConfig;
    push_url?: string;
    template_name?: string;       // go-wxpush 模板名称
    ack_required?: boolean;       // 是否需要确认
    retry_interval?: number;      // 强提醒重试间隔（分钟）
}

// 更新提醒请求
export interface UpdateReminderRequest {
    title?: string;
    content?: string;
    schedule_type?: ScheduleType;
    schedule_time?: string;
    schedule_cron?: string;
    schedule_date?: string;
    schedule_weekday?: number;
    schedule_day?: number;
    timezone?: string;
    status?: 'active' | 'paused';
    type?: ReminderType;
    push_config?: PushConfig;
    push_url?: string;
    template_name?: string;       // go-wxpush 模板名称
    ack_required?: boolean;       // 是否需要确认
    retry_interval?: number;      // 强提醒重试间隔（分钟）
}

// 提醒列表响应项
export interface ReminderListItem {
    id: string;
    title: string;
    content: string;
    schedule_type: ScheduleType;
    schedule_time: string | null;
    schedule_cron: string | null;
    next_trigger: string | null;  // ISO 格式时间字符串
    status: ReminderStatus;
    trigger_count: number;
    created_at: string;           // ISO 格式时间字符串
}

// 执行日志
export interface TriggerLog {
    id: number;
    reminder_id: string | null;
    triggered_at: number;
    status: 'success' | 'failed';
    response: string | null;
    error: string | null;
    duration_ms: number | null;
    source?: 'scheduler' | 'ai_butler';
    action?: string | null;
    detail_reason?: string | null;  // 三层日志写入原因
}

// ==========================================
// 三层日志模型类型
// ==========================================

// 任务执行快照（每任务 1 行）
export interface TaskExecSnapshot {
    reminder_id: string;
    user_key: string;
    last_status: 'success' | 'failed' | null;
    last_error: string | null;
    last_duration_ms: number;
    last_exec_at: number | null;
    last_success_at: number | null;
    total_count: number;
    success_count: number;
    failed_count: number;
    consecutive_failures: number;
    is_escalated: number;
    escalated_until: number | null;
    updated_at: number;
}

// 执行聚合统计（按小时）
export interface TaskExecRollup {
    id: number;
    reminder_id: string;
    user_key: string;
    task_type: 'reminder' | 'email_sync';
    bucket_hour: string;
    total_count: number;
    success_count: number;
    failed_count: number;
    slow_count: number;
    avg_duration_ms: number;
    max_duration_ms: number;
    min_duration_ms: number;
    total_duration_ms: number;
    error_types: string | null;
    updated_at: number;
}

// 执行明细（条件写入）
export interface TaskExecDetail {
    id: number;
    reminder_id: string;
    user_key: string;
    task_type: 'reminder' | 'email_sync';
    triggered_at: number;
    status: 'success' | 'failed';
    response: string | null;
    error: string | null;
    duration_ms: number;
    detail_reason: 'once' | 'failed' | 'slow' | 'escalated' | 'sampled' | 'heartbeat' | 'manual';
    created_at: number;
}

// API 统一响应格式
export interface ApiResponse<T = any> {
    code: number;
    message: string;
    data?: T;
}

// 转发规则定义
export interface ForwardRules {
    block_senders?: string[];    // 黑名单发件人
    allow_senders?: string[];    // 白名单发件人 (如果存在，则仅允许这些)
    block_keywords?: string[];   // 标题或正文屏蔽关键词
    match_keywords?: string[];   // 标题或正文必需关键词
    last_uid?: number;           // 用于 IMAP 的最后同步 UID (临时存储在 JSON 中)
}

// 统一的邮件数据结构
export interface EmailData {
    from: string;
    subject: string;
    content: string;
    received_at: number;
    uid?: number; // IMAP 专用
    messageId?: string; // Message-ID
}

// 推送服务响应
export interface PushResponse {
    errcode: number;
    errmsg: string;
}

// 邮件转发设置（数据库模型）
export interface EmailSettings {
    id: number;
    user_key: string;
    enabled: number;                // 0 | 1
    email_address: string | null;
    wxpush_token: string | null;
    wxpush_url: string | null;
    forward_rules: string | null;

    // 推送配置（复用定时任务的配置）
    push_config: string | null;     // JSON 格式的推送配置
    template_name: string | null;   // 可选的模板名称

    // IMAP 配置
    enable_imap: number;            // 0 | 1
    imap_host: string | null;
    imap_port: number | null;
    imap_user: string | null;
    imap_password: string | null;   // 加密存储
    imap_tls: number;               // 0 | 1
    last_sync_at: number | null;
    sync_status: string | null;
    sync_error: string | null;

    total_forwarded: number;
    last_forwarded_at: number | null;
    created_at: number;
    updated_at: number;
}

// 邮件转发日志（数据库模型）
export interface EmailForwardLog {
    id: number;
    user_key: string;
    from_address: string;
    subject: string | null;
    received_at: number;
    status: 'success' | 'failed';
    wxpush_response: string | null;
    error: string | null;
    processed_at: number;
}

// 邮箱账户（新数据库模型）
export interface AiFilterConfig {
    // 广告邮件在中严重度时，达到该重要度阈值将保留而不过滤（0~1）
    ads_keep_importance_threshold?: number;
}

export interface EmailAccount {
    id: string;
    user_key: string;
    name: string;

    // IMAP 配置
    imap_host: string;
    imap_port: number;
    imap_user: string;
    imap_password: string;          // AES-GCM 加密存储
    imap_tls: number;               // 0 | 1

    // 推送配置
    push_config: string | null;     // JSON 格式
    push_url: string | null;
    template_name: string | null;

    // 过滤规则
    filter_rules: string | null;    // JSON: ForwardRules

    // 状态
    enabled: number;                // 0 | 1
    last_sync_at: number | null;
    sync_status: 'idle' | 'syncing' | 'error';
    sync_error: string | null;
    total_synced: number;
    total_forwarded: number;
    cached_email_count?: number;
    failed_email_count?: number;
    pending_email_count?: number;

    // 元数据
    created_at: number;
    updated_at: number;

    // 新增设置
    auto_push?: number;             // 0 | 1, 默认 1
    enable_ai_spam_filter?: number; // 0 | 1, 默认 0
    ai_profile_id?: string | null;  // 绑定的 AI 模型配置 ID
    ai_filter_config?: string | null; // JSON: AiFilterConfig
}

// 缓存的邮件内容（数据库模型）
export interface FetchedEmail {
    id: number;
    account_id: string;
    uid: number;
    from_address: string;
    subject: string;
    content: string;
    received_at: number;
    fetched_at: number;
    is_pushed: number;              // 0 | 1
    push_status: 'pending' | 'success' | 'failed' | 'skipped' | 'filtered';
    push_log: string | null;
    ai_summary?: string | null;
    ai_entities?: string | null;
    ai_action_items?: string | null;
    ai_sentiment?: 'urgent' | 'normal' | 'low' | null;
    ai_importance_score?: number | null;
    ai_processed_at?: number | null;
}

// 任务类型
export type ReminderType = 'reminder' | 'email_sync';

// AI 上下文记忆（数据库模型）
export interface AiContext {
    user_key: string;
    summary: string;     // long-term memory
    recent_history: string; // JSON string of Message[]
    last_updated: number;
}

export interface AiMessage {
    role: 'user' | 'model' | 'system';
    content: string;
    timestamp?: number;
}

export interface AiChatRequest {
    message: string;
    provider?: 'gemini' | 'openai';
    apiKey?: string;
    baseUrl?: string;
    model?: string;
}

export interface AiChatResponse {
    reply: string;
    context_updated: boolean;
}

// ------------------------------------
// New Security Types (Blacklist & Rules)
// ------------------------------------

export interface EmailBlacklist {
    id: number;
    account_id: string | null; // UUID string
    email_address: string;
    created_at: number;
}

export interface EmailFilterRule {
    id: number;
    account_id: string | null;
    name: string;
    conditions: EmailRuleCondition[]; // Stored as JSON string in DB, parsed in app
    action: EmailRuleAction;          // Stored as JSON string in DB, parsed in app
    is_enabled: number;               // 0 | 1
    priority: number;
    created_at: number;
}

export interface EmailRuleCondition {
    field: 'from' | 'subject' | 'content';
    operator: 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'not_contains';
    value: string;
}

export interface EmailRuleAction {
    type: 'block' | 'mark_spam' | 'skip_push' | 'ai_review';
    value?: string;
}

// ==========================================
// Phase 1.1: 智能邮件分类系统类型
// ==========================================

export interface EmailCategory {
    id: number;
    account_id: string;
    name: string;
    color: string;
    icon: string;
    conditions: CategoryConditions;
    auto_archive: number;
    auto_mark_as_read: number;
    notify_on_match: number;
    match_count: number;
    created_at: number;
    updated_at: number;
}

export interface CategoryConditions {
    sender_contains?: string[];
    subject_contains?: string[];
    body_contains?: string[];
    priority_threshold?: number;
}

export interface EmailCategoryDefault {
    id: number;
    name: string;
    color: string;
    icon: string;
    conditions_template?: CategoryConditions;
    sort_order: number;
}

// ==========================================
// Phase 1.2: AI摘要与智能提取类型
// ==========================================

export interface AIExtractedEntity {
    type: 'time' | 'location' | 'person' | 'deadline' | 'organization' | 'email' | 'phone';
    value: string;
    position?: { start: number; end: number };
}

export interface FetchedEmailExtended {
    id: number;
    account_id: string;
    uid: number;
    from_address: string;
    subject: string;
    content: string;
    received_at: number;
    fetched_at: number;
    is_pushed: number;
    push_status: 'pending' | 'success' | 'failed' | 'skipped' | 'filtered';
    push_log: string | null;
    // AI扩展字段
    ai_summary?: string;
    ai_category?: 'work' | 'personal' | 'bill' | 'notification' | 'ads' | 'other';
    ai_entities?: string; // JSON: AIExtractedEntity[]
    ai_action_items?: string; // JSON: string[]
    ai_sentiment?: 'urgent' | 'normal' | 'low';
    ai_importance_score?: number;
    ai_processed_at?: number;
    category_id?: number;
}

export interface AIProcessingQueue {
    id: number;
    email_id: string;
    priority: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    retry_count: number;
    error_message?: string;
    created_at: number;
    processed_at?: number;
}

export interface EmailSummaryResult {
    summary: string;
    entities: AIExtractedEntity[];
    action_items: string[];
    sentiment: 'urgent' | 'normal' | 'low';
    importance_score: number;
}

// ==========================================
// Phase 1.3: 多渠道通知系统类型
// ==========================================

export type NotificationChannelType = 'wechat_work' | 'dingtalk' | 'feishu' | 'webhook' | 'email' | 'pushover';

export interface NotificationChannel {
    id: number;
    user_key: string;
    type: NotificationChannelType;
    name: string;
    config: ChannelConfig;
    enabled: number;
    priority: number;
    daily_quota: number;
    daily_used: number;
    last_used_at?: number;
    health_status: 'healthy' | 'unhealthy' | 'unknown';
    health_checked_at?: number;
    created_at: number;
    updated_at: number;
}

export interface ChannelConfig {
    // wechat_work
    corp_id?: string;
    corp_secret?: string;
    agent_id?: string;
    // dingtalk/feishu/webhook
    webhook_url?: string;
    secret?: string;
    at_all?: boolean;
    at_mobiles?: string[];
    // webhook
    url?: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    headers?: Record<string, string>;
    // email
    smtp_host?: string;
    smtp_port?: number;
    username?: string;
    password?: string;
    to_address?: string;
}

export interface ChannelHealthLog {
    id: number;
    channel_id: number;
    status: 'healthy' | 'unhealthy';
    response_time_ms?: number;
    error_message?: string;
    checked_at: number;
}

export interface PushTracking {
    id: number;
    message_id: string;
    message_type: 'email' | 'reminder';
    channel_id: number;
    channel_type: NotificationChannelType;
    title?: string;
    content_preview?: string;
    status: 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled';
    created_at: number;
    scheduled_at?: number;
    sent_at?: number;
    delivered_at?: number;
    read_at?: number;
    failed_at?: number;
    error_code?: string;
    error_message?: string;
    retry_count: number;
    max_retries: number;
    next_retry_at?: number;
    retry_delays?: string; // JSON: number[]
    provider_message_id?: string;
    provider_response?: string;
    clicked_at?: number;
    clicked_url?: string;
}

// ==========================================
// Phase 2.1: 同步监控类型
// ==========================================

export interface SyncStatistics {
    id: number;
    account_id: string;
    date: string;
    total_attempts: number;
    success_count: number;
    fail_count: number;
    timeout_count: number;
    emails_synced: number;
    emails_forwarded: number;
    avg_duration_ms?: number;
    max_duration_ms?: number;
    min_duration_ms?: number;
    error_types?: string; // JSON: Record<string, number>
}

export interface SyncLog {
    id: number;
    account_id: string;
    started_at: number;
    ended_at?: number;
    status: 'success' | 'failed' | 'timeout' | 'cancelled';
    stage?: 'connecting' | 'authenticating' | 'fetching' | 'processing' | 'completed';
    emails_found: number;
    emails_new: number;
    emails_forwarded: number;
    emails_filtered: number;
    error_code?: string;
    error_message?: string;
    error_stack?: string;
    duration_ms?: number;
    server_response_time_ms?: number;
    created_at: number;
}

export interface SyncStatusSnapshot {
    account_id: string;
    current_status: 'idle' | 'syncing' | 'error';
    last_sync_started_at?: number;
    last_sync_ended_at?: number;
    last_sync_status?: string;
    last_sync_error?: string;
    consecutive_failures: number;
    next_scheduled_sync_at?: number;
    updated_at: number;
}

// ==========================================
// Phase 3.2: 邮件工作流类型
// ==========================================

export interface WorkflowRule {
    id: number;
    account_id: string;
    name: string;
    description?: string;
    conditions: WorkflowCondition[];
    condition_logic: 'AND' | 'OR';
    actions: WorkflowAction[];
    enabled: number;
    execution_count: number;
    last_executed_at?: number;
    last_execution_result?: 'success' | 'failed';
    last_error?: string;
    max_executions_per_day: number;
    cooldown_minutes: number;
    created_at: number;
    updated_at: number;
}

export interface WorkflowCondition {
    field: 'from' | 'subject' | 'content' | 'category' | 'importance' | 'age_hours';
    operator: 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'not_contains' | 'gt' | 'lt' | 'gte' | 'lte';
    value: string | number;
}

export interface WorkflowAction {
    type: 'auto_reply' | 'forward_channel' | 'mark_as' | 'move_to' | 'create_reminder' | 'webhook' | 'archive' | 'delete';
    config?: Record<string, any>;
}

export interface WorkflowExecution {
    id: number;
    rule_id: number;
    email_id: string;
    triggered_at: number;
    completed_at?: number;
    status: 'success' | 'failed' | 'partial';
    actions_executed: string; // JSON: {action_type, status, result, error}[]
    error_message?: string;
    duration_ms?: number;
}

// ==========================================
// Phase 4.1: Webhook集成类型
// ==========================================

export interface WebhookSubscription {
    id: number;
    user_key: string;
    name: string;
    url: string;
    secret?: string;
    events: WebhookEventType[];
    filters?: WebhookFilters;
    enabled: number;
    health_status: 'healthy' | 'unhealthy' | 'unknown';
    last_triggered_at?: number;
    last_error_at?: number;
    last_error_message?: string;
    total_triggers: number;
    success_count: number;
    fail_count: number;
    created_at: number;
    updated_at: number;
}

export type WebhookEventType = 
    | 'email.received' 
    | 'email.synced' 
    | 'email.processed' 
    | 'push.sent' 
    | 'push.failed' 
    | 'push.delivered' 
    | 'push.read'
    | 'sync.error'
    | 'workflow.triggered';

export interface WebhookFilters {
    account_ids?: string[];
    min_importance?: number;
    categories?: string[];
}

export interface WebhookDelivery {
    id: number;
    subscription_id: number;
    event_type: WebhookEventType;
    payload: string; // JSON
    payload_hash?: string;
    status: 'pending' | 'delivering' | 'delivered' | 'failed';
    request_method: string;
    request_headers?: string; // JSON
    request_body?: string;
    response_status?: number;
    response_body?: string;
    response_time_ms?: number;
    retry_count: number;
    next_retry_at?: number;
    created_at: number;
    delivered_at?: number;
    failed_at?: number;
}
