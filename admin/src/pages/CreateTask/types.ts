/**
 * CreateTask 类型定义
 * @author zhangws
 */

// go-wxpush 模板类型
export interface WxPushTemplate {
    id: string;
    name: string;
    description?: string;
}

// 用户自定义消息模板类型
export interface UserMessageTemplate {
    id: string;
    name: string;
    description: string;
    content: string;
    variables: string[];
    category: 'reminder' | 'notification' | 'greeting' | 'custom';
    createdAt: number;
    updatedAt: number;
}

// 预设任务模板
export interface TaskTemplate {
    id: string;
    name: string;
    icon: string;
    color: string;
    title: string;
    content: string;
    schedule_type: 'once' | 'daily' | 'weekly' | 'monthly' | 'cron';
    schedule_time: string;
}

// 调度类型
export type ScheduleType = 'once' | 'daily' | 'weekly' | 'monthly' | 'cron';

// 表单数据类型
export interface CreateTaskFormData {
    // 基本信息
    title: string;
    content: string;

    // 调度配置
    schedule_type: ScheduleType;
    schedule_time: string;
    schedule_date: string;
    schedule_weekday: number;
    schedule_day: number;
    schedule_cron: string;
    timezone: string;

    // 推送配置
    appid: string;
    secret: string;
    userid: string;
    template_id: string;
    push_url: string;
    template_name: string;

    // 确认配置
    ack_required: boolean;
    retry_interval: number;
}

// 默认表单数据
export const defaultFormData: CreateTaskFormData = {
    title: '',
    content: '',
    schedule_type: 'daily',
    schedule_time: '09:00',
    schedule_date: '',
    schedule_weekday: 1,
    schedule_day: 1,
    schedule_cron: '',
    timezone: 'Asia/Shanghai',
    appid: '',
    secret: '',
    userid: '',
    template_id: '',
    push_url: '',
    template_name: '',
    ack_required: false,
    retry_interval: 30,
};

// 预设模板列表
export const presetTemplates: TaskTemplate[] = [
    {
        id: 'drink_water',
        name: '喝水提醒',
        icon: '💧',
        color: 'hsl(200, 80%, 50%)',
        title: '喝水提醒',
        content: '该喝水啦！保持健康，多喝水~ 💧',
        schedule_type: 'daily',
        schedule_time: '09:00',
    },
    {
        id: 'take_break',
        name: '休息提醒',
        icon: '☕',
        color: 'hsl(30, 80%, 50%)',
        title: '休息提醒',
        content: '工作辛苦了，起来活动一下吧！🏃',
        schedule_type: 'daily',
        schedule_time: '11:00',
    },
    {
        id: 'meeting',
        name: '会议提醒',
        icon: '📅',
        color: 'hsl(260, 70%, 55%)',
        title: '会议即将开始',
        content: '您有一个会议即将开始，请提前做好准备。',
        schedule_type: 'once',
        schedule_time: '10:00',
    },
    {
        id: 'weekly_report',
        name: '周报提醒',
        icon: '📝',
        color: 'hsl(150, 70%, 45%)',
        title: '周报提醒',
        content: '本周工作接近尾声，别忘了写周报哦！📝',
        schedule_type: 'weekly',
        schedule_time: '17:00',
    },
    {
        id: 'birthday',
        name: '生日提醒',
        icon: '🎂',
        color: 'hsl(340, 80%, 55%)',
        title: '生日提醒',
        content: '今天是特别的日子，记得送上祝福！🎉',
        schedule_type: 'monthly',
        schedule_time: '08:00',
    },
    {
        id: 'custom',
        name: '自定义任务',
        icon: '✨',
        color: 'hsl(245, 80%, 60%)',
        title: '',
        content: '',
        schedule_type: 'daily',
        schedule_time: '09:00',
    },
];
