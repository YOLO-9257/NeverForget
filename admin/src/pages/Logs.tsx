import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { logsApi } from '../api';
import type { TriggerLog } from '../types';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

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

    useEffect(() => {
        loadLogs();
    }, [page, statusFilter, typeFilter]);

    const loadLogs = async () => {
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
    };

    const totalPages = Math.ceil(total / pageSize);

    return (
        <div>
            {/* 页面标题 */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">执行日志</h1>
                    <p className="page-subtitle">查看所有任务的执行记录</p>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <select
                        className="form-select"
                        value={typeFilter}
                        onChange={(e) => {
                            setTypeFilter(e.target.value);
                            setPage(1);
                        }}
                        style={{ width: '150px' }}
                    >
                        <option value="">全部类型</option>
                        <option value="reminder">定时任务</option>
                        <option value="email">邮件任务</option>
                    </select>
                    <select
                        className="form-select"
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setPage(1);
                        }}
                        style={{ width: '150px' }}
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
                                        <th>执行时间</th>
                                        <th>任务名称</th>
                                        <th>类型</th>
                                        <th>状态</th>
                                        <th>耗时</th>
                                        <th>详情</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((log) => (
                                        <tr key={log.id}>
                                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', whiteSpace: 'nowrap' }}>
                                                {format(new Date(log.triggered_at), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })}
                                            </td>
                                            <td>
                                                <Link
                                                    to={`/tasks/${log.reminder_id}`}
                                                    className="link"
                                                    style={{ color: 'var(--primary)' }}
                                                >
                                                    {log.reminder_title || log.reminder_id}
                                                </Link>
                                            </td>
                                            <td>
                                                <span className={`badge ${log.reminder_type === 'email_sync' || log.type === 'email' ? 'badge-info' : ''}`}>
                                                    {log.reminder_type === 'email_sync' || log.type === 'email' ? '📧 邮件' : '⏰ 定时'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`badge ${log.status === 'success' ? 'badge-success' : 'badge-error'}`}>
                                                    {log.status === 'success' ? '✅ 成功' : '❌ 失败'}
                                                </span>
                                            </td>
                                            <td style={{ fontFamily: 'var(--font-mono)' }}>
                                                {log.duration_ms ? `${log.duration_ms}ms` : '-'}
                                            </td>
                                            <td style={{ maxWidth: '300px', wordBreak: 'break-word', fontSize: '13px' }}>
                                                {log.error ? (
                                                    <span style={{ color: 'var(--error)' }}>{log.error}</span>
                                                ) : log.response ? (
                                                    <span style={{ color: 'var(--text-muted)' }}>
                                                        {typeof log.response === 'string' ? log.response.slice(0, 100) : JSON.stringify(log.response).slice(0, 100)}
                                                        {(typeof log.response === 'string' ? log.response : JSON.stringify(log.response)).length > 100 && '...'}
                                                    </span>
                                                ) : (
                                                    '-'
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* 分页 */}
                        {totalPages > 1 && (
                            <div className="pagination">
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                >
                                    ← 上一页
                                </button>
                                <span className="pagination-info">
                                    第 {page} / {totalPages} 页，共 {total} 条
                                </span>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                >
                                    下一页 →
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
