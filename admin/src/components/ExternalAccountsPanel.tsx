import { useState, useEffect } from 'react';
import { EmailInbox } from './EmailInbox';
import { ConfigManagerModal } from './ConfigManagerModal';
import { EmailBlacklistPanel } from './EmailBlacklistPanel';
import { EmailRulesPanel } from './EmailRulesPanel';
import { configApi, type SavedConfig } from '../api';

// 类型定义
interface EmailAccount {
    id: string;
    name: string;
    imap_host: string;
    imap_user: string;
    imap_port: number;
    imap_tls: number;
    push_config?: string; // JSON
    push_url?: string;
    template_name?: string;
    enabled: number;
    last_sync_at: number;
    sync_status: 'idle' | 'syncing' | 'error';
    sync_error: string;
    total_forwarded: number;
    auto_push?: number; // 0 | 1
    enable_ai_spam_filter?: number; // 0 | 1
}

interface Template {
    id: string;
    name: string;
    template_id: string;
}

/**
 * 外部邮箱账户管理面板
 * 管理 IMAP 账户列表
 */
export function ExternalAccountsPanel() {
    const [accounts, setAccounts] = useState<EmailAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'accounts' | 'blacklist' | 'rules'>('accounts');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [inboxAccount, setInboxAccount] = useState<EmailAccount | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        imap_host: '',
        imap_port: 993,
        imap_user: '',
        imap_password: '',
        imap_tls: true,
        push_url: '',
        template_name: '',
        poll_interval: 10,
        auto_push: true,
        enable_ai_spam_filter: false,
    });

    // 推送配置
    const [useDefaultConfig, setUseDefaultConfig] = useState(true);
    const [pushConfig, setPushConfig] = useState({
        appid: '',
        secret: '',
        userid: '',
        template_id: ''
    });

    const [templates, setTemplates] = useState<Template[]>([]);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);

    const apiUrl = localStorage.getItem('api_url') || '';
    const authToken = localStorage.getItem('auth_token') || '';

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
    };

    // Push configs state
    const [pushConfigs, setPushConfigs] = useState<SavedConfig[]>([]);
    const [savedUserIds, setSavedUserIds] = useState<SavedConfig[]>([]);
    const [savedTemplateIds, setSavedTemplateIds] = useState<SavedConfig[]>([]);
    const [manageModal, setManageModal] = useState<{ open: boolean; category: string; title: string }>({ open: false, category: '', title: '' });

    // Calculate matched config ID
    const matchedConfigId = pushConfigs.find(c => {
        try {
            const val = JSON.parse(c.value);
            return val.appid === pushConfig.appid &&
                val.secret === pushConfig.secret &&
                val.userid === pushConfig.userid &&
                val.template_id === pushConfig.template_id;
        } catch { return false; }
    })?.id || '';

    useEffect(() => {
        fetchAccounts();
        fetchTemplates();
        fetchAllPushConfigs();
    }, []);

    const fetchAllPushConfigs = async () => {
        try {
            const [configs, userIds, templateIds] = await Promise.all([
                configApi.list('push_config'),
                configApi.list('wxpush_userid'),
                configApi.list('wxpush_templateid')
            ]);
            if (configs.data) setPushConfigs(configs.data);
            if (userIds.data) setSavedUserIds(userIds.data);
            if (templateIds.data) setSavedTemplateIds(templateIds.data);
        } catch (e) { console.error('加载配置失败', e); }
    };

    // Effect to pre-fill from saved configs if system defaults are missing and we are in Custom mode
    useEffect(() => {
        if (!useDefaultConfig && !pushConfig.appid && pushConfigs.length > 0) {
            // If we switched to Custom and it's empty, and we have saved configs, use the first one as a template
            // This addresses "reuse configuration"
            try {
                const val = JSON.parse(pushConfigs[0].value);
                setPushConfig({
                    appid: val.appid || '',
                    secret: val.secret || '',
                    userid: val.userid || '',
                    template_id: val.template_id || ''
                });
            } catch { }
        }
    }, [useDefaultConfig, pushConfigs]);

    const fetchAccounts = async () => {
        try {
            const res = await fetch(`${apiUrl}/api/email/accounts`, { headers });
            const data = await res.json();
            if (data.code === 0 && Array.isArray(data.data)) {
                setAccounts(data.data);
            } else {
                setAccounts([]);
            }
        } catch (e) {
            console.error('加载账户失败', e);
        } finally {
            setLoading(false);
        }
    };

    const fetchTemplates = async () => {
        try {
            const res = await fetch(`${apiUrl}/api/configs?category=template`, { headers });
            const data = await res.json();
            if (data.code === 0 && Array.isArray(data.data)) {
                const list = data.data.map((item: any) => {
                    try {
                        const val = JSON.parse(item.value);
                        return { id: item.id, name: item.name, template_id: val.template_id };
                    } catch { return null; }
                }).filter(Boolean);
                setTemplates(list);
            }
        } catch (e) { console.error(e); }
    };

    const handleSync = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            setAccounts(prev => prev.map(a => a.id === id ? { ...a, sync_status: 'syncing' } : a));
            const res = await fetch(`${apiUrl}/api/email/accounts/${id}/sync`, { method: 'POST', headers });
            const json = await res.json();

            if (json.code === 0) {
                // 同步成功，显示结果
                alert(json.message || '同步完成');
            } else {
                // 同步失败，显示错误
                alert(`同步失败: ${json.message || '未知错误'}`);
            }
            // 刷新账户列表
            fetchAccounts();
        } catch (e) {
            alert('同步请求失败');
            fetchAccounts();
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
        } catch (e) {
            alert('删除失败');
        }
    };

    const handleSave = async () => {
        if (!formData.name || !formData.imap_host || !formData.imap_user) {
            alert('请补全必填信息');
            return;
        }
        if (!editingId && !formData.imap_password) {
            alert('请输入 IMAP 密码');
            return;
        }

        try {
            const url = editingId ? `${apiUrl}/api/email/accounts/${editingId}` : `${apiUrl}/api/email/accounts`;
            const method = editingId ? 'PUT' : 'POST';
            const payload: any = {
                ...formData,
                auto_push: formData.auto_push ? 1 : 0,
                enable_ai_spam_filter: formData.enable_ai_spam_filter ? 1 : 0
            };
            if (editingId && !payload.imap_password) delete payload.imap_password;

            // 添加推送配置
            if (!useDefaultConfig && (pushConfig.appid || pushConfig.userid)) {
                payload.push_config = pushConfig;
            } else {
                payload.push_config = null;
            }

            const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
            const json = await res.json();
            if (json.code === 0) {
                setShowModal(false);
                fetchAccounts();
                resetForm();
            } else {
                alert(json.message);
            }
        } catch (e) {
            alert('保存失败');
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            imap_host: '',
            imap_port: 993,
            imap_user: '',
            imap_password: '',
            imap_tls: true,
            push_url: '',
            template_name: '',
            poll_interval: 10,
            auto_push: true,
            enable_ai_spam_filter: false
        });
        setUseDefaultConfig(true);

        // Load default config for better UX when switching to Custom
        const savedDefault = localStorage.getItem('default_push_config');
        if (savedDefault) {
            try {
                const def = JSON.parse(savedDefault);
                setPushConfig({
                    appid: def.appid || '',
                    secret: def.secret || '',
                    userid: '',
                    template_id: def.template_id || ''
                });
            } catch {
                setPushConfig({ appid: '', secret: '', userid: '', template_id: '' });
            }
        } else {
            setPushConfig({ appid: '', secret: '', userid: '', template_id: '' });
        }

        setEditingId(null);
        setTestResult(null);
    };

    const openEdit = (acc: EmailAccount) => {
        setEditingId(acc.id);
        setFormData({
            name: acc.name,
            imap_host: acc.imap_host,
            imap_port: acc.imap_port || 993,
            imap_user: acc.imap_user,
            imap_password: '',
            imap_tls: acc.imap_tls === 1,
            push_url: acc.push_url || '',
            template_name: acc.template_name || '',
            poll_interval: 10,
            auto_push: acc.auto_push !== 0,
            enable_ai_spam_filter: acc.enable_ai_spam_filter === 1
        });
        // 解析推送配置
        if (acc.push_config) {
            try {
                const cfg = JSON.parse(acc.push_config);
                setUseDefaultConfig(false);
                setPushConfig({
                    appid: cfg.appid || '',
                    secret: cfg.secret || '',
                    userid: cfg.userid || '',
                    template_id: cfg.template_id || ''
                });
            } catch {
                setUseDefaultConfig(true);
                // Load defaults if parse fails
                const savedDefault = localStorage.getItem('default_push_config');
                if (savedDefault) {
                    try {
                        const def = JSON.parse(savedDefault);
                        setPushConfig({
                            appid: def.appid || '',
                            secret: def.secret || '',
                            userid: '',
                            template_id: def.template_id || ''
                        });
                    } catch {
                        setPushConfig({ appid: '', secret: '', userid: '', template_id: '' });
                    }
                } else {
                    setPushConfig({ appid: '', secret: '', userid: '', template_id: '' });
                }
            }
        } else {
            setUseDefaultConfig(true);
            // Load defaults so they are ready if user switches to Custom
            const savedDefault = localStorage.getItem('default_push_config');
            if (savedDefault) {
                try {
                    const def = JSON.parse(savedDefault);
                    setPushConfig({
                        appid: def.appid || '',
                        secret: def.secret || '',
                        userid: '',
                        template_id: def.template_id || ''
                    });
                } catch {
                    setPushConfig({ appid: '', secret: '', userid: '', template_id: '' });
                }
            } else {
                setPushConfig({ appid: '', secret: '', userid: '', template_id: '' });
            }
        }
        setShowModal(true);
    };

    const handleTestConnection = async () => {
        if (editingId && !formData.imap_password) {
            alert('编辑模式下，需重新输入密码才能进行连接测试');
            return;
        }
        setTesting(true);
        setTestResult(null);
        try {
            const res = await fetch(`${apiUrl}/api/email/test`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    imap_host: formData.imap_host,
                    imap_port: formData.imap_port,
                    imap_user: formData.imap_user,
                    imap_password: formData.imap_password,
                    imap_tls: formData.imap_tls
                })
            });
            const json = await res.json();
            if (json.code === 0) {
                setTestResult({ success: true, msg: '连接成功' });
            } else {
                setTestResult({ success: false, msg: json.message || '连接失败' });
            }
        } catch (e) {
            setTestResult({ success: false, msg: '请求失败' });
        } finally {
            setTesting(false);
        }
    };

    const handlePushConfigSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedId = e.target.value;
        if (!selectedId) return;

        const config = pushConfigs.find(c => c.id.toString() === selectedId);
        if (config) {
            try {
                const val = JSON.parse(config.value);
                setPushConfig({
                    appid: val.appid || '',
                    secret: val.secret || '',
                    userid: val.userid || '',
                    template_id: val.template_id || ''
                });
                setUseDefaultConfig(false);
            } catch (e) {
                console.error('Invalid config value', e);
            }
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h3 className="card-title">📫 外部邮箱列表</h3>
                    <p className="card-subtitle">添加并管理外部邮箱（Gmail, QQ 等），系统将定时拉取邮件并推送到微信</p>
                </div>
                {activeTab === 'accounts' && (
                    <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
                        添加账号
                    </button>
                )}
            </div>

            <div className="tabs" style={{ display: 'flex', gap: '20px', marginBottom: '24px', borderBottom: '1px solid var(--border)' }}>
                <button className={`tab-btn ${activeTab === 'accounts' ? 'active' : ''}`} onClick={() => setActiveTab('accounts')} style={{ padding: '10px 0', borderBottom: activeTab === 'accounts' ? '2px solid var(--primary)' : 'none', fontWeight: activeTab === 'accounts' ? 600 : 400, color: activeTab === 'accounts' ? 'var(--primary)' : 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>邮箱账户</button>
                <button className={`tab-btn ${activeTab === 'blacklist' ? 'active' : ''}`} onClick={() => setActiveTab('blacklist')} style={{ padding: '10px 0', borderBottom: activeTab === 'blacklist' ? '2px solid var(--primary)' : 'none', fontWeight: activeTab === 'blacklist' ? 600 : 400, color: activeTab === 'blacklist' ? 'var(--primary)' : 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>黑名单管理</button>
                <button className={`tab-btn ${activeTab === 'rules' ? 'active' : ''}`} onClick={() => setActiveTab('rules')} style={{ padding: '10px 0', borderBottom: activeTab === 'rules' ? '2px solid var(--primary)' : 'none', fontWeight: activeTab === 'rules' ? 600 : 400, color: activeTab === 'rules' ? 'var(--primary)' : 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>过滤规则</button>
            </div>

            {activeTab === 'blacklist' && <EmailBlacklistPanel />}
            {activeTab === 'rules' && <EmailRulesPanel />}

            {activeTab === 'accounts' && (
                loading ? (
                    <div className="loading"><div className="spinner" /></div>
                ) : (
                    <div className="grid-list">
                        {accounts.map(acc => (
                            <div key={acc.id} className="card email-account-card" onClick={() => openEdit(acc)}>
                                <div className="account-header">
                                    <div className="account-icon">📧</div>
                                    <div className="account-info">
                                        <h3>{acc.name}</h3>
                                        <p className="subtitle">{acc.imap_user}</p>
                                    </div>
                                    <div className="account-status">
                                        {acc.sync_status === 'syncing' ? (
                                            <span className="badge badge-warning">同步中...</span>
                                        ) : acc.sync_status === 'error' ? (
                                            <span className="badge badge-failed" title={acc.sync_error}>错误</span>
                                        ) : (
                                            <span className="badge badge-active">就绪</span>
                                        )}
                                    </div>
                                </div>

                                <div className="account-stats">
                                    <div className="stat-item">
                                        <span className="label">已转发</span>
                                        <span className="value">{acc.total_forwarded}</span>
                                    </div>
                                    <div className="stat-item">
                                        <span className="label">上次同步</span>
                                        <span className="value text-sm">
                                            {acc.last_sync_at ? new Date(acc.last_sync_at).toLocaleString() : '从未'}
                                        </span>
                                    </div>
                                </div>

                                <div className="account-actions">
                                    <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setInboxAccount(acc); }}>
                                        📬 邮件
                                    </button>
                                    <button className="btn btn-secondary btn-sm" onClick={(e) => handleSync(acc.id, e)} disabled={acc.sync_status === 'syncing'}>
                                        立即刷新
                                    </button>
                                    <button className="btn btn-ghost btn-sm" onClick={(e) => handleDelete(acc.id, e)} style={{ color: 'var(--error)' }}>
                                        删除
                                    </button>
                                </div>
                            </div>
                        ))}

                        {accounts.length === 0 && (
                            <div className="empty-state">
                                <div className="empty-state-icon">📭</div>
                                <p>暂无邮箱账号，请点击右上角添加</p>
                            </div>
                        )}
                    </div>
                )
            )}

            {/* Inbox Modal */}
            {inboxAccount && (
                <EmailInbox
                    accountId={inboxAccount.id}
                    accountName={inboxAccount.name}
                    onClose={() => setInboxAccount(null)}
                />
            )}

            {/* Modal Overlay */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>{editingId ? '编辑账户' : '添加账户'}</h3>
                            <button className="btn-close" onClick={() => setShowModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            {/* Basic Info Section */}
                            <div className="form-section">
                                <div className="form-section-header">
                                    <span className="section-icon">👤</span>
                                    <h4 className="form-section-title">基本信息</h4>
                                </div>
                                <div className="form-grid">
                                    <div className="form-group form-full">
                                        <label>账户名称</label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input
                                                type="text"
                                                className="input"
                                                value={formData.name}
                                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                                placeholder="例如：工作邮箱"
                                                autoFocus
                                            />
                                        </div>
                                    </div>
                                    <div className="form-group form-full">
                                        <label>邮箱地址 (用户名)</label>
                                        <input
                                            type="text"
                                            className="input"
                                            value={formData.imap_user}
                                            onChange={e => setFormData({ ...formData, imap_user: e.target.value })}
                                            placeholder="your-email@example.com"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Server Configuration Section */}
                            <div className="form-section">
                                <div className="form-section-header">
                                    <span className="section-icon">🔌</span>
                                    <h4 className="form-section-title">IMAP 服务器配置</h4>
                                </div>
                                <div className="form-grid">
                                    <div className="form-group">
                                        <label>服务器地址 (Host)</label>
                                        <input
                                            type="text"
                                            className="input"
                                            value={formData.imap_host}
                                            onChange={e => setFormData({ ...formData, imap_host: e.target.value })}
                                            placeholder="imap.example.com"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>端口 (Port)</label>
                                        <input
                                            type="number"
                                            className="input"
                                            value={formData.imap_port}
                                            onChange={e => setFormData({ ...formData, imap_port: parseInt(e.target.value) })}
                                        />
                                    </div>
                                    <div className="form-group form-full">
                                        <label>密码 / 授权码 {editingId && <span className="text-muted" style={{ fontWeight: 'normal', fontSize: '12px' }}>(留空则不修改)</span>}</label>
                                        <input
                                            type="password"
                                            className="input"
                                            value={formData.imap_password}
                                            onChange={e => setFormData({ ...formData, imap_password: e.target.value })}
                                            placeholder="••••••••"
                                        />
                                    </div>
                                    <div className="form-group form-full" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                                        <label className="toggle-switch">
                                            <input
                                                type="checkbox"
                                                checked={formData.imap_tls}
                                                onChange={e => setFormData({ ...formData, imap_tls: e.target.checked })}
                                            />
                                            <span className="toggle-track"><span className="toggle-handle"></span></span>
                                            <span>启用 SSL/TLS 加密</span>
                                        </label>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {testResult && (
                                                <span style={{
                                                    color: testResult.success ? 'var(--success)' : 'var(--error)',
                                                    fontSize: '13px',
                                                    fontWeight: 500
                                                }}>
                                                    {testResult.success ? '✅ ' : '❌ '}{testResult.msg}
                                                </span>
                                            )}
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={handleTestConnection}
                                                disabled={testing}
                                                style={{ minWidth: '80px' }}
                                            >
                                                {testing ? '测试中...' : '测试连接'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Push Configuration Section */}
                            <div className="form-section">
                                <div className="form-section-header">
                                    <span className="section-icon">📲</span>
                                    <h4 className="form-section-title">推送设置</h4>
                                </div>

                                <div style={{ marginBottom: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <label className="toggle-switch" style={{ width: 'auto' }}>
                                            <input
                                                type="checkbox"
                                                checked={formData.auto_push}
                                                onChange={e => setFormData({ ...formData, auto_push: e.target.checked })}
                                            />
                                            <span className="toggle-track"><span className="toggle-handle"></span></span>
                                            <span style={{ fontWeight: 500 }}>自动推送新邮件</span>
                                        </label>
                                        <span className="text-muted" style={{ fontSize: '12px' }}>
                                            开启后，每当检测到新邮件将立刻发送微信推送
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <label className="toggle-switch" style={{ width: 'auto' }}>
                                            <input
                                                type="checkbox"
                                                checked={formData.enable_ai_spam_filter}
                                                onChange={e => setFormData({ ...formData, enable_ai_spam_filter: e.target.checked })}
                                            />
                                            <span className="toggle-track"><span className="toggle-handle"></span></span>
                                            <span style={{ fontWeight: 500 }}>AI 垃圾邮件过滤</span>
                                        </label>
                                        <span className="text-muted" style={{ fontSize: '12px' }}>
                                            使用 AI 辅助识别垃圾邮件 (需配置密钥)
                                        </span>
                                    </div>
                                </div>

                                {formData.auto_push && (
                                    <div className="bg-tertiary" style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                                        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                <input type="radio" name="pushMode" checked={useDefaultConfig} onChange={() => setUseDefaultConfig(true)} />
                                                <span>跟随系统全局配置</span>
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                <input type="radio" name="pushMode" checked={!useDefaultConfig} onChange={() => setUseDefaultConfig(false)} />
                                                <span>为此账户独立配置</span>
                                            </label>

                                            {!useDefaultConfig && (
                                                <div style={{ marginLeft: 'auto' }}>
                                                    <select
                                                        className="input"
                                                        style={{ width: '200px', padding: '6px 10px', fontSize: '13px' }}
                                                        onChange={handlePushConfigSelect}
                                                        value={matchedConfigId}
                                                    >
                                                        <option value="" disabled>📥 从保存的配置加载...</option>
                                                        {pushConfigs.map(c => (
                                                            <option key={c.id} value={c.id}>{c.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </div>

                                        {!useDefaultConfig && (
                                            <div className="form-grid">
                                                <div className="form-group">
                                                    <label>AppID</label>
                                                    <input
                                                        type="text"
                                                        className="input"
                                                        placeholder="wx..."
                                                        value={pushConfig.appid}
                                                        onChange={e => setPushConfig({ ...pushConfig, appid: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>AppSecret</label>
                                                    <input
                                                        type="password"
                                                        className="input"
                                                        placeholder="Secret..."
                                                        value={pushConfig.secret}
                                                        onChange={e => setPushConfig({ ...pushConfig, secret: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group form-full">
                                                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>接收用户 UID *</span>
                                                        <button
                                                            className="btn btn-ghost btn-xs"
                                                            onClick={() => setManageModal({ open: true, category: 'wxpush_userid', title: '常用用户 ID' })}
                                                            title="管理常用 UID"
                                                        >
                                                            ⚙️ 管理
                                                        </button>
                                                    </label>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <input
                                                            type="text"
                                                            className="input"
                                                            placeholder="UID_..."
                                                            value={pushConfig.userid}
                                                            onChange={e => setPushConfig({ ...pushConfig, userid: e.target.value })}
                                                            style={{ flex: 1 }}
                                                        />
                                                        {savedUserIds.length > 0 && (
                                                            <select
                                                                className="input"
                                                                style={{ width: '120px' }}
                                                                value=""
                                                                onChange={e => { if (e.target.value) setPushConfig({ ...pushConfig, userid: e.target.value }); }}
                                                            >
                                                                <option value="">⚡ 快速填入</option>
                                                                {savedUserIds.map(c => <option key={c.id} value={c.value}>{c.name}</option>)}
                                                            </select>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="form-group form-full">
                                                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>模板 ID (可选)</span>
                                                        <button
                                                            className="btn btn-ghost btn-xs"
                                                            onClick={() => setManageModal({ open: true, category: 'wxpush_templateid', title: '常用模板 ID' })}
                                                            title="管理常用模板"
                                                        >
                                                            ⚙️ 管理
                                                        </button>
                                                    </label>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <input
                                                            type="text"
                                                            className="input"
                                                            placeholder="未填写则使用默认模板"
                                                            value={pushConfig.template_id}
                                                            onChange={e => setPushConfig({ ...pushConfig, template_id: e.target.value })}
                                                            style={{ flex: 1 }}
                                                        />
                                                        {savedTemplateIds.length > 0 && (
                                                            <select
                                                                className="input"
                                                                style={{ width: '120px' }}
                                                                value=""
                                                                onChange={e => { if (e.target.value) setPushConfig({ ...pushConfig, template_id: e.target.value }); }}
                                                            >
                                                                <option value="">⚡ 快速填入</option>
                                                                {savedTemplateIds.map(tpl => <option key={tpl.id} value={tpl.value}>{tpl.name}</option>)}
                                                            </select>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Scheduling Section */}
                            <div className="form-section" style={{ marginBottom: 0 }}>
                                <div className="form-section-header">
                                    <span className="section-icon">⏱️</span>
                                    <h4 className="form-section-title">调度与模板</h4>
                                </div>
                                <div className="form-grid">
                                    <div className="form-group">
                                        <label>轮询检查间隔</label>
                                        <select
                                            className="input"
                                            value={formData.poll_interval}
                                            onChange={e => setFormData({ ...formData, poll_interval: parseInt(e.target.value) })}
                                        >
                                            <option value={5}>每 5 分钟 (推荐)</option>
                                            <option value={10}>每 10 分钟</option>
                                            <option value={30}>每 30 分钟</option>
                                            <option value={60}>每 1 小时</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>消息摘要模板</label>
                                        <select
                                            className="input"
                                            value={formData.template_name}
                                            onChange={e => setFormData({ ...formData, template_name: e.target.value })}
                                        >
                                            <option value="">默认 (标题+发件人)</option>
                                            {templates.map(t => (
                                                <option key={t.id} value={t.name}>{t.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>取消</button>
                            <button className="btn btn-primary" onClick={handleSave} style={{ minWidth: '100px' }}>保存</button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        .grid-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 24px;
        }
        .email-account-card {
            background: var(--bg-card);
            border-radius: 12px;
            border: 1px solid var(--border);
            padding: 24px;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        }
        .email-account-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 12px 24px -10px rgba(0, 0, 0, 0.15);
            border-color: var(--primary);
        }
        .email-account-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 4px;
            height: 100%;
            background: var(--primary);
            opacity: 0;
            transition: opacity 0.2s;
        }
        .email-account-card:hover::before {
            opacity: 1;
        }
        
        .account-header {
            display: flex;
            align-items: flex-start;
            gap: 16px;
            margin-bottom: 24px;
        }
        .account-icon {
            font-size: 28px;
            background: linear-gradient(135deg, rgba(var(--primary-rgb), 0.1), rgba(var(--primary-rgb), 0.05));
            color: var(--primary);
            width: 56px;
            height: 56px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 16px;
            flex-shrink: 0;
        }
        .account-info { flex: 1; min-width: 0; }
        .account-info h3 { 
            margin: 0 0 6px 0; 
            font-size: 18px; 
            font-weight: 600; 
            color: var(--text-primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .account-info .subtitle { 
            margin: 0; 
            font-size: 14px; 
            color: var(--text-secondary); 
            font-family: monospace;
            opacity: 0.8;
        }
        
        .account-status {
            position: absolute;
            top: 24px;
            right: 24px;
        }
        .badge {
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
        }
        .badge-active { background: rgba(var(--success-rgb), 0.1); color: rgb(var(--success-rgb)); }
        .badge-warning { background: rgba(var(--warning-rgb), 0.1); color: rgb(var(--warning-rgb)); }
        .badge-failed { background: rgba(var(--error-rgb), 0.1); color: rgb(var(--error-rgb)); }

        .account-stats {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            padding: 16px;
            background: var(--bg-tertiary);
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .stat-item { display: flex; flex-direction: column; gap: 4px; }
        .stat-item .label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
        .stat-item .value { font-weight: 600; font-size: 15px; color: var(--text-primary); }
        
        .account-actions {
            display: flex;
            gap: 12px;
            padding-top: 16px;
            border-top: 1px solid var(--border-light);
        }
        .account-actions button {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }

        /* Modern Modal Styles */
        .modal-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            animation: fadeIn 0.2s ease-out;
        }
        .modal-content {
            width: 800px;
            max-width: 95vw;
            max-height: 90vh;
            background: var(--bg-card);
            border-radius: 16px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        .modal-header {
            padding: 24px 32px;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--bg-card);
        }
        .modal-header h3 { 
            margin: 0; 
            font-size: 20px; 
            font-weight: 600; 
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .modal-header h3::before {
            content: '';
            display: block;
            width: 4px;
            height: 24px;
            background: var(--primary);
            border-radius: 2px;
        }
        
        .modal-body { 
            flex: 1; 
            overflow-y: auto; 
            padding: 32px; 
            background: var(--bg-tertiary); /* Light background for form area */
        }

        .modal-footer {
            padding: 24px 32px;
            background: var(--bg-card);
            border-top: 1px solid var(--border);
            display: flex;
            justify-content: flex-end;
            gap: 16px;
        }

        /* Form Design */
        .form-section {
            background: var(--bg-card);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            border: 1px solid var(--border-light);
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .form-section-header {
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--border-light);
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .form-section-title {
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary);
            margin: 0;
            border: none; /* Override old style */
            padding: 0;
        }
        .section-icon { font-size: 18px; }

        .form-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        .form-full { grid-column: span 2; }
        
        .form-group { margin-bottom: 0; }
        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-size: 13px;
            font-weight: 500;
            color: var(--text-secondary);
        }
        
        .input {
            width: 100%;
            padding: 10px 14px;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: var(--bg-input);
            color: var(--text-primary);
            font-size: 14px;
            transition: all 0.2s;
        }
        .input:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(var(--primary-rgb), 0.1);
            background: var(--bg-card);
        }
        .input::placeholder { color: var(--text-muted); opacity: 0.6; }

        /* Custom Toggle Switch */
        .toggle-switch {
            display: flex;
            align-items: center;
            gap: 12px;
            cursor: pointer;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid var(--border);
            background: var(--bg-input);
            transition: all 0.2s;
        }
        .toggle-switch:hover { border-color: var(--border-hover); }
        .toggle-switch input { display: none; }
        .toggle-track {
            width: 40px;
            height: 22px;
            background: var(--text-muted);
            border-radius: 11px;
            position: relative;
            transition: background 0.3s;
        }
        .toggle-handle {
            width: 18px;
            height: 18px;
            background: white;
            border-radius: 50%;
            position: absolute;
            top: 2px;
            left: 2px;
            transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        input:checked + .toggle-track { background: var(--success); }
        input:checked + .toggle-track .toggle-handle { transform: translateX(18px); }

        /* Animations */
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
            {/* Config Manager Modal */}
            {manageModal.open && (
                <ConfigManagerModal
                    isOpen={manageModal.open}
                    onClose={() => {
                        setManageModal(prev => ({ ...prev, open: false }));
                        fetchAllPushConfigs();
                    }}
                    category={manageModal.category}
                    title={manageModal.title}
                    onSelect={(val) => {
                        if (manageModal.category === 'wxpush_userid') setPushConfig(prev => ({ ...prev, userid: val }));
                        if (manageModal.category === 'wxpush_templateid') setPushConfig(prev => ({ ...prev, template_id: val }));
                    }}
                />
            )}
        </div>
    );
}
