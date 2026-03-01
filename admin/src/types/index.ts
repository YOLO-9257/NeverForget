// 提醒任务类型定义
export interface Reminder {
    id: string;
    user_key: string;
    title: string;
    content: string;
    type?: 'reminder' | 'email_sync';
    related_id?: string;
    schedule_type: 'once' | 'daily' | 'weekly' | 'monthly' | 'cron';
    schedule_time: string | null;
    schedule_cron: string | null;
    schedule_date: string | null;
    schedule_weekday: number | null;
    schedule_day: number | null;
    timezone: string;
    push_config: {
        appid: string;
        secret: string;
        userid: string;
        template_id: string;
    };
    push_url: string | null;
    template_name: string | null;  // go-wxpush 模板名称
    status: 'active' | 'paused' | 'completed' | 'failed';
    next_trigger_at: number | null;
    last_trigger_at: number | null;
    trigger_count: number;
    ack_required?: boolean;
    ack_status?: 'none' | 'pending' | 'completed';
    last_ack_at?: number | null;
    retry_interval?: number;  // 强提醒重试间隔（分钟）
    created_at: number;
    updated_at: number;
}

// 执行日志类型
export interface TriggerLog {
    id: number;
    reminder_id?: string | null;
    triggered_at: number;
    status: 'success' | 'failed';
    response: string | null;
    error: string | null;
    duration_ms: number | null;
    type?: 'reminder' | 'email_sync';
    source?: 'scheduler' | 'ai_butler';
    action?: string | null;
    detail_reason?: string | null;  // 三层日志写入原因标记
}

// 统计数据类型
export interface Stats {
    total_reminders: number;
    active_reminders: number;
    paused_reminders: number;
    completed_reminders: number;
    total_triggers: number;
    success_triggers: number;
    failed_triggers: number;
    success_rate: number;
    today_triggers: number;
    week_triggers: number;
    daily_stats: {
        day: string;
        success: number;
        failed: number;
    }[];
}

export interface EmailTrendStats {
    day: string;
    forwarded: number;
    synced: number;
}

// API 响应类型
export interface ApiResponse<T> {
    code: number;
    message: string;
    data?: T;
}

// 任务模板类型
export interface ReminderTemplate {
    id: string;
    name: string;
    title: string;
    content: string;
    schedule_type: Reminder['schedule_type'];
    schedule_time: string;
    icon: string;
    color: string;
    ack_required?: boolean;
}

// 创建提醒的请求参数
export interface CreateReminderRequest {
    title: string;
    content: string;
    schedule_type: Reminder['schedule_type'];
    schedule_time?: string;
    schedule_cron?: string;
    schedule_date?: string;
    schedule_weekday?: number;
    schedule_day?: number;
    timezone?: string;
    push_config: {
        appid: string;
        secret: string;
        userid: string;
        template_id: string;
    };
    push_url?: string;
    template_name?: string | null;  // go-wxpush 模板名称（null 表示使用默认）
    ack_required?: boolean;
    retry_interval?: number;  // 强提醒重试间隔（分钟）
}

export interface FetchedEmail {
    id: number;
    account_id: string;
    uid: number;
    from_address: string;
    subject: string;
    content: string; // May be omitted in list view
    received_at: number;
    fetched_at: number;
    is_pushed: number;
    push_status: 'pending' | 'success' | 'failed' | 'skipped' | 'filtered';
    push_log: string | null;
    ai_summary?: string | null;
    ai_entities?: string | null;
    ai_action_items?: string | null;
    ai_sentiment?: 'urgent' | 'normal' | 'low' | null;
    ai_importance_score?: number | null;
    ai_processed_at?: number | null;
}

// 通知渠道类型
export type NotificationChannelType = 'wechat_work' | 'dingtalk' | 'feishu' | 'webhook' | 'email' | 'pushover';

export interface NotificationChannel {
    id: number;
    type: NotificationChannelType;
    name: string;
    enabled: number;
    priority: number;
    daily_quota: number;
    daily_used: number;
    health_status: 'healthy' | 'unhealthy' | 'unknown';
    health_checked_at?: number;
    created_at: number;
    updated_at: number;
}

export interface PushTrackingRecord {
    id: number;
    message_id: string;
    message_type: 'email' | 'reminder';
    channel_id: number;
    channel_type: NotificationChannelType;
    channel_name?: string;
    channel_type_name?: NotificationChannelType;
    title?: string;
    content_preview?: string;
    status: 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled';
    created_at: number;
    sent_at?: number;
    failed_at?: number;
    error_message?: string;
    retry_count: number;
    max_retries: number;
    next_retry_at?: number;
    provider_message_id?: string;
    provider_response?: string;
}
