import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { reminderApi } from '../api';
import type { Reminder, TriggerLog } from '../types';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { StatusBadge, getScheduleTypeLabel, formatScheduleTime, Button, Tabs, TabsList, TabsTrigger, TabsContent } from '../components/shared';
import styles from './TaskDetail.module.css';

export function TaskDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [task, setTask] = useState<Reminder | null>(null);
    const [logs, setLogs] = useState<TriggerLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'info' | 'logs'>('info');

    const loadData = useCallback(async () => {
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
    }, [id]);

    useEffect(() => {
        if (id) {
            void loadData();
        }
    }, [id, loadData]);

    // 暂停/恢复任务
    const handleToggleStatus = async () => {
        if (!task) return;

        const newStatus = task.status === 'active' ? 'paused' : 'active';
        try {
            await reminderApi.update(task.id, { status: newStatus });
            void loadData();
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
                <Button variant="primary" onClick={() => navigate('/tasks')}>
                    返回列表
                </Button>
            </div>
        );
    }

    return (
        <div>
            {/* 页面标题 */}
            <div className="page-header">
                <div>
                    <div className={styles.headerTitleRow}>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate('/tasks')}
                            title="返回"
                        >
                            ←
                        </Button>
                        <div>
                            <h1 className="page-title">{task.title}</h1>
                            <p className="page-subtitle">任务 ID: {task.id}</p>
                        </div>
                    </div>
                </div>
                <div className={styles.headerActions}>
                    <Button
                        variant="primary"
                        onClick={() => navigate(`/tasks/${task.id}/edit`)}
                        leftIcon="✏️"
                    >
                        编辑
                    </Button>
                    {task.status !== 'completed' && (
                        <Button
                            variant="secondary"
                            onClick={handleToggleStatus}
                            leftIcon={task.status === 'active' ? '⏸' : '▶️'}
                        >
                            {task.status === 'active' ? '暂停' : '恢复'}
                        </Button>
                    )}
                    <Button variant="danger" onClick={handleDelete} leftIcon="🗑">
                        删除
                    </Button>
                </div>
            </div>

            {/* 选项卡 */}
            <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'info' | 'logs')} className="tabs-container">
                <TabsList className={styles.tabsWrapper}>
                    <TabsTrigger value="info">📋 基本信息</TabsTrigger>
                    <TabsTrigger value="logs">📊 执行日志 ({logs.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="info">
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
                                    <span className={`detail-value ${styles.contentValue}`}>
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
                                    <span className={`detail-value ${styles.monoValue}`}>
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

                            {task.type !== 'email_sync' ? (
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
                            ) : (
                                <div className="detail-section">
                                    <h3 className="detail-section-title">邮箱同步信息</h3>
                                    <p className={styles.emailSyncDesc}>
                                        这是一个自动邮箱同步任务。它会定期检查您的邮箱并将新邮件推送到微信。
                                        推送配置使用的是关联邮箱账户中的设置。
                                    </p>
                                    <div className="detail-row">
                                        <span className="detail-label">关联账户 ID</span>
                                        <span className="detail-value table-mono">{task.related_id}</span>
                                    </div>
                                    <div className={styles.emailLinkWrapper}>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => navigate('/email')}
                                            className={styles.emailLinkBtn}
                                            leftIcon="⚙️"
                                        >
                                            前往邮箱中心管理
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 右侧：最近执行记录 */}
                        <div className="card">
                            <div className="card-header">
                                <h3 className="card-title">最近执行</h3>
                            </div>
                            {logs.length === 0 ? (
                                <div className={styles.emptyState}>
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
                                                    <div className={`timeline-detail ${styles.errorText}`}>
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
                </TabsContent>

                <TabsContent value="logs">
                    {/* 执行日志列表 */}
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
                                            <td colSpan={4} className={styles.emptyCell}>
                                                暂无执行记录
                                            </td>
                                        </tr>
                                    ) : (
                                        logs.map((log) => (
                                            <tr key={log.id}>
                                                <td className={styles.logTime}>
                                                    {format(new Date(log.triggered_at), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })}
                                                </td>
                                                <td>
                                                    <span className={`badge ${log.status === 'success' ? 'badge-success' : 'badge-error'}`}>
                                                        {log.status === 'success' ? '成功' : '失败'}
                                                    </span>
                                                </td>
                                                <td>{log.duration_ms ? `${log.duration_ms}ms` : '-'}</td>
                                                <td className={styles.logMessage}>
                                                    {log.error || log.response || '-'}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
