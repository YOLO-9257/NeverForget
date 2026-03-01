import type { Stats } from '../../types';

/** 图表颜色常量 */
export const CHART_COLORS = {
    primary: 'hsl(245, 80%, 60%)',
    accent: 'hsl(175, 80%, 45%)',
    success: 'hsl(150, 70%, 45%)',
    warning: 'hsl(40, 95%, 55%)',
    error: 'hsl(0, 75%, 55%)',
};

/** Tooltip 通用样式 */
export const TOOLTIP_STYLE = {
    background: 'hsl(230, 22%, 12%)',
    border: '1px solid hsl(230, 20%, 22%)',
    borderRadius: '8px',
};

/** 坐标轴颜色 */
export const AXIS_COLOR = 'hsl(230, 15%, 45%)';
export const GRID_COLOR = 'hsl(230, 20%, 22%)';

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

/** 格式化下次触发时间 */
export function formatNextTrigger(timestamp: number | null): string {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 0) return '已过期';
    if (diffHours < 1) return '即将执行';
    if (diffHours < 24) return `${diffHours} 小时后`;

    return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** 构建执行趋势数据 */
export function buildTrendData(stats: Stats | null) {
    return stats?.daily_stats?.map(item => ({
        day: item.day.slice(5),
        success: item.success,
        failed: item.failed,
    })) || [];
}

/** 构建任务状态分布数据 */
export function buildStatusData(stats: Stats | null) {
    if (!stats) return [];
    return [
        { name: '运行中', value: stats.active_reminders, color: CHART_COLORS.success },
        { name: '已暂停', value: stats.paused_reminders, color: CHART_COLORS.warning },
        { name: '已完成', value: stats.completed_reminders, color: CHART_COLORS.primary },
    ];
}
