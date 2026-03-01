import type {
    Reminder,
    TriggerLog,
    Stats,
    ApiResponse,
    CreateReminderRequest,
    NotificationChannel,
    PushTrackingRecord,
} from '../types';

export const AUTH_EXPIRED_EVENT = 'neverforget:auth-expired';

// 动态获取 API 基础 URL
export function getApiBaseUrl(): string {
    return localStorage.getItem('api_url') || import.meta.env.VITE_API_URL || '';
}

// 动态获取 Token
function getAuthToken(): string {
    return localStorage.getItem('auth_token') || '';
}

// 动态获取 Legacy API Key (兼容旧版)
function getApiKey(): string {
    return localStorage.getItem('api_key') || import.meta.env.VITE_API_KEY || '';
}

function emitAuthExpired() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
}

async function parseResponseBody<T>(response: Response): Promise<ApiResponse<T> | null> {
    const text = await response.text();
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text) as ApiResponse<T>;
    } catch {
        return {
            code: response.ok ? 0 : response.status,
            message: text,
        };
    }
}

// 通用请求方法
async function request<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    const apiBaseUrl = getApiBaseUrl();
    const token = getAuthToken();
    const apiKey = getApiKey();

    // 优先使用 Token，其次 API Key
    const authHeader = token ? `Bearer ${token}` : (apiKey ? `Bearer ${apiKey}` : '');

    const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(authHeader ? { 'Authorization': authHeader } : {}),
            ...options.headers,
        },
    });

    const data = await parseResponseBody<T>(response);

    if (!response.ok) {
        // 401 未授权处理
        if (response.status === 401) {
            // 清除过期 Token
            localStorage.removeItem('auth_token');
            emitAuthExpired();
        }
        throw new Error(data?.message || `请求失败 (${response.status})`);
    }

    return data || { code: 0, message: 'ok' };
}

// 认证相关 API
export const authApi = {
    // 登录
    async login(username: string, password: string): Promise<{ token: string; user: { id: number; username: string } }> {
        // 特殊处理：如果是登录接口，可能需要显式传入 baseUrl，或者假设已经设置了 localStorage
        return request<{ token: string; user: { id: number; username: string } }>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        }).then(res => res.data!);
    },

    // 系统初始化
    async setup(username: string, password: string): Promise<{ message: string; username: string }> {
        return request<{ message: string; username: string }>('/api/auth/setup', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        }).then(res => res.data!);
    },

    // 检查初始化状态
    async checkInitStatus(baseUrl?: string): Promise<{ initialized: boolean }> {
        // 允许传入 baseUrl (登录页还没保存 URL 时使用)
        const apiBaseUrl = baseUrl || getApiBaseUrl();
        if (!apiBaseUrl) throw new Error('未配置 API 地址');

        const response = await fetch(`${apiBaseUrl}/api/auth/init-status`);
        if (!response.ok) throw new Error('连接失败');
        const data = await response.json() as ApiResponse<{ initialized: boolean }>;
        return data.data || { initialized: false };
    }
};

// 提醒相关 API
export const reminderApi = {
    async list(params?: {
        status?: string;
        type?: string;
        keyword?: string;
        sortBy?: 'created_at' | 'updated_at' | 'next_trigger_at' | 'trigger_count' | 'title' | 'status';
        sortOrder?: 'asc' | 'desc';
        limit?: number;
        offset?: number;
    }) {
        const queryParams = new URLSearchParams();
        if (params?.status) queryParams.set('status', params.status);
        if (params?.type) queryParams.set('type', params.type);
        if (params?.keyword) queryParams.set('keyword', params.keyword);
        if (params?.sortBy) queryParams.set('sort_by', params.sortBy);
        if (params?.sortOrder) queryParams.set('sort_order', params.sortOrder);
        if (params?.limit) queryParams.set('limit', params.limit.toString());
        if (params?.offset) queryParams.set('offset', params.offset.toString());
        return request<{ total: number; items: Reminder[] }>(`/api/reminders?${queryParams}`);
    },
    async get(id: string) { return request<Reminder>(`/api/reminders/${id}`); },
    async create(data: CreateReminderRequest) {
        return request<{ id: string; created_at: string }>('/api/reminders', { method: 'POST', body: JSON.stringify(data) });
    },
    async update(id: string, data: Partial<Reminder>) {
        return request<Reminder>(`/api/reminders/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    async delete(id: string) {
        return request<void>(`/api/reminders/${id}`, { method: 'DELETE' });
    },
    async getLogs(id: string, limit = 20) {
        return request<{ total: number; items: TriggerLog[] }>(`/api/reminders/${id}/logs?limit=${limit}`);
    },
    async trigger(id: string) {
        return request<{ id: string; status: string }>(`/api/reminders/${id}/trigger`, { method: 'POST' });
    },
};

// 统计 & 日志
export const statsApi = {
    async get() { return request<Stats>('/api/stats'); },
    async getEmailTrend() { return request<{ day: string; forwarded: number; synced: number }[]>('/api/stats/email-trend'); }
};
export const logsApi = {
    async getAll(params?: { limit?: number; offset?: number; status?: string; type?: string }) {
        const queryParams = new URLSearchParams();
        if (params?.limit) queryParams.set('limit', params.limit.toString());
        if (params?.offset) queryParams.set('offset', params.offset.toString());
        if (params?.status) queryParams.set('status', params.status);
        if (params?.type) queryParams.set('type', params.type);
        return request<{ total: number; items: TriggerLog[] }>(`/api/logs?${queryParams}`);
    },
};

// 通知可观测性 API
export const notificationApi = {
    async listChannels() {
        return request<{ items: NotificationChannel[] }>('/api/notification/channels');
    },
    async listPushTracking(params?: {
        status?: string;
        channelId?: number;
        messageType?: 'email' | 'reminder';
        keyword?: string;
        limit?: number;
        offset?: number;
    }) {
        const queryParams = new URLSearchParams();
        if (params?.status) queryParams.set('status', params.status);
        if (params?.channelId) queryParams.set('channel_id', String(params.channelId));
        if (params?.messageType) queryParams.set('message_type', params.messageType);
        if (params?.keyword) queryParams.set('keyword', params.keyword);
        if (params?.limit) queryParams.set('limit', String(params.limit));
        if (params?.offset) queryParams.set('offset', String(params.offset));
        return request<{ total: number; items: PushTrackingRecord[]; status_summary?: Record<string, number> }>(`/api/push/tracking?${queryParams}`);
    },
    async retryPush(id: number) {
        return request<{ message: string }>(`/api/push/tracking/${id}/retry`, {
            method: 'POST',
        });
    },
};

// 测试 API 连接 (修复 build error 并支持 API Key 测试)
export async function testConnection(apiUrl: string, apiKey: string): Promise<boolean> {
    try {
        const response = await fetch(`${apiUrl}/api/stats`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });
        return response.ok;
    } catch {
        return false;
    }
}

// 邮件转发设置响应类型
export interface EmailSettingsResponse {
    enabled: boolean;
    email_address: string | null;
    wxpush_token: string | null;
    wxpush_url: string | null;
    forward_rules: string | null;

    // 推送配置（复用定时任务的配置）
    push_config: {
        appid: string;
        secret: string;
        userid: string;
        template_id: string;
    } | null;
    template_name: string | null;

    // IMAP Settings
    enable_imap: boolean;
    imap_host: string | null;
    imap_port: number | null;
    imap_user: string | null;
    imap_tls: boolean;
    last_sync_at: string | null;
    sync_status: string | null;
    sync_error: string | null;

    total_forwarded: number;
    last_forwarded_at: string | null;
}

// 邮件转发日志类型
export interface EmailForwardLog {
    id: number;
    from_address: string;
    subject: string | null;
    received_at: string;
    status: 'success' | 'failed';
    error: string | null;
    processed_at: string;
}

// 邮件转发设置 API
export const emailSettingsApi = {
    // 获取邮件设置
    async get(): Promise<ApiResponse<EmailSettingsResponse>> {
        return request<EmailSettingsResponse>('/api/email-settings');
    },

    // 更新邮件设置
    async update(data: {
        enabled?: boolean;
        wxpush_token?: string;
        wxpush_url?: string;
        forward_rules?: string;
        enable_imap?: boolean;
        imap_host?: string;
        imap_port?: number;
        imap_user?: string;
        imap_password?: string;
        imap_tls?: boolean;
    }): Promise<ApiResponse<EmailSettingsResponse>> {
        return request<EmailSettingsResponse>('/api/email-settings', {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    // 获取转发日志
    async getLogs(params?: { limit?: number; offset?: number }): Promise<ApiResponse<{ total: number; items: EmailForwardLog[] }>> {
        const queryParams = new URLSearchParams();
        if (params?.limit) queryParams.set('limit', params.limit.toString());
        if (params?.offset) queryParams.set('offset', params.offset.toString());
        return request<{ total: number; items: EmailForwardLog[] }>(`/api/email-settings/logs?${queryParams}`);
    },

    // 测试邮件转发
    async test(): Promise<ApiResponse<{ message: string; email_address: string }>> {
        return request<{ message: string; email_address: string }>('/api/email-settings/test', {
            method: 'POST',
        });
    },
};

// AI 智能管家 API
export interface AiChatRequest {
    message: string;
    provider?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
}

export interface AiChatResponse {
    reply: string;
    context_updated: boolean;
}

export interface AiHistoryResponse {
    summary: string;
    history: { role: string; content: string; timestamp?: number }[];
}

export const aiChatApi = {
    async send(data: AiChatRequest) {
        return request<AiChatResponse>('/api/ai/chat', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    async getHistory() {
        return request<AiHistoryResponse>('/api/ai/chat', {
            method: 'GET'
        });
    }
};

// 通用配置项 API
export interface SavedConfig {
    id: number;
    category: string;
    name: string;
    value: string;
    created_at: number;
}

export const configApi = {
    async list(category: string) {
        return request<SavedConfig[]>(`/api/configs?category=${category}`);
    },
    async create(data: { category: string; name: string; value: string }) {
        return request<SavedConfig>('/api/configs', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    async delete(id: number) {
        return request<void>(`/api/configs/${id}`, {
            method: 'DELETE',
        });
    },
};


