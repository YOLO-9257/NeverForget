import React from 'react';
import type { Reminder } from '../../types';
import { getScheduleTypeLabel, formatNextTrigger } from './utils';
import styles from './Dashboard.module.css';

interface RecentTasksProps {
    tasks: Reminder[];
}

/** 状态徽章 */
function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { label: string; className: string }> = {
        active: { label: '运行中', className: 'badge-active' },
        paused: { label: '已暂停', className: 'badge-paused' },
        completed: { label: '已完成', className: 'badge-completed' },
        failed: { label: '已失败', className: 'badge-failed' },
    };
    const { label, className } = config[status] || { label: status, className: '' };
    return <span className={`badge ${className}`}>● {label}</span>;
}

/**
 * 最近任务列表组件
 */
export const RecentTasks: React.FC<RecentTasksProps> = ({ tasks }) => {
    return (
        <div className="card">
            <div className="card-header">
                <div>
                    <h3 className="card-title">最近任务</h3>
                    <p className="card-subtitle">最近创建的定时提醒任务</p>
                </div>
                <a href="/tasks" className="btn btn-secondary btn-sm">
                    查看全部 →
                </a>
            </div>
            <div className="table-container">
                <table className="table">
                    <thead>
                        <tr>
                            <th>任务标题</th>
                            <th>类型</th>
                            <th>状态</th>
                            <th>下次执行</th>
                            <th>已执行</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tasks.length === 0 ? (
                            <tr>
                                <td colSpan={5} className={styles.emptyRow}>
                                    暂无任务数据
                                </td>
                            </tr>
                        ) : (
                            tasks.map((task) => (
                                <tr key={task.id}>
                                    <td className={styles.taskTitle}>{task.title}</td>
                                    <td>{getScheduleTypeLabel(task.schedule_type)}</td>
                                    <td><StatusBadge status={task.status} /></td>
                                    <td>{formatNextTrigger(task.next_trigger_at)}</td>
                                    <td>{task.trigger_count} 次</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
