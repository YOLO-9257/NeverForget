/**
 * Settings 类型定义
 * @author zhangws
 */

// AiProfile 类型从 utils/ai 重新导出

// 选项卡类型
export type SettingsTab = 'api' | 'push' | 'ai' | 'about';

// API 配置
export interface ApiConfig {
    url: string;
    key: string;
}

// 默认推送配置
export interface DefaultPushConfig {
    appid: string;
    secret: string;
    template_id: string;
    push_service_url: string;
}

// 通知设置
export interface NotificationSettings {
    enableSound: boolean;
    enableDesktop: boolean;
}

// 连接状态类型
export type ConnectionStatus = 'idle' | 'success' | 'error';

// 管理弹窗状态
export interface ManageModalState {
    open: boolean;
    category: string;
    title: string;
}

// 重新导出 AI 类型
export type { AiProfile, AiProvider } from '../../utils/ai';
