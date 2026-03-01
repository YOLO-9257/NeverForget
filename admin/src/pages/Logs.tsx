import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { logsApi } from '../api';
import type { TriggerLog } from '../types';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import styles from './Logs.module.css';

/**
 * 执行日志页面
 * 展示所有任务的执行记录
 */
export function Logs() {
    const [logs, setLogs] = useState<(TriggerLog & { reminder_title?: string; reminder_type?: string })[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [typeFilter, setTypeFilter] = useState<string>('');
    const pageSize = 20;

    const loadLogs = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await logsApi.getAll({
                limit: pageSize,
                offset: (page - 1) * pageSize,
                status: statusFilter || undefined,
                type: typeFilter || undefined,
            });
            if (res.data) {
                setLogs(res.data.items || []);
                setTotal(res.data.total || 0);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setLoading(false);
        }
    }, [page, statusFilter, typeFilter]);

    useEffect(() => {
        void loadLogs();
    }, [loadLogs]);

    const totalPages = Math.ceil(total / pageSize);

    return (
        <div>
            {/* 页面标题 */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">执行日志</h1>
                    <p className="page-subtitle">查看所有任务的执行记录</p>
                </div>
                <div className={styles.headerActions}>
                    <select
                        className={`form-select ${styles.filterSelect}`}
                        value={typeFilter}
                        onChange={(e) => {
                            setTypeFilter(e.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="">全部类型</option>
                        <option value="reminder">定时任务</option>
                        <option value="email_sync">邮件任务</option>
                    </select>
                    <select
                        className={`form-select ${styles.filterSelect}`}
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="">全部状态</option>
                        <option value="success">成功</option>
                        <option value="failed">失败</option>
                    </select>
                    <button className="btn btn-secondary" onClick={loadLogs}>
                        🔄 刷新
                    </button>
                </div>
            </div>

            {/* 错误提示 */}
            {error && (
                <div className="alert alert-error">
                    <span>❌</span>
                    <span>{error}</span>
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            {/* 日志列表 */}
            <div className="card">
                {loading ? (
                    <div className="loading">
                        <div className="spinner" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📭</div>
                        <div className="empty-state-title">暂无执行日志</div>
                        <div className="empty-state-text">
                            任务执行后会在这里显示日志记录
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th className={styles.colTime}>执行时间</th>
                                        <th className={styles.colName}>任务名称</th>
                                        <th className={styles.colType}>类型</th>
                                        <th className={styles.colStatus}>状态</th>
                                        <th className={styles.colDuration}>耗时</th>
                                        <th className={styles.colType}>原因</th>
                                        <th className={styles.colDetail}>详情</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((log) => (
                                        <tr key={log.id}>
                                            <td className={styles.monoCell}>
                                                {format(new Date(log.triggered_at), 'MM-dd HH:mm:ss', { locale: zhCN })}
                                            </td>
                                            <td>
                                                {log.reminder_id ? (
                                                    <Link
                                                        to={`/tasks/${log.reminder_id}`}
                                                        className={styles.linkPrimary}
                                                    >
                                                        {log.reminder_title || log.reminder_id}
                                                    </Link>
                                                ) : (
                                                    <span className={styles.mutedText}>
                                                        {log.reminder_title || '智能管家动作'}
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <span className={`badge ${log.reminder_type === 'email_sync' || log.type === 'email_sync' ? 'badge-info' : ''}`}>
                                                    {log.source === 'ai_butler'
                                                        ? '🤖 管家'
                                                        : (log.reminder_type === 'email_sync' || log.type === 'email_sync' ? '📧 邮件' : '⏰ 定时')}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`badge ${log.status === 'success' ? 'badge-success' : 'badge-error'}`}>
                                                    {log.status === 'success' ? '✅ 成功' : '❌ 失败'}
                                                </span>
                                            </td>
                                            <td className={styles.mono}>
                                                {log.duration_ms ? `${log.duration_ms}ms` : '-'}
                                            </td>
                                            <td>
                                                {log.detail_reason ? (
                                                    <span className={`badge ${log.detail_reason === 'failed' ? 'badge-error' :
                                                            log.detail_reason === 'slow' ? 'badge-warning' :
                                                                log.detail_reason === 'escalated' ? 'badge-error' :
                                                                    log.detail_reason === 'manual' ? 'badge-info' :
                                                                        ''
                                                        }`}>
                                                        {{
                                                            once: '📌 单次',
                                                            failed: '❌ 失败',
                                                            slow: '🐢 慢请求',
                                                            escalated: '🔺 升档',
                                                            sampled: '🎲 采样',
                                                            heartbeat: '💓 心跳',
                                                            manual: '👆 手动',
                                                        }[log.detail_reason] || log.detail_reason}
                                                    </span>
                                                ) : (
                                                    <span className={styles.mutedText}>-</span>
                                                )}
                                            </td>
                                            <td className={styles.detailCell}>
                                                {log.error ? (
                                                    <span className={styles.errorText} title={log.error}>
                                                        {log.error.length > 60 ? log.error.slice(0, 60) + '...' : log.error}
                                                    </span>
                                                ) : log.response ? (
                                                    <span className={styles.mutedText} title={typeof log.response === 'string' ? log.response : JSON.stringify(log.response)}>
                                                        {typeof log.response === 'string' ? log.response.slice(0, 60) : JSON.stringify(log.response).slice(0, 60)}
                                                        {(typeof log.response === 'string' ? log.response : JSON.stringify(log.response)).length > 60 && '...'}
                                                    </span>
                                                ) : log.action ? (
                                                    <span className={styles.mutedText}>{log.action}</span>
                                                ) : (
                                                    <span className={styles.mutedText}>-</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* 分页 */}
                        {totalPages > 1 && (
                            <div className={styles.paginationWrapper}>
                                <span className={styles.paginationInfo}>
                                    第 {page} / {totalPages} 页，共 {total} 条记录
                                </span>
                                <div className={styles.paginationButtons}>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                    >
                                        上一页
                                    </button>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
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
