/**
 * 消息模板类型定义
 */
export interface MessageTemplate {
    id: string;
    name: string;
    description: string;
    content: string;
    variables: string[];
    category: 'reminder' | 'notification' | 'greeting' | 'custom';
    createdAt: number;
    updatedAt: number;
}

export interface TemplateEditForm {
    name: string;
    description: string;
    content: string;
    category: MessageTemplate['category'];
}

/** 分类标签映射 */
export const CATEGORY_LABELS: Record<string, string> = {
    reminder: '提醒',
    notification: '通知',
    greeting: '祝福',
    custom: '自定义',
};

/** 分类颜色映射 */
export const CATEGORY_COLORS: Record<string, string> = {
    reminder: 'hsl(200, 80%, 50%)',
    notification: 'hsl(260, 70%, 55%)',
    greeting: 'hsl(340, 80%, 55%)',
    custom: 'hsl(150, 70%, 45%)',
};

/** 变量默认值映射 */
export const DEFAULT_VARIABLE_VALUES: Record<string, string> = {
    title: '测试标题',
    content: '这是一条测试消息内容',
    time: new Date().toLocaleString('zh-CN'),
    name: '用户',
    hours: '4',
    location: '会议室A',
};
