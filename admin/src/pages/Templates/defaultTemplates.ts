import type { MessageTemplate } from './types';

/**
 * 预设模板数据
 */
export const defaultTemplates: MessageTemplate[] = [
    {
        id: 'default-reminder',
        name: '通用提醒',
        description: '简洁的提醒消息模板',
        content: '{{title}}\n\n{{content}}\n\n⏰ 发送时间：{{time}}',
        variables: ['title', 'content', 'time'],
        category: 'reminder',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'drink-water',
        name: '喝水提醒',
        description: '带有趣味图标的喝水提醒',
        content: '💧 {{title}} 💧\n\n{{content}}\n\n保持健康，从每一杯水开始！\n\n━━━━━━━━━━━━━━━\n⏰ {{time}}',
        variables: ['title', 'content', 'time'],
        category: 'reminder',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'work-break',
        name: '工作休息',
        description: '提醒用户休息的模板',
        content: '☕ {{title}}\n\n{{content}}\n\n🧘 适当休息，工作更高效！\n\n今日已工作：{{hours}}小时',
        variables: ['title', 'content', 'hours'],
        category: 'reminder',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'meeting-alert',
        name: '会议提醒',
        description: '正式的会议通知模板',
        content: '📅 会议提醒\n\n━━━━━━━━━━━━━━━\n📌 会议主题：{{title}}\n⏰ 开始时间：{{time}}\n📍 会议地点：{{location}}\n━━━━━━━━━━━━━━━\n\n{{content}}\n\n请提前5分钟到场！',
        variables: ['title', 'time', 'location', 'content'],
        category: 'notification',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'birthday',
        name: '生日祝福',
        description: '生日祝福消息模板',
        content: '🎂 {{title}} 🎉\n\n亲爱的 {{name}}：\n\n{{content}}\n\n🎁🎈🎊 祝您生日快乐！🎊🎈🎁',
        variables: ['title', 'name', 'content'],
        category: 'greeting',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
];
