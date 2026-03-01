
import { STATUS_CONFIG } from './taskUtils';

/**
 * 通用状态徽章组件
 * 被 TaskList, TaskDetail, Dashboard 等复用
 */
export function StatusBadge({ status }: { status: string }) {
    const { label, className } = STATUS_CONFIG[status] || { label: status, className: '' };
    return <span className={`badge ${className}`}>● {label}</span>;
}
