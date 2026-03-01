import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { notificationApi } from '../../api';
import type { NotificationChannel, PushTrackingRecord } from '../../types';
import { Button, Card, Input, Select, type SelectOption } from '../../components/shared';
import styles from './NotificationCenter.module.css';

/**
 * 状态标签映射
 */
const STATUS_LABELS: Record<string, string> = {
    pending: '待发送',
    sending: '发送中',
    sent: '已发送',
    delivered: '已送达',
    read: '已读',
    failed: '失败',
    cancelled: '已取消',
    skipped: '已跳过',
    filtered: '被过滤',
};

/**
 * 消息类型标签映射
 */
const MESSAGE_TYPE_LABELS: Record<string, string> = {
    reminder: '定时任务',
    email: '邮件消息',
};

/**
 * 格式化时间戳
 */
function formatTime(ts?: number): string {
    if (!ts) {
        return '-';
    }
    return format(new Date(ts), 'MM-dd HH:mm:ss', { locale: zhCN });
}

/**
 * 通知中心页面组件
 */
export function NotificationCenter() {
    const [channels, setChannels] = useState<NotificationChannel[]>([]);
    const [records, setRecords] = useState<PushTrackingRecord[]>([]);
    const [statusSummary, setStatusSummary] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryingId, setRetryingId] = useState<number | null>(null);

    // 筛选状态
    const [statusFilter, setStatusFilter] = useState('');
    const [channelFilter, setChannelFilter] = useState<string>('');
    const [messageTypeFilter, setMessageTypeFilter] = useState<'email' | 'reminder' | ''>('');
    const [keywordInput, setKeywordInput] = useState('');
    const [keyword, setKeyword] = useState('');

    // 分页状态
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
                channelId: channelFilter ? Number(channelFilter) : undefined,
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

    // 初始化加载渠道
    useEffect(() => {
        void loadChannels();
    }, [loadChannels]);

    // 加载记录
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

    const handleSearch = () => {
        setPage(1);
        setKeyword(keywordInput.trim());
    };

    const handleClearSearch = () => {
        setKeywordInput('');
        setKeyword('');
        setPage(1);
    };

    // 构建下拉选项
    const messageTypeOptions: SelectOption[] = [
        { value: '', label: '全部消息类型' },
        { value: 'reminder', label: '定时任务' },
        { value: 'email', label: '邮件消息' },
    ];

    const statusOptions: SelectOption[] = [
        { value: '', label: '全部状态' },
        ...Object.entries(STATUS_LABELS).map(([value, label]) => ({
            value,
            label,
        })),
    ];

    const channelOptions: SelectOption[] = [
        { value: '', label: '全部渠道' },
        ...channels.map(channel => ({
            value: String(channel.id),
            label: channel.name,
        })),
    ];

    return (
        <div className={styles.pageContainer}>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>消息中心</h1>
                    <p className={styles.pageSubtitle}>查看通知发送状态、失败原因与重试队列</p>
                </div>
                <Button variant="secondary" onClick={loadTracking} leftIcon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                        <path d="M16 21h5v-5" />
                    </svg>
                }>
                    刷新
                </Button>
            </div>

            {/* 状态概览 */}
            <div className={styles.summaryGrid}>
                {['pending', 'sent', 'delivered', 'failed'].map((statusKey) => (
                    <Card key={statusKey} className={styles.summaryCard} clickable>
                        <div className={styles.summaryLabel}>{STATUS_LABELS[statusKey]}</div>
                        <div className={styles.summaryValue}>{statusSummary[statusKey] || 0}</div>
                    </Card>
                ))}
            </div>

            <Card className={styles.mainCard} padded={false}>
                {/* 筛选栏 */}
                <div className={styles.filterBar}>
                    <Input
                        className={styles.searchInput}
                        placeholder="搜索标题、内容或消息 ID"
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleSearch();
                            }
                        }}
                        rightAddon={
                            (keyword || keywordInput) ? (
                                <span
                                    style={{ cursor: 'pointer', color: '#999', display: 'flex', alignItems: 'center' }}
                                    onClick={handleClearSearch}
                                    title="清除搜索"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </span>
                            ) : null
                        }
                    />

                    <div className={styles.filterSelect}>
                        <Select
                            options={messageTypeOptions}
                            value={messageTypeFilter}
                            onChange={(e) => {
                                setPage(1);
                                setMessageTypeFilter(e.target.value as 'email' | 'reminder' | '');
                            }}
                        />
                    </div>

                    <div className={styles.filterSelect}>
                        <Select
                            options={statusOptions}
                            value={statusFilter}
                            onChange={(e) => {
                                setPage(1);
                                setStatusFilter(e.target.value);
                            }}
                        />
                    </div>

                    <div className={styles.filterSelect}>
                        <Select
                            options={channelOptions}
                            value={channelFilter}
                            onChange={(e) => {
                                setPage(1);
                                setChannelFilter(e.target.value);
                            }}
                        />
                    </div>

                    <Button variant="primary" onClick={handleSearch}>
                        搜索
                    </Button>
                </div>

                {/* 列表内容 */}
                <div className={styles.tableContainer}>
                    {loading ? (
                        <div className={styles.loading}>
                            <div className="spinner" />
                        </div>
                    ) : error ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyStateIcon}>❌</div>
                            <div>{error}</div>
                            <Button variant="secondary" onClick={loadTracking} style={{ marginTop: 12 }}>重试</Button>
                        </div>
                    ) : records.length === 0 ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyStateIcon}>📭</div>
                            <div>暂无推送记录</div>
                            <div style={{ fontSize: 13 }}>通知发送后会显示在这里</div>
                        </div>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>发送时间</th>
                                    <th>标题 / ID</th>
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
                                            <span className={`badge ${record.status === 'failed' ? 'badge-error' : record.status === 'sent' ? 'badge-success' : 'badge-default'}`}>
                                                {STATUS_LABELS[record.status] || record.status}
                                            </span>
                                        </td>
                                        <td>{record.retry_count || 0}</td>
                                        <td className={styles.errorCell} title={record.error_message || ''}>
                                            {record.error_message
                                                ? (record.error_message.length > 50 ? `${record.error_message.slice(0, 50)}...` : record.error_message)
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
                    )}
                </div>

                {/* 分页 */}
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
            </Card>
        </div>
    );
}
