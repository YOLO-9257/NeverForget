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
    push_config: PushConfig;
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
    reminder_id: string;
    triggered_at: number;
    status: 'success' | 'failed';
    response: string | null;
    error: string | null;
    duration_ms: number | null;
}

// API 统一响应格式
export interface ApiResponse<T = any> {
    code: number;
    message: string;
    data?: T;
}

// 推送服务响应
export interface PushResponse {
    errcode: number;
    errmsg: string;
}
