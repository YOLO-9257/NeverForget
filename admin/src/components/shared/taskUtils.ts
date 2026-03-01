import type { Reminder } from '../../types';

/**
 * 任务相关共享工具函数
 * 被 TaskList, TaskDetail, Dashboard 等多个组件复用
 */

/** 状态配置映射 */
export const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
    active: { label: '运行中', className: 'badge-active' },
    paused: { label: '已暂停', className: 'badge-paused' },
    completed: { label: '已完成', className: 'badge-completed' },
    failed: { label: '已失败', className: 'badge-failed' },
};

/** 调度类型标签 */
export function getScheduleTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        once: '一次性',
        daily: '每天',
        weekly: '每周',
        monthly: '每月',
        cron: 'Cron',
    };
    return labels[type] || type;
}

/** 格式化执行时间 */
export function formatScheduleTime(task: Reminder): string {
    switch (task.schedule_type) {
        case 'once':
            return task.schedule_date
                ? `${task.schedule_date} ${task.schedule_time || ''}`
                : task.schedule_time || '-';
        case 'daily':
            return task.schedule_time || '-';
        case 'weekly': {
            const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            return `${weekdays[task.schedule_weekday || 0]} ${task.schedule_time || ''}`;
        }
        case 'monthly':
            return `每月 ${task.schedule_day || 1} 日 ${task.schedule_time || ''}`;
        case 'cron':
            return task.schedule_cron || '-';
        default:
            return '-';
    }
}
