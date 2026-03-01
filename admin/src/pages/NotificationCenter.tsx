import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { notificationApi } from '../api';
import type { NotificationChannel, PushTrackingRecord } from '../types';
import { Button } from '../components/shared';
import styles from './NotificationCenter.module.css';

const STATUS_LABELS: Record<string, string> = {
    pending: '待发送',
    sending: '发送中',
    sent: '已发送',
    delivered: '已送达',
    read: '已读',
    failed: '失败',
    cancelled: '已取消',
};

const MESSAGE_TYPE_LABELS: Record<string, string> = {
    reminder: '定时任务',
    email: '邮件消息',
};

function formatTime(ts?: number): string {
    if (!ts) {
        return '-';
    }
    return format(new Date(ts), 'MM-dd HH:mm:ss', { locale: zhCN });
}

export function NotificationCenter() {
    const [channels, setChannels] = useState<NotificationChannel[]>([]);
    const [records, setRecords] = useState<PushTrackingRecord[]>([]);
    const [statusSummary, setStatusSummary] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryingId, setRetryingId] = useState<number | null>(null);

    const [statusFilter, setStatusFilter] = useState('');
    const [channelFilter, setChannelFilter] = useState<number | undefined>(undefined);
    const [messageTypeFilter, setMessageTypeFilter] = useState<'email' | 'reminder' | ''>('');
    const [keywordInput, setKeywordInput] = useState('');
    const [keyword, setKeyword] = useState('');

    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const pageSize = 20;

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const loadChannels = useCallback(async () => {
        try {
            const res = await notificationApi.listChannels();
            setChannels(res.data?.items || []);
        } catch (err) {
            console.warn('[NotificationCenter] 加载渠道失败', err);
        }
    }, []);

    const loadTracking = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await notificationApi.listPushTracking({
                status: statusFilter || undefined,
                channelId: channelFilter,
                messageType: messageTypeFilter || undefined,
                keyword: keyword || undefined,
                limit: pageSize,
                offset: (page - 1) * pageSize,
            });

            setRecords(res.data?.items || []);
            setTotal(res.data?.total || 0);
            setStatusSummary(res.data?.status_summary || {});
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载推送记录失败');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, channelFilter, messageTypeFilter, keyword, page, pageSize]);

    useEffect(() => {
        void loadChannels();
    }, [loadChannels]);

    useEffect(() => {
        void loadTracking();
    }, [loadTracking]);

    const handleRetry = async (id: number) => {
        setRetryingId(id);
        try {
            await notificationApi.retryPush(id);
            await loadTracking();
        } catch (err) {
            alert(err instanceof Error ? err.message : '重试失败');
        } finally {
            setRetryingId(null);
        }
    };

    return (
        <div>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>通知中心</h1>
                    <p className={styles.pageSubtitle}>查看通知发送状态、失败原因与重试队列</p>
                </div>
                <Button variant="secondary" onClick={loadTracking}>
                    刷新
                </Button>
            </div>

            <div className={styles.summaryGrid}>
                {['pending', 'sent', 'delivered', 'failed'].map((statusKey) => (
                    <div key={statusKey} className={styles.summaryCard}>
                        <div className={styles.summaryLabel}>{STATUS_LABELS[statusKey]}</div>
                        <div className={styles.summaryValue}>{statusSummary[statusKey] || 0}</div>
                    </div>
                ))}
            </div>

            <div className={styles.filterBar}>
                <input
                    className={`form-input ${styles.searchInput}`}
                    placeholder="搜索标题、内容或消息 ID"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            setPage(1);
                            setKeyword(keywordInput.trim());
                        }
                    }}
                />
                <select
                    className={`form-select ${styles.filterSelect}`}
                    value={messageTypeFilter}
                    onChange={(e) => {
                        setPage(1);
                        setMessageTypeFilter(e.target.value as 'email' | 'reminder' | '');
                    }}
                >
                    <option value="">全部消息类型</option>
                    <option value="reminder">定时任务</option>
                    <option value="email">邮件消息</option>
                </select>
                <select
                    className={`form-select ${styles.filterSelect}`}
                    value={statusFilter}
                    onChange={(e) => {
                        setPage(1);
                        setStatusFilter(e.target.value);
                    }}
                >
                    <option value="">全部状态</option>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                    ))}
                </select>
                <select
                    className={`form-select ${styles.filterSelect}`}
                    value={channelFilter || ''}
                    onChange={(e) => {
                        setPage(1);
                        setChannelFilter(e.target.value ? Number(e.target.value) : undefined);
                    }}
                >
                    <option value="">全部渠道</option>
                    {channels.map(channel => (
                        <option key={channel.id} value={channel.id}>{channel.name}</option>
                    ))}
                </select>
                <Button
                    variant="secondary"
                    onClick={() => {
                        setPage(1);
                        setKeyword(keywordInput.trim());
                    }}
                >
                    搜索
                </Button>
                {(keyword || keywordInput) && (
                    <Button
                        variant="ghost"
                        onClick={() => {
                            setKeywordInput('');
                            setKeyword('');
                            setPage(1);
                        }}
                    >
                        清除
                    </Button>
                )}
            </div>

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
                    </div>
                ) : records.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📭</div>
                        <div className="empty-state-title">暂无推送记录</div>
                        <div className="empty-state-text">通知发送后会显示在这里</div>
                    </div>
                ) : (
                    <>
                        <div className="table-container">
                            <table className={`table ${styles.table}`}>
                                <thead>
                                    <tr>
                                        <th>发送时间</th>
                                        <th>标题</th>
                                        <th>消息类型</th>
                                        <th>渠道</th>
                                        <th>状态</th>
                                        <th>重试</th>
                                        <th>错误信息</th>
                                        <th style={{ textAlign: 'right' }}>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {records.map((record) => (
                                        <tr key={record.id}>
                                            <td className={styles.mono}>{formatTime(record.created_at)}</td>
                                            <td>
                                                <div className={styles.titleCell}>
                                                    <div className={styles.titleText}>{record.title || '-'}</div>
                                                    <div className={styles.subText}>{record.message_id}</div>
                                                </div>
                                            </td>
                                            <td>{MESSAGE_TYPE_LABELS[record.message_type] || record.message_type}</td>
                                            <td>{record.channel_name || `#${record.channel_id}`}</td>
                                            <td>
                                                <span className={`badge ${record.status === 'failed' ? 'badge-error' : record.status === 'sent' ? 'badge-success' : ''}`}>
                                                    {STATUS_LABELS[record.status] || record.status}
                                                </span>
                                            </td>
                                            <td>{record.retry_count || 0}</td>
                                            <td className={styles.errorCell} title={record.error_message || ''}>
                                                {record.error_message
                                                    ? (record.error_message.length > 60 ? `${record.error_message.slice(0, 60)}...` : record.error_message)
                                                    : '-'}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                {record.status === 'failed' && (
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        loading={retryingId === record.id}
                                                        onClick={() => handleRetry(record.id)}
                                                    >
                                                        重试
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {total > pageSize && (
                            <div className={styles.pagination}>
                                <span className={styles.paginationInfo}>
                                    第 {page} / {totalPages} 页，共 {total} 条
                                </span>
                                <div className={styles.paginationButtons}>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        disabled={page <= 1}
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    >
                                        上一页
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        disabled={page >= totalPages}
                                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    >
                                        下一页
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default NotificationCenter;
