import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { reminderApi } from '../api';
import type { Reminder } from '../types';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export function TaskList() {
    const [tasks, setTasks] = useState<Reminder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const pageSize = 10;

    useEffect(() => {
        loadTasks();
    }, [statusFilter, typeFilter, page]);

    const loadTasks = async () => {
        try {
            setLoading(true);
            setError(null);

            const res = await reminderApi.list({
                status: statusFilter === 'all' ? undefined : statusFilter,
                type: typeFilter === 'all' ? undefined : typeFilter,
                limit: pageSize,
                offset: page * pageSize,
            });

            if (res.data) {
                setTasks(res.data.items);
                setTotal(res.data.total);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setLoading(false);
        }
    };

    // 删除任务
    const handleDelete = async (task: Reminder) => {
        if (task.type === 'email_sync') {
            alert('这是一个邮箱同步任务，请在"邮箱中心"管理或删除对应的邮箱账户。');
            return;
        }
        if (!confirm(`确定要删除任务 "${task.title}" 吗？此操作不可恢复。`)) {
            return;
        }

        try {
            await reminderApi.delete(task.id);
            loadTasks();
        } catch (err) {
            alert(err instanceof Error ? err.message : '删除失败');
        }
    };

    // 暂停/恢复任务
    const handleToggleStatus = async (task: Reminder) => {
        const newStatus = task.status === 'active' ? 'paused' : 'active';
        try {
            await reminderApi.update(task.id, { status: newStatus });
            loadTasks();
        } catch (err) {
            alert(err instanceof Error ? err.message : '操作失败');
        }
    };

    // 立即触发任务
    const handleTrigger = async (task: Reminder) => {
        if (!confirm(`确定要立即发送任务 "${task.title}" 吗？此操作不会影响下次定时执行。`)) {
            return;
        }

        try {
            await reminderApi.trigger(task.id);
            alert('发送成功！请检查微信消息。');
        } catch (err) {
            alert(err instanceof Error ? err.message : '发送失败');
        }
    };

    return (
        <div>
            {/* 页面标题 */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">任务列表</h1>
                    <p className="page-subtitle">管理所有定时提醒任务</p>
                </div>
                <Link to="/create" className="btn btn-primary">
                    ➕ 创建任务
                </Link>
            </div>

            {/* 筛选选项卡 */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
                {/* 状态筛选 */}
                <div className="tabs" style={{ flex: 1, minWidth: '280px' }}>
                    {[
                        { value: 'all', label: '全部' },
                        { value: 'active', label: '运行中' },
                        { value: 'paused', label: '已暂停' },
                        { value: 'completed', label: '已完成' },
                    ].map((tab) => (
                        <button
                            key={tab.value}
                            className={`tab ${statusFilter === tab.value ? 'active' : ''}`}
                            onClick={() => {
                                setStatusFilter(tab.value);
                                setPage(0);
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* 类型筛选 */}
                <div className="tabs" style={{ minWidth: '200px' }}>
                    {[
                        { value: 'all', label: '全部类型' },
                        { value: 'reminder', label: '定时任务' },
                        { value: 'email_sync', label: '邮件任务' },
                    ].map((tab) => (
                        <button
                            key={tab.value}
                            className={`tab ${typeFilter === tab.value ? 'active' : ''}`}
                            onClick={() => {
                                setTypeFilter(tab.value);
                                setPage(0);
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 任务列表 */}
            <div className="card">
                {loading ? (
                    <div className="loading">
                        <div className="spinner" />
                    </div>
                ) : error ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">❌</div>
                        <div className="empty-state-title">加载失败</div>
                        <div className="empty-state-text">{error}</div>
                        <button className="btn btn-primary" onClick={loadTasks}>
                            重试
                        </button>
                    </div>
                ) : tasks.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📋</div>
                        <div className="empty-state-title">暂无任务</div>
                        <div className="empty-state-text">
                            {statusFilter === 'all' && typeFilter === 'all'
                                ? '还没有创建任何定时任务'
                                : `没有${typeFilter === 'all' ? '' : typeFilter === 'reminder' ? '定时' : '邮件'}${statusFilter === 'all' ? '' : statusFilter === 'active' ? '运行中' : statusFilter === 'paused' ? '已暂停' : '已完成'}的任务`}
                        </div>
                        <Link to="/create" className="btn btn-primary">
                            创建第一个任务
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>任务标题</th>
                                        <th>类型</th>
                                        <th>执行时间</th>
                                        <th>状态</th>
                                        <th>下次执行</th>
                                        <th>已执行</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tasks.map((task) => (
                                        <tr key={task.id}>
                                            <td>
                                                <Link
                                                    to={`/tasks/${task.id}`}
                                                    style={{
                                                        fontWeight: 500,
                                                        color: 'var(--text-primary)',
                                                        textDecoration: 'none',
                                                    }}
                                                >
                                                    {task.title}
                                                </Link>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                    {task.content.length > 30
                                                        ? task.content.slice(0, 30) + '...'
                                                        : task.content}
                                                </div>
                                            </td>
                                            <td>
                                                {task.type === 'email_sync' ? (
                                                    <span className="badge" style={{ background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)' }}>
                                                        📧 邮箱同步
                                                    </span>
                                                ) : (
                                                    getScheduleTypeLabel(task.schedule_type)
                                                )}
                                            </td>
                                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                                                {formatScheduleTime(task)}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <StatusBadge status={task.status} />
                                                    {task.ack_required && (
                                                        <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '2px', color: task.ack_status === 'pending' ? '#e11d48' : '#64748b' }}>
                                                            🔥 {task.ack_status === 'pending' ? '等待确认' : '需确认'}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td>{formatNextTrigger(task.next_trigger_at)}</td>
                                            <td>{task.trigger_count} 次</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <Link
                                                        to={`/tasks/${task.id}`}
                                                        className="btn btn-ghost btn-sm btn-icon"
                                                        title="查看详情"
                                                    >
                                                        👁
                                                    </Link>
                                                    {task.type === 'email_sync' ? (
                                                        <Link
                                                            to="/email"
                                                            className="btn btn-ghost btn-sm btn-icon"
                                                            title="在邮箱中心管理"
                                                        >
                                                            ⚙️
                                                        </Link>
                                                    ) : (
                                                        <Link
                                                            to={`/tasks/${task.id}/edit`}
                                                            className="btn btn-ghost btn-sm btn-icon"
                                                            title="编辑任务"
                                                        >
                                                            ✏️
                                                        </Link>
                                                    )}
                                                    {task.status !== 'completed' && (
                                                        <button
                                                            className="btn btn-ghost btn-sm btn-icon"
                                                            title={task.status === 'active' ? '暂停' : '恢复'}
                                                            onClick={() => {
                                                                if (task.type === 'email_sync') {
                                                                    alert('请在邮箱中心管理同步状态');
                                                                    return;
                                                                }
                                                                handleToggleStatus(task);
                                                            }}
                                                        >
                                                            {task.status === 'active' ? '⏸' : '▶️'}
                                                        </button>
                                                    )}
                                                    <button
                                                        className="btn btn-ghost btn-sm btn-icon"
                                                        title="立即发送 (测试)"
                                                        onClick={() => handleTrigger(task)}
                                                        style={{ color: 'var(--success)', fontSize: '0.9em' }}
                                                    >
                                                        🚀
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-sm btn-icon"
                                                        title="删除"
                                                        onClick={() => handleDelete(task)}
                                                        style={{ color: 'var(--error)', opacity: task.type === 'email_sync' ? 0.3 : 1, cursor: task.type === 'email_sync' ? 'not-allowed' : 'pointer' }}
                                                    >
                                                        🗑
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* 分页 */}
                        {total > pageSize && (
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '16px 0',
                                    borderTop: '1px solid var(--border)',
                                    marginTop: '16px',
                                }}
                            >
                                <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                                    共 {total} 条记录，第 {page + 1} / {Math.ceil(total / pageSize)} 页
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        disabled={page === 0}
                                        onClick={() => setPage((p) => p - 1)}
                                    >
                                        上一页
                                    </button>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        disabled={(page + 1) * pageSize >= total}
                                        onClick={() => setPage((p) => p + 1)}
                                    >
                                        下一页
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// 状态徽章组件
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

// 获取调度类型标签
function getScheduleTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        once: '一次性',
        daily: '每天',
        weekly: '每周',
        monthly: '每月',
        cron: 'Cron',
    };
    return labels[type] || type;
}

// 格式化执行时间
function formatScheduleTime(task: Reminder): string {
    switch (task.schedule_type) {
        case 'once':
            return task.schedule_date
                ? `${task.schedule_date} ${task.schedule_time || ''}`
                : task.schedule_time || '-';
        case 'daily':
            return task.schedule_time || '-';
        case 'weekly':
            const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            return `${weekdays[task.schedule_weekday || 0]} ${task.schedule_time || ''}`;
        case 'monthly':
            return `每月 ${task.schedule_day || 1} 日 ${task.schedule_time || ''}`;
        case 'cron':
            return task.schedule_cron || '-';
        default:
            return '-';
    }
}

// 格式化下次触发时间
function formatNextTrigger(timestamp: number | null): string {
    if (!timestamp) return '-';

    try {
        const date = new Date(timestamp);
        return format(date, 'MM/dd HH:mm', { locale: zhCN });
    } catch {
        return '-';
    }
}
