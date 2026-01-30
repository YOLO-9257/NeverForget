import type { Reminder, TriggerLog, Stats, ApiResponse, CreateReminderRequest } from '../types';

// 动态获取 API 基础 URL（优先读取 localStorage，其次读环境变量）
function getApiBaseUrl(): string {
    return localStorage.getItem('api_url') || import.meta.env.VITE_API_URL || '';
}

// 动态获取 API Key
function getApiKey(): string {
    return localStorage.getItem('api_key') || import.meta.env.VITE_API_KEY || '';
}

// 通用请求方法
async function request<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    const apiBaseUrl = getApiBaseUrl();
    const apiKey = getApiKey();

    const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            ...options.headers,
        },
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || '请求失败');
    }

    return data;
}

// 提醒相关 API
export const reminderApi = {
    // 获取提醒列表
    async list(params?: { status?: string; limit?: number; offset?: number }) {
        const queryParams = new URLSearchParams();
        if (params?.status) queryParams.set('status', params.status);
        if (params?.limit) queryParams.set('limit', params.limit.toString());
        if (params?.offset) queryParams.set('offset', params.offset.toString());

        const query = queryParams.toString();
        return request<{ total: number; items: Reminder[] }>(
            `/api/reminders${query ? `?${query}` : ''}`
        );
    },

    // 获取单个提醒详情
    async get(id: string) {
        return request<Reminder>(`/api/reminders/${id}`);
    },

    // 创建提醒
    async create(data: CreateReminderRequest) {
        return request<{ id: string; created_at: string }>('/api/reminders', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    // 更新提醒
    async update(id: string, data: Partial<Reminder>) {
        return request<Reminder>(`/api/reminders/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    // 删除提醒
    async delete(id: string) {
        return request<void>(`/api/reminders/${id}`, {
            method: 'DELETE',
        });
    },

    // 获取执行日志
    async getLogs(id: string, limit = 20) {
        return request<{ total: number; items: TriggerLog[] }>(
            `/api/reminders/${id}/logs?limit=${limit}`
        );
    },

    // 手动触发提醒 (立即发送)
    async trigger(id: string) {
        return request<{ id: string; status: string }>(`/api/reminders/${id}/trigger`, {
            method: 'POST',
        });
    },
};

// 统计相关 API
export const statsApi = {
    // 获取统计信息
    async get() {
        return request<Stats>('/api/stats');
    },
};

// 日志相关 API
export const logsApi = {
    // 获取所有执行日志
    async getAll(params?: { limit?: number; offset?: number; status?: string }) {
        const queryParams = new URLSearchParams();
        if (params?.limit) queryParams.set('limit', params.limit.toString());
        if (params?.offset) queryParams.set('offset', params.offset.toString());
        if (params?.status) queryParams.set('status', params.status);

        const query = queryParams.toString();
        return request<{ total: number; items: TriggerLog[] }>(
            `/api/logs${query ? `?${query}` : ''}`
        );
    },
};

// 测试 API 连接
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

