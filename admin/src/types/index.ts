// 提醒任务类型定义
export interface Reminder {
    id: string;
    user_key: string;
    title: string;
    content: string;
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
    reminder_id: string;
    triggered_at: number;
    status: 'success' | 'failed';
    response: string | null;
    error: string | null;
    duration_ms: number | null;
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
