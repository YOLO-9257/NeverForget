import { useState, useEffect, useCallback, useMemo } from 'react';
import { EmailInbox } from './EmailInbox';
import { EmailBlacklistPanel } from './EmailBlacklistPanel';
import { EmailRulesPanel } from './EmailRulesPanel';
import { AccountList, AccountEditorModal, type EmailAccount } from './accounts';
import styles from './ExternalAccountsPanel.module.css';

interface ApiEmailAccount {
    id: string;
    name: string;
    imap_host: string;
    imap_port: number;
    imap_user: string;
    imap_tls: number;
    push_config: string | null;
    push_url: string | null;
    template_name: string | null;
    enabled: number;
    last_sync_at: number | null;
    sync_status: 'idle' | 'syncing' | 'error';
    sync_error: string | null;
    total_synced: number;
    cached_email_count?: number;
    failed_email_count?: number;
    pending_email_count?: number;
    auto_push?: number;
    enable_ai_spam_filter?: number;
    ai_profile_id?: string | null;
    ai_filter_config?: string | null;
    created_at?: number;
    updated_at?: number;
}

interface ParsedPushConfig {
    appid: string;
    secret: string;
    userid: string;
    template_id: string;
}

interface ParsedAiFilterConfig {
    ads_keep_importance_threshold: number;
}

function parsePushConfig(raw: string | null): ParsedPushConfig | null {
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const appid = typeof parsed.appid === 'string' ? parsed.appid : '';
        const secret = typeof parsed.secret === 'string' ? parsed.secret : '';
        const userid = typeof parsed.userid === 'string' ? parsed.userid : '';
        const template_id = typeof parsed.template_id === 'string' ? parsed.template_id : '';

        if (!appid && !secret && !userid && !template_id) {
            return null;
        }

        return { appid, secret, userid, template_id };
    } catch {
        return null;
    }
}

function parseAiFilterConfig(raw: string | null): ParsedAiFilterConfig | null {
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const value = typeof parsed.ads_keep_importance_threshold === 'number'
            ? parsed.ads_keep_importance_threshold
            : Number.NaN;
        if (!Number.isFinite(value)) {
            return null;
        }
        return {
            ads_keep_importance_threshold: Math.min(1, Math.max(0, value)),
        };
    } catch {
        return null;
    }
}

function mapApiAccount(account: ApiEmailAccount): EmailAccount {
    const pushConfig = parsePushConfig(account.push_config);
    const aiFilterConfig = parseAiFilterConfig(account.ai_filter_config || null);

    return {
        id: account.id,
        name: account.name || '',
        email: account.imap_user || '',
        imap_host: account.imap_host || '',
        imap_port: account.imap_port || 993,
        username: account.imap_user || '',
        use_ssl: account.imap_tls !== 0,
        enabled: account.enabled !== 0,
        sync_status: account.sync_status || 'idle',
        sync_error: account.sync_error || null,
        last_sync: account.last_sync_at ? new Date(account.last_sync_at).toISOString() : undefined,
        email_count: account.cached_email_count ?? account.total_synced ?? 0,
        pending_count: account.pending_email_count ?? 0,
        failed_count: account.failed_email_count ?? 0,
        auto_push: account.auto_push !== 0,
        push_user_id: pushConfig?.userid || '',
        push_template_id: pushConfig?.template_id || '',
        push_appid: pushConfig?.appid || '',
        push_secret: pushConfig?.secret || '',
        push_url: account.push_url || '',
        template_name: account.template_name || '',
        ai_spam_filter: account.enable_ai_spam_filter === 1,
        ai_profile_id: account.ai_profile_id || '',
        ai_filter_config: aiFilterConfig || { ads_keep_importance_threshold: 0.75 },
        push_config: pushConfig,
        created_at: account.created_at ? new Date(account.created_at).toISOString() : undefined,
        updated_at: account.updated_at ? new Date(account.updated_at).toISOString() : undefined,
    };
}

/**
 * ExternalAccountsPanel - 外部邮箱账户管理面板
 * 重构后的轻量级顶层容器，负责 Tab 切换和数据获取
 */
export function ExternalAccountsPanel() {
    const [accounts, setAccounts] = useState<EmailAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'accounts' | 'blacklist' | 'rules'>('accounts');

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingAccount, setEditingAccount] = useState<EmailAccount | null>(null);
    const [inboxAccount, setInboxAccount] = useState<EmailAccount | null>(null);

    const apiUrl = localStorage.getItem('api_url') || '';
    const authToken = localStorage.getItem('auth_token') || '';
    const headers = useMemo(() => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
    }), [authToken]);

    const fetchAccounts = useCallback(async () => {
        try {
            const res = await fetch(`${apiUrl}/api/email/accounts`, { headers });
            const data = await res.json() as { code: number; data?: ApiEmailAccount[] };
            if (data.code === 0 && Array.isArray(data.data)) {
                setAccounts(data.data.map(mapApiAccount));
            } else {
                setAccounts([]);
            }
        } catch (e) {
            console.error('加载账户失败', e);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, headers]);

    useEffect(() => {
        void fetchAccounts();
    }, [fetchAccounts]);

    const handleSync = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            setAccounts(prev => prev.map(a => a.id === id ? { ...a, sync_status: 'syncing' } : a));
            const res = await fetch(`${apiUrl}/api/email/accounts/${id}/sync`, { method: 'POST', headers });
            const json = await res.json();

            if (json.code === 0) {
                alert(json.message || '同步完成');
            } else {
                alert(`同步失败: ${json.message || '未知错误'}`);
            }
            await fetchAccounts();
        } catch (error) {
            console.error('同步请求失败', error);
            alert('同步请求失败');
            await fetchAccounts();
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('确定要删除这个邮箱账户吗？关联的任务也将被删除。')) return;
        try {
            const res = await fetch(`${apiUrl}/api/email/accounts/${id}`, { method: 'DELETE', headers });
            const json = await res.json();
            if (json.code === 0) {
                setAccounts(prev => prev.filter(a => a.id !== id));
            } else {
                alert(`删除失败: ${json.message || '未知错误'}`);
            }
        } catch (error) {
            console.error('删除请求失败', error);
            alert('删除请求失败');
        }
    };

    const handleEdit = (account: EmailAccount) => {
        setEditingAccount(account);
        setShowModal(true);
    };

    const handleAddNew = () => {
        setEditingAccount(null);
        setShowModal(true);
    };

    const tabs = [
        { key: 'accounts' as const, label: '邮箱账户' },
        { key: 'blacklist' as const, label: '黑名单管理' },
        { key: 'rules' as const, label: '过滤规则' }
    ];

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerInfo}>
                    <h3 className={styles.title}>📫 外部邮箱列表</h3>
                    <p className={styles.subtitle}>
                        添加并管理外部邮箱（Gmail, QQ 等），系统将定时拉取邮件并推送到微信
                    </p>
                </div>
                {activeTab === 'accounts' && (
                    <button className="btn btn-primary" onClick={handleAddNew}>
                        添加账号
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className={styles.tabs}>
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        className={`${styles.tabBtn} ${activeTab === tab.key ? styles.tabBtnActive : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'accounts' && (
                <AccountList
                    accounts={accounts}
                    loading={loading}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onSync={handleSync}
                    onViewInbox={setInboxAccount}
                />
            )}
            {activeTab === 'blacklist' && <EmailBlacklistPanel />}
            {activeTab === 'rules' && <EmailRulesPanel />}

            {/* Inbox Modal */}
            {inboxAccount && (
                <EmailInbox
                    key={inboxAccount.id}
                    accountId={inboxAccount.id}
                    accountName={inboxAccount.name}
                    onClose={() => setInboxAccount(null)}
                />
            )}

            {/* Editor Modal */}
            <AccountEditorModal
                isOpen={showModal}
                editingAccount={editingAccount}
                onClose={() => setShowModal(false)}
                onSaveSuccess={fetchAccounts}
            />
        </div>
    );
}
