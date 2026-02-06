import { useState, useEffect } from 'react';
import type { FetchedEmail } from '../types';

interface EmailInboxProps {
    accountId: string;
    accountName: string;
    onClose: () => void;
}

export function EmailInbox({ accountId, accountName, onClose }: EmailInboxProps) {
    const [emails, setEmails] = useState<FetchedEmail[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedEmail, setSelectedEmail] = useState<FetchedEmail | null>(null);
    const [page, setPage] = useState(1);
    const [repairing, setRepairing] = useState(false);


    const apiUrl = localStorage.getItem('api_url') || '';
    const authToken = localStorage.getItem('auth_token') || '';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
    };

    const fetchEmails = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${apiUrl}/api/email/accounts/${accountId}/messages?page=${page}&size=20`, { headers });
            const json = await res.json();
            if (json.code === 0) {
                setEmails(json.data.list);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchEmails(); }, [page]);

    const handleView = async (email: FetchedEmail) => {
        try {
            const res = await fetch(`${apiUrl}/api/email/messages/${email.id}`, { headers });
            const json = await res.json();
            if (json.code === 0) {
                setSelectedEmail(json.data);
            }
        } catch (e) { alert('Failed to load content'); }
    };

    const handlePush = async (email: FetchedEmail) => {
        if (!confirm('确认推送这封邮件吗？')) return;
        try {
            const res = await fetch(`${apiUrl}/api/email/messages/${email.id}/push`, { method: 'POST', headers });
            const json = await res.json();
            if (json.code === 0) {
                alert('推送成功');
                fetchEmails(); // Refresh list status
                if (selectedEmail && selectedEmail.id === email.id) {
                    setSelectedEmail({ ...selectedEmail, is_pushed: 1, push_status: 'success' });
                }
            } else {
                alert('推送失败: ' + json.message);
            }
        } catch (e) { alert('Error pushing'); }
    };

    const handleAiRepair = async (email: FetchedEmail) => {
        setRepairing(true);
        try {
            const res = await fetch(`${apiUrl}/api/email/ai/parse`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ content: email.content, mode: 'repair' })
            });
            const json = await res.json();
            if (json.code === 0) {
                setSelectedEmail({ ...email, content: json.data.content });
            } else {
                alert('修复失败: ' + json.message);
            }
        } catch (e) { alert('请求失败'); }
        finally { setRepairing(false); }
    };

    return (
        <div className="modal-overlay">
            <div className="inbox-container">
                <div className="inbox-header">
                    <h3>{accountName} - 邮件箱</h3>
                    <button className="btn-close" onClick={onClose}>×</button>
                </div>

                <div className="inbox-content">
                    {loading && !emails.length ? (
                        <div className="loading"><div className="spinner" /></div>
                    ) : selectedEmail ? (
                        <div className="email-detail">
                            <div className="detail-toolbar">
                                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedEmail(null)}>← 返回</button>
                                <div style={{ flex: 1 }}></div>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ marginRight: '8px', background: 'var(--bg-secondary)' }}
                                    onClick={() => handleAiRepair(selectedEmail)}
                                    disabled={repairing}
                                >
                                    {repairing ? '✨ 修复中...' : '✨ AI 智能修复'}
                                </button>
                                {!selectedEmail.is_pushed ? (
                                    <button className="btn btn-primary btn-sm" onClick={() => handlePush(selectedEmail)}>
                                        🌐 推送
                                    </button>
                                ) : (
                                    <span style={{ color: 'green', fontSize: '13px' }}>✅ 已推送</span>
                                )}
                            </div>
                            <h2 className="detail-subject">{selectedEmail.subject}</h2>
                            <div className="detail-meta">
                                <span>发件人: {selectedEmail.from_address}</span>
                                <span>时间: {new Date(selectedEmail.received_at).toLocaleString()}</span>
                            </div>
                            <div className="detail-body" dangerouslySetInnerHTML={{ __html: selectedEmail.content || '(无内容)' }} />
                        </div>
                    ) : (
                        <>
                            <div className="email-list">
                                {emails.length === 0 ? (
                                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        <div style={{ fontSize: '40px', marginBottom: '16px', opacity: 0.5 }}>📭</div>
                                        <div>暂无邮件记录</div>
                                    </div>
                                ) : emails.map(email => (
                                    <div key={email.id} className="email-row" onClick={() => handleView(email)}>
                                        <div className="email-main">
                                            <div className="email-subject">{email.subject || '(无主题)'}</div>
                                            <div className="email-from">{email.from_address}</div>
                                        </div>
                                        <div className="email-meta">
                                            <div className="email-date">{new Date(email.received_at).toLocaleDateString()}</div>

                                            {/* Status Badge */}
                                            <div
                                                className={`status-badge status-${email.push_status}`}
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
                            <div className="pagination">
                                <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
                                <span style={{ fontSize: '13px', color: '#666' }}>第 {page} 页</span>
                                <button className="btn btn-sm" disabled={emails.length < 20} onClick={() => setPage(p => p + 1)}>下一页</button>
                            </div>
                        </>
                    )}
                </div>

                <style>{`
                    .inbox-container {
                        width: 900px; max-width: 95vw; height: 85vh;
                        background: var(--bg-card); border-radius: 12px;
                        box-shadow: 0 20px 50px rgba(0,0,0,0.3);
                        display: flex; flex-direction: column;
                        overflow: hidden;
                    }
                    .inbox-header {
                        padding: 16px 24px; border-bottom: 1px solid var(--border);
                        display: flex; justify-content: space-between; align-items: center;
                        background: var(--bg-tertiary);
                    }
                    .inbox-content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
                    
                    .email-list { flex: 1; overflow-y: auto; }
                    .email-row {
                        display: flex; align-items: center; padding: 16px 24px;
                        border-bottom: 1px solid var(--border-light);
                        cursor: pointer; transition: background 0.2s;
                        gap: 16px;
                    }
                    .email-row:hover { background: var(--bg-hover); }
                    .email-main { flex: 1; min-width: 0; }
                    .email-subject { font-weight: 500; margin-bottom: 4px; color: var(--text-primary); }
                    .email-from { font-size: 13px; color: var(--text-muted); }
                    .email-meta { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; min-width: 80px; }
                    .email-date { font-size: 12px; color: var(--text-muted); }
                    
                    .status-badge { 
                        font-size: 11px; padding: 2px 8px; border-radius: 12px; 
                        background: var(--bg-tertiary); color: var(--text-secondary); 
                        display: inline-flex; align-items: center; gap: 4px;
                        white-space: nowrap;
                    }
                    .status-success { background: rgba(var(--success-rgb, 46, 204, 113), 0.15); color: rgb(var(--success-rgb, 46, 204, 113)); border: 1px solid rgba(var(--success-rgb, 46, 204, 113), 0.2); }
                    .status-failed { background: rgba(var(--error-rgb, 231, 76, 60), 0.15); color: rgb(var(--error-rgb, 231, 76, 60)); border: 1px solid rgba(var(--error-rgb, 231, 76, 60), 0.2); cursor: help; }
                    .status-skipped { background: rgba(var(--warning-rgb, 241, 196, 15), 0.15); color: rgb(var(--warning-rgb, 241, 196, 15)); opacity: 0.8; }
                    .status-filtered { background: var(--bg-tertiary); color: var(--text-muted); border: 1px solid var(--border); }
                    .status-pending { background: rgba(52, 152, 219, 0.15); color: #3498db; }
                    
                    .email-detail { padding: 30px; overflow-y: auto; height: 100%; display: flex; flex-direction: column; background: var(--bg-card); }
                    .detail-toolbar { display: flex; gap: 12px; margin-bottom: 24px; align-items: center; border-bottom: 1px solid var(--border-light); padding-bottom: 16px; }
                    .detail-subject { font-size: 24px; margin: 0 0 16px 0; color: var(--text-primary); }
                    .detail-meta { 
                        display: flex; gap: 24px; font-size: 14px; color: var(--text-secondary); 
                        padding: 16px; background: var(--bg-tertiary); border-radius: 8px; margin-bottom: 24px;
                    }
                    .detail-body { line-height: 1.6; font-size: 15px; color: var(--text-primary); }
                    .detail-body img { max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0; }
                    .detail-body blockquote { border-left: 4px solid var(--border); padding-left: 16px; color: var(--text-muted); margin: 16px 0; }

                    .pagination { padding: 12px 24px; border-top: 1px solid var(--border); display: flex; justify-content: center; gap: 16px; align-items: center; background: var(--bg-tertiary); }
                `}</style>
            </div>
        </div>
    );
}
