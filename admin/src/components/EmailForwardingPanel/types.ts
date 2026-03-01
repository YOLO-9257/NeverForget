/**
 * EmailForwardingPanel 类型定义
 * @author zhangws
 */

import type { EmailSettingsResponse, EmailForwardLog, SavedConfig } from '../../api';

// 状态类型
export type StatusType = 'idle' | 'success' | 'error';

// 推送配置
export interface PushConfig {
    appid: string;
    secret: string;
    userid: string;
    template_id: string;
}

// 重新导出 API 类型
export type { EmailSettingsResponse, EmailForwardLog, SavedConfig };
