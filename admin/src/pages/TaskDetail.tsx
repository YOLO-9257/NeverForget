import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { reminderApi } from '../api';
import type { Reminder, TriggerLog } from '../types';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export function TaskDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [task, setTask] = useState<Reminder | null>(null);
    const [logs, setLogs] = useState<TriggerLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'info' | 'logs'>('info');

    useEffect(() => {
        if (id) {
            loadData();
        }
    }, [id]);

    const loadData = async () => {
        if (!id) return;

        try {
            setLoading(true);
            setError(null);

            const [taskRes, logsRes] = await Promise.all([
                reminderApi.get(id),
                reminderApi.getLogs(id, 20),
            ]);

            if (taskRes.data) setTask(taskRes.data);
            if (logsRes.data) setLogs(logsRes.data.items || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setLoading(false);
        }
    };

    // 暂停/恢复任务
    const handleToggleStatus = async () => {
        if (!task) return;

        const newStatus = task.status === 'active' ? 'paused' : 'active';
        try {
            await reminderApi.update(task.id, { status: newStatus });
            loadData();
        } catch (err) {
            alert(err instanceof Error ? err.message : '操作失败');
        }
    };

    // 删除任务
    const handleDelete = async () => {
        if (!task) return;

        if (!confirm(`确定要删除任务 "${task.title}" 吗？此操作不可恢复。`)) {
            return;
        }

        try {
            await reminderApi.delete(task.id);
            navigate('/tasks');
        } catch (err) {
            alert(err instanceof Error ? err.message : '删除失败');
        }
    };

    if (loading) {
        return (
            <div className="loading">
                <div className="spinner" />
            </div>
        );
    }

    if (error || !task) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">❌</div>
                <div className="empty-state-title">加载失败</div>
                <div className="empty-state-text">{error || '任务不存在'}</div>
                <Link to="/tasks" className="btn btn-primary">
                    返回列表
                </Link>
            </div>
        );
    }

    return (
        <div>
            {/* 页面标题 */}
            <div className="page-header">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Link to="/tasks" className="btn btn-ghost btn-icon" title="返回">
                            ←
                        </Link>
                        <div>
                            <h1 className="page-title">{task.title}</h1>
                            <p className="page-subtitle">任务 ID: {task.id}</p>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <Link
                        to={`/tasks/${task.id}/edit`}
                        className="btn btn-primary"
                    >
                        ✏️ 编辑
                    </Link>
                    {task.status !== 'completed' && (
                        <button
                            className="btn btn-secondary"
                            onClick={handleToggleStatus}
                        >
                            {task.status === 'active' ? '⏸ 暂停' : '▶️ 恢复'}
                        </button>
                    )}
                    <button className="btn btn-danger" onClick={handleDelete}>
                        🗑 删除
                    </button>
                </div>
            </div>

            {/* 选项卡 */}
            <div className="tabs" style={{ marginBottom: '24px' }}>
                <button
                    className={`tab ${activeTab === 'info' ? 'active' : ''}`}
                    onClick={() => setActiveTab('info')}
                >
                    📋 基本信息
                </button>
                <button
                    className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
                    onClick={() => setActiveTab('logs')}
                >
                    📊 执行日志 ({logs.length})
                </button>
            </div>

            {activeTab === 'info' ? (
                <div className="detail-grid">
                    {/* 左侧：基本信息 */}
                    <div className="card">
                        <div className="detail-section">
                            <h3 className="detail-section-title">基本信息</h3>
                            <div className="detail-row">
                                <span className="detail-label">状态</span>
                                <StatusBadge status={task.status} />
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">标题</span>
                                <span className="detail-value">{task.title}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">内容</span>
                                <span className="detail-value" style={{ maxWidth: '300px', wordBreak: 'break-word' }}>
                                    {task.content}
                                </span>
                            </div>
                        </div>

                        <div className="detail-section">
                            <h3 className="detail-section-title">调度配置</h3>
                            <div className="detail-row">
                                <span className="detail-label">类型</span>
                                <span className="detail-value">{getScheduleTypeLabel(task.schedule_type)}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">执行时间</span>
                                <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>
                                    {formatScheduleTime(task)}
                                </span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">时区</span>
                                <span className="detail-value">{task.timezone}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">下次执行</span>
                                <span className="detail-value">
                                    {task.next_trigger_at
                                        ? format(new Date(task.next_trigger_at), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })
                                        : '-'}
                                </span>
                            </div>
                        </div>

                        <div className="detail-section">
                            <h3 className="detail-section-title">执行统计</h3>
                            <div className="detail-row">
                                <span className="detail-label">已执行次数</span>
                                <span className="detail-value">{task.trigger_count} 次</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">上次执行</span>
                                <span className="detail-value">
                                    {task.last_trigger_at
                                        ? format(new Date(task.last_trigger_at), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })
                                        : '-'}
                                </span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">创建时间</span>
                                <span className="detail-value">
                                    {format(new Date(task.created_at), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })}
                                </span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">更新时间</span>
                                <span className="detail-value">
                                    {format(new Date(task.updated_at), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })}
                                </span>
                            </div>
                        </div>

                        <div className="detail-section">
                            <h3 className="detail-section-title">推送配置</h3>
                            <div className="detail-row">
                                <span className="detail-label">AppID</span>
                                <span className="detail-value table-mono">{task.push_config?.appid}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">UserID</span>
                                <span className="detail-value table-mono">{task.push_config?.userid}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Template ID</span>
                                <span className="detail-value table-mono">{task.push_config?.template_id}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">详情页模板</span>
                                <span className="detail-value">{task.template_name || '默认模板'}</span>
                            </div>
                        </div>
                    </div>

                    {/* 右侧：最近执行记录 */}
                    <div className="card">
                        <div className="card-header">
                            <h3 className="card-title">最近执行</h3>
                        </div>
                        {logs.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                暂无执行记录
                            </div>
                        ) : (
                            <div className="timeline">
                                {logs.slice(0, 5).map((log) => (
                                    <div key={log.id} className={`timeline-item ${log.status}`}>
                                        <div className="timeline-dot" />
                                        <div className="timeline-time">
                                            {format(new Date(log.triggered_at), 'MM-dd HH:mm:ss', { locale: zhCN })}
                                        </div>
                                        <div className="timeline-content">
                                            <div className={`timeline-status ${log.status === 'success' ? 'badge-success' : 'badge-error'}`}>
                                                {log.status === 'success' ? '✅ 执行成功' : '❌ 执行失败'}
                                            </div>
                                            {log.duration_ms && (
                                                <div className="timeline-detail">耗时: {log.duration_ms}ms</div>
                                            )}
                                            {log.error && (
                                                <div className="timeline-detail" style={{ color: 'var(--error)' }}>
                                                    错误: {log.error}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* 执行日志列表 */
                <div className="card">
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>执行时间</th>
                                    <th>状态</th>
                                    <th>耗时</th>
                                    <th>响应/错误</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} style={{ textAlign: 'center', padding: '40px' }}>
                                            暂无执行记录
                                        </td>
                                    </tr>
                                ) : (
                                    logs.map((log) => (
                                        <tr key={log.id}>
                                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                                                {format(new Date(log.triggered_at), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })}
                                            </td>
                                            <td>
                                                <span className={`badge ${log.status === 'success' ? 'badge-success' : 'badge-error'}`}>
                                                    {log.status === 'success' ? '成功' : '失败'}
                                                </span>
                                            </td>
                                            <td>{log.duration_ms ? `${log.duration_ms}ms` : '-'}</td>
                                            <td style={{ maxWidth: '400px', wordBreak: 'break-word' }}>
                                                {log.error || log.response || '-'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
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
            return `每天 ${task.schedule_time || ''}`;
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
