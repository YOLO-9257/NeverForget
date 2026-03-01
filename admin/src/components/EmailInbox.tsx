import { useMemo, useState, useEffect, useCallback } from 'react';
import type { FetchedEmail } from '../types';
import styles from './EmailInbox.module.css';

interface EmailInboxProps {
    accountId: string;
    accountName: string;
    onClose: () => void;
}

type ContentViewMode = 'smart' | 'raw';

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
}

function toSafeText(content: string | null | undefined): string {
    if (!content) {
        return '(无内容)';
    }

    const text = content
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, '');

    const decoded = decodeHtmlEntities(text)
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return decoded || '(无内容)';
}

function parseJsonArray<T>(raw: unknown): T[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as T[];
    if (typeof raw !== 'string') return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
        return [];
    }
}

function getSentimentLabel(value?: string | null): string {
    switch (value) {
        case 'urgent': return '紧急';
        case 'low': return '低优先级';
        default: return '普通';
    }
}

function getSentimentClass(value?: string | null): string {
    switch (value) {
        case 'urgent': return styles.sentimentUrgent;
        case 'low': return styles.sentimentLow;
        default: return styles.sentimentNormal;
    }
}

export function EmailInbox({ accountId, accountName, onClose }: EmailInboxProps) {
    const [emails, setEmails] = useState<FetchedEmail[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedEmail, setSelectedEmail] = useState<FetchedEmail | null>(null);
    const [page, setPage] = useState(1);

    const [repairing, setRepairing] = useState(false);
    const [repairPreview, setRepairPreview] = useState<string | null>(null);
    const [savingRepair, setSavingRepair] = useState(false);
    const [showRepairDiffDialog, setShowRepairDiffDialog] = useState(false);
    const [viewMode, setViewMode] = useState<ContentViewMode>('smart');

    const [summarizing, setSummarizing] = useState(false);
    const [summaryError, setSummaryError] = useState<string | null>(null);

    const apiUrl = localStorage.getItem('api_url') || '';
    const authToken = localStorage.getItem('auth_token') || '';
    const headers = useMemo(() => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
    }), [authToken]);

    const fetchEmails = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${apiUrl}/api/email/accounts/${accountId}/messages?page=${page}&size=20`, { headers });
            const json = await res.json();
            if (json.code === 0) {
                setEmails(json.data.list);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, accountId, headers, page]);

    // 切换账号时重置收件箱状态，避免显示上一个账号的数据
    useEffect(() => {
        setSelectedEmail(null);
        setEmails([]);
        setPage(1);
        setRepairPreview(null);
        setShowRepairDiffDialog(false);
        setSummaryError(null);
        setViewMode('smart');
    }, [accountId]);

    useEffect(() => {
        void fetchEmails();
    }, [fetchEmails]);

    const handleView = async (email: FetchedEmail) => {
        try {
            const res = await fetch(`${apiUrl}/api/email/messages/${email.id}`, { headers });
            const json = await res.json();
            if (json.code === 0) {
                if (json.data.account_id !== accountId) {
                    alert('该邮件不属于当前账号，已阻止查看');
                    return;
                }
                setRepairPreview(null);
                setShowRepairDiffDialog(false);
                setSummaryError(null);
                setViewMode('smart');
                setSelectedEmail(json.data);
            }
        } catch {
            alert('加载邮件内容失败');
        }
    };

    const handlePush = async (email: FetchedEmail) => {
        if (!confirm('确认推送这封邮件吗？')) return;
        try {
            const res = await fetch(`${apiUrl}/api/email/messages/${email.id}/push`, { method: 'POST', headers });
            const json = await res.json();
            if (json.code === 0) {
                alert('推送成功');
                void fetchEmails();
                if (selectedEmail && selectedEmail.id === email.id) {
                    setSelectedEmail({ ...selectedEmail, is_pushed: 1, push_status: 'success' });
                }
            } else {
                alert('推送失败: ' + json.message);
            }
        } catch {
            alert('推送请求失败');
        }
    };

    const handleGenerateSummary = async (forceRefresh = false) => {
        if (!selectedEmail) return;

        setSummarizing(true);
        setSummaryError(null);
        try {
            const res = await fetch(`${apiUrl}/api/email/messages/summary`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    email_id: String(selectedEmail.id),
                    force_refresh: forceRefresh
                })
            });
            const json = await res.json();
            if (json.code !== 0) {
                setSummaryError(json.message || '摘要生成失败');
                return;
            }

            const data = json.data || {};
            setSelectedEmail(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    ai_summary: typeof data.summary === 'string' ? data.summary : prev.ai_summary,
                    ai_entities: Array.isArray(data.entities) ? JSON.stringify(data.entities) : prev.ai_entities,
                    ai_action_items: Array.isArray(data.action_items) ? JSON.stringify(data.action_items) : prev.ai_action_items,
                    ai_sentiment: typeof data.sentiment === 'string' ? data.sentiment : prev.ai_sentiment,
                    ai_importance_score: typeof data.importance_score === 'number' ? data.importance_score : prev.ai_importance_score,
                    ai_processed_at: typeof data.processed_at === 'number' ? data.processed_at : Date.now(),
                };
            });
        } catch {
            setSummaryError('摘要请求失败');
        } finally {
            setSummarizing(false);
        }
    };

    const handleAiRepair = async () => {
        if (!selectedEmail) return;

        setRepairing(true);
        try {
            const source = repairPreview ?? selectedEmail.content;
            const res = await fetch(`${apiUrl}/api/email/ai/parse`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    content: source,
                    mode: 'repair',
                    account_id: selectedEmail.account_id
                })
            });
            const json = await res.json();
            if (json.code === 0) {
                const repaired = typeof json.data?.content === 'string' ? json.data.content.trim() : '';
                if (!repaired) {
                    alert('修复结果为空，请稍后重试');
                    return;
                }
                setRepairPreview(repaired);
                setViewMode('smart');
            } else {
                alert('修复失败: ' + json.message);
            }
        } catch {
            alert('修复请求失败');
        } finally {
            setRepairing(false);
        }
    };

    const handleSaveRepairedContent = async () => {
        if (!selectedEmail || !repairPreview) return;

        setSavingRepair(true);
        try {
            const res = await fetch(`${apiUrl}/api/email/messages/${selectedEmail.id}/content`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ content: repairPreview })
            });
            const json = await res.json();
            if (json.code !== 0) {
                alert('保存失败: ' + (json.message || '未知错误'));
                return;
            }

            setSelectedEmail(prev => prev ? {
                ...prev,
                content: repairPreview,
                ai_summary: null,
                ai_entities: null,
                ai_action_items: null,
                ai_sentiment: null,
                ai_importance_score: null,
                ai_processed_at: null,
            } : prev);
            setRepairPreview(null);
            setShowRepairDiffDialog(false);
            void fetchEmails();
            const summaryQueued = Boolean(json.data?.summary_regeneration_queued);
            if (summaryQueued) {
                alert('已覆盖保存，系统正在后台重建摘要');
            } else {
                alert('已覆盖保存，请手动生成摘要');
            }
        } catch {
            alert('保存请求失败');
        } finally {
            setSavingRepair(false);
        }
    };

    const getStatusClass = (status: string) => {
        switch (status) {
            case 'success': return styles.statusSuccess;
            case 'failed': return styles.statusFailed;
            case 'skipped': return styles.statusSkipped;
            case 'filtered': return styles.statusFiltered;
            case 'pending': return styles.statusPending;
            default: return '';
        }
    };

    const displayContent = repairPreview ?? selectedEmail?.content ?? '';
    const renderedContent = viewMode === 'smart'
        ? toSafeText(displayContent)
        : (displayContent || '(无内容)');

    const actionItems = useMemo(
        () => parseJsonArray<string>(selectedEmail?.ai_action_items),
        [selectedEmail?.ai_action_items]
    );
    const entities = useMemo(
        () => parseJsonArray<{ type?: string; value?: string }>(selectedEmail?.ai_entities),
        [selectedEmail?.ai_entities]
    );
    const hasSummary = Boolean(selectedEmail?.ai_summary);
    const originContent = selectedEmail?.content ?? '';
    const repairedContent = repairPreview ?? '';
    const hasRepairDiff = originContent.trim() !== repairedContent.trim();
    const diffOriginalText = viewMode === 'raw' ? (originContent || '(无内容)') : toSafeText(originContent);
    const diffRepairedText = viewMode === 'raw' ? (repairedContent || '(无内容)') : toSafeText(repairedContent);

    return (
        <div className="modal-overlay">
            <div className={styles.inboxContainer}>
                <div className={styles.inboxHeader}>
                    <h3>{accountName} - 邮件箱</h3>
                    <button className="btn-close" onClick={onClose}>×</button>
                </div>

                <div className={styles.inboxContent}>
                    {loading && !emails.length ? (
                        <div className="loading"><div className="spinner" /></div>
                    ) : selectedEmail ? (
                        <div className={styles.emailDetail}>
                            <div className={styles.detailToolbar}>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => {
                                        setShowRepairDiffDialog(false);
                                        setSelectedEmail(null);
                                    }}
                                >
                                    ← 返回
                                </button>
                                <div className={styles.toolbarSpacer}></div>
                                <button
                                    className={`btn btn-secondary btn-sm ${styles.aiRepairBtn}`}
                                    onClick={handleAiRepair}
                                    disabled={repairing}
                                >
                                    {repairing ? '✨ 修复中...' : '✨ AI 智能修复'}
                                </button>
                                {repairPreview && (
                                    <>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => {
                                                setShowRepairDiffDialog(false);
                                                setRepairPreview(null);
                                            }}
                                            disabled={savingRepair}
                                        >
                                            放弃修复结果
                                        </button>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            onClick={() => setShowRepairDiffDialog(true)}
                                            disabled={savingRepair}
                                        >
                                            对比并覆盖
                                        </button>
                                    </>
                                )}
                                {!selectedEmail.is_pushed ? (
                                    <button className="btn btn-primary btn-sm" onClick={() => handlePush(selectedEmail)}>
                                        🌐 推送
                                    </button>
                                ) : (
                                    <span className={styles.pushedStatus}>✅ 已推送</span>
                                )}
                            </div>

                            <h2 className={styles.detailSubject}>{selectedEmail.subject}</h2>
                            <div className={styles.detailMeta}>
                                <span>发件人: {selectedEmail.from_address}</span>
                                <span>时间: {new Date(selectedEmail.received_at).toLocaleString()}</span>
                            </div>

                            {repairPreview && (
                                <div className={styles.repairNotice}>
                                    当前正在预览 AI 修复结果，你可以选择直接查看，或点击“覆盖保存”写回原邮件正文。
                                </div>
                            )}

                            <div className={styles.summaryCard}>
                                <div className={styles.summaryHeader}>
                                    <div className={styles.summaryTitle}>🧠 内容总结</div>
                                    <div className={styles.summaryActions}>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => handleGenerateSummary(false)}
                                            disabled={summarizing}
                                        >
                                            {summarizing ? '生成中...' : hasSummary ? '重新提取' : '生成摘要'}
                                        </button>
                                        {hasSummary && (
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => handleGenerateSummary(true)}
                                                disabled={summarizing}
                                            >
                                                强制刷新
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {summaryError && (
                                    <div className={styles.summaryError}>{summaryError}</div>
                                )}

                                {hasSummary ? (
                                    <>
                                        <div className={styles.summaryText}>{selectedEmail.ai_summary}</div>
                                        <div className={styles.summaryMeta}>
                                            <span className={`${styles.sentimentBadge} ${getSentimentClass(selectedEmail.ai_sentiment)}`}>
                                                {getSentimentLabel(selectedEmail.ai_sentiment)}
                                            </span>
                                            <span className={styles.scoreBadge}>
                                                重要性: {typeof selectedEmail.ai_importance_score === 'number' ? selectedEmail.ai_importance_score.toFixed(2) : '0.50'}
                                            </span>
                                        </div>

                                        {actionItems.length > 0 && (
                                            <div className={styles.summaryBlock}>
                                                <div className={styles.summaryBlockTitle}>待办项</div>
                                                <ul className={styles.summaryList}>
                                                    {actionItems.map((item, idx) => (
                                                        <li key={`${item}-${idx}`}>{item}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {entities.length > 0 && (
                                            <div className={styles.summaryBlock}>
                                                <div className={styles.summaryBlockTitle}>关键信息</div>
                                                <ul className={styles.summaryList}>
                                                    {entities.map((entity, idx) => (
                                                        <li key={`${entity.type || 'entity'}-${idx}`}>
                                                            {entity.type ? `[${entity.type}] ` : ''}{entity.value || '-'}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className={styles.summaryEmpty}>暂无摘要，点击“生成摘要”可快速提取重点内容。</div>
                                )}
                            </div>

                            <div className={styles.viewModeGroup}>
                                <button
                                    className={`${styles.viewModeBtn} ${viewMode === 'smart' ? styles.viewModeBtnActive : ''}`}
                                    onClick={() => setViewMode('smart')}
                                >
                                    清洗视图
                                </button>
                                <button
                                    className={`${styles.viewModeBtn} ${viewMode === 'raw' ? styles.viewModeBtnActive : ''}`}
                                    onClick={() => setViewMode('raw')}
                                >
                                    原文视图
                                </button>
                            </div>

                            <div className={styles.detailBody}>{renderedContent}</div>

                            {showRepairDiffDialog && repairPreview && (
                                <div className={styles.diffModalOverlay}>
                                    <div className={styles.diffModal}>
                                        <div className={styles.diffModalHeader}>
                                            <h3>对比修复结果</h3>
                                            <button
                                                className="btn-close"
                                                onClick={() => setShowRepairDiffDialog(false)}
                                                disabled={savingRepair}
                                            >
                                                ×
                                            </button>
                                        </div>
                                        <div className={styles.diffModeHint}>
                                            当前对比模式：{viewMode === 'smart' ? '清洗视图' : '原文视图'}
                                        </div>
                                        <div className={styles.diffColumns}>
                                            <section className={styles.diffColumn}>
                                                <div className={styles.diffColumnTitle}>原始正文</div>
                                                <div className={styles.diffText}>{diffOriginalText}</div>
                                            </section>
                                            <section className={styles.diffColumn}>
                                                <div className={styles.diffColumnTitle}>修复后正文</div>
                                                <div className={styles.diffText}>{diffRepairedText}</div>
                                            </section>
                                        </div>
                                        {!hasRepairDiff && (
                                            <div className={styles.diffNoChange}>
                                                修复结果与原文一致，无需覆盖保存。
                                            </div>
                                        )}
                                        <div className={styles.diffActions}>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => setShowRepairDiffDialog(false)}
                                                disabled={savingRepair}
                                            >
                                                取消
                                            </button>
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={handleSaveRepairedContent}
                                                disabled={savingRepair || !hasRepairDiff}
                                            >
                                                {savingRepair ? '保存中...' : '确认覆盖保存'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className={styles.emailList}>
                                {emails.length === 0 ? (
                                    <div className={styles.emptyState}>
                                        <div className={styles.emptyIcon}>📭</div>
                                        <div>暂无邮件记录</div>
                                    </div>
                                ) : emails.map(email => (
                                    <div key={email.id} className={styles.emailRow} onClick={() => handleView(email)}>
                                        <div className={styles.emailMain}>
                                            <div className={styles.emailSubject}>{email.subject || '(无主题)'}</div>
                                            <div className={styles.emailFrom}>{email.from_address}</div>
                                        </div>
                                        <div className={styles.emailMeta}>
                                            <div className={styles.emailDate}>{new Date(email.received_at).toLocaleDateString()}</div>
                                            <div
                                                className={`${styles.statusBadge} ${getStatusClass(email.push_status)}`}
                                                title={email.push_status === 'failed' ? email.push_log || '未知错误' : undefined}
                                            >
                                                {email.push_status === 'success' && '✅ 已推送'}
                                                {email.push_status === 'failed' && '❌ 失败'}
                                                {email.push_status === 'skipped' && '🚫 未推送'}
                                                {email.push_status === 'pending' && '⏳ 待处理'}
                                                {email.push_status === 'filtered' && '🧹 已过滤'}
                                                {!['success', 'failed', 'skipped', 'pending', 'filtered'].includes(email.push_status) && email.push_status}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className={styles.pagination}>
                                <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
                                <span className={styles.pageInfo}>第 {page} 页</span>
                                <button className="btn btn-sm" disabled={emails.length < 20} onClick={() => setPage(p => p + 1)}>下一页</button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
