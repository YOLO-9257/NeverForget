import { useState, useEffect } from 'react';
import { emailSettingsApi, configApi, type EmailSettingsResponse, type EmailForwardLog, type SavedConfig } from '../api';

/**
 * 邮件转发服务配置面板
 * @author zhangws
 * 
 * 提供邮件监听与 WxPush 转发的配置界面
 * (原 EmailSettingsTab 的重构版，去除了 IMAP Client 部分)
 */
export function EmailForwardingPanel() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [statusMessage, setStatusMessage] = useState('');

    // 邮件设置
    const [settings, setSettings] = useState<EmailSettingsResponse>({
        enabled: false,
        email_address: null,
        wxpush_token: null,
        wxpush_url: null,
        forward_rules: null,

        // 推送配置
        push_config: null,
        template_name: null,

        // IMAP Settings (保留字段但不显示/编辑，以免 breakage)
        enable_imap: false,
        imap_host: null,
        imap_port: null,
        imap_user: null,
        imap_tls: true,
        last_sync_at: null,
        sync_status: null,
        sync_error: null,

        total_forwarded: 0,
        last_forwarded_at: null,
    });

    // 表单状态
    const [wxpushToken, setWxpushToken] = useState('');
    const [wxpushUrl, setWxpushUrl] = useState('');
    const [forwardRules, setForwardRules] = useState('');

    // 推送配置状态
    const [pushConfig, setPushConfig] = useState<{
        appid: string;
        secret: string;
        userid: string;
        template_id: string;
    }>({ appid: '', secret: '', userid: '', template_id: '' });
    const [templateName, setTemplateName] = useState('');
    const [useDefaultConfig, setUseDefaultConfig] = useState(true);

    // 转发日志
    const [logs, setLogs] = useState<EmailForwardLog[]>([]);
    const [logsTotal, setLogsTotal] = useState(0);
    const [showLogs, setShowLogs] = useState(false);

    // 保存的配置
    const [savedPushConfigs, setSavedPushConfigs] = useState<SavedConfig[]>([]);

    // 计算当前匹配的配置 ID
    const matchedConfigId = savedPushConfigs.find(c => {
        try {
            const v = JSON.parse(c.value);
            return v.appid === pushConfig.appid &&
                v.secret === pushConfig.secret &&
                v.userid === pushConfig.userid &&
                v.template_id === pushConfig.template_id;
        } catch { return false; }
    })?.id || '';

    // 加载设置
    useEffect(() => {
        loadSettings();
        loadPushConfigs();
    }, []);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const response = await emailSettingsApi.get();
            if (response.data) {
                setSettings(response.data);
                setWxpushUrl(response.data.wxpush_url || '');
                setForwardRules(response.data.forward_rules || '');

                // 初始化推送配置状态
                if (response.data.push_config) {
                    setUseDefaultConfig(false);
                    setPushConfig(response.data.push_config);
                } else {
                    setUseDefaultConfig(true);
                    // 尝试从本地存储加载默认配置
                    const savedDefault = localStorage.getItem('default_push_config');
                    if (savedDefault) {
                        try {
                            setPushConfig(JSON.parse(savedDefault));
                        } catch (e) { }
                    }
                }
                setTemplateName(response.data.template_name || '');
            }
        } catch (error) {
            console.error('加载邮件设置失败:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadPushConfigs = async () => {
        try {
            const res = await configApi.list('push_config');
            if (res.data) {
                setSavedPushConfigs(res.data);
            }
        } catch (error) {
            console.error('加载配置列表失败:', error);
        }
    };

    // 保存设置
    const handleSave = async () => {
        try {
            setSaving(true);
            setStatus('idle');

            const updateData: any = {
                enabled: settings.enabled,
                wxpush_url: wxpushUrl || null,
                forward_rules: forwardRules || null,

                // 推送配置
                push_config: useDefaultConfig ? null : pushConfig,
                template_name: templateName || null,
            };

            // 只有当用户输入了新 token 时才更新
            if (wxpushToken) {
                updateData.wxpush_token = wxpushToken;
            }

            const response = await emailSettingsApi.update(updateData);
            if (response.data) {
                setSettings(response.data);
                setStatus('success');
                setStatusMessage('设置已保存');
                setWxpushToken(''); // 清空输入框
            }
        } catch (error) {
            setStatus('error');
            setStatusMessage(error instanceof Error ? error.message : '保存失败');
        } finally {
            setSaving(false);
        }
    };

    // 测试转发
    const handleTest = async () => {
        try {
            setTesting(true);
            setStatus('idle');

            const response = await emailSettingsApi.test();
            if (response.data) {
                setStatus('success');
                setStatusMessage(response.data.message);
            }
        } catch (error) {
            setStatus('error');
            setStatusMessage(error instanceof Error ? error.message : '测试失败');
        } finally {
            setTesting(false);
        }
    };

    // 加载日志
    const loadLogs = async () => {
        try {
            const response = await emailSettingsApi.getLogs({ limit: 20 });
            if (response.data && Array.isArray(response.data.items)) {
                setLogs(response.data.items);
                setLogsTotal(response.data.total);
            } else {
                setLogs([]);
                setLogsTotal(0);
            }
        } catch (error) {
            console.error('加载日志失败:', error);
        }
    };

    // 展开日志时加载
    useEffect(() => {
        if (showLogs) {
            loadLogs();
        }
    }, [showLogs]);

    if (loading) {
        return (
            <div className="card">
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <span className="spinner" />
                    <p style={{ marginTop: '12px' }}>加载中...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="email-forwarding-panel">
            <div className="card">
                <div className="card-header">
                    <div>
                        <h3 className="card-title">📧 邮件转发配置</h3>
                        <p className="card-subtitle">
                            配置邮件监听与 WxPush 转发，将发送到您专属邮箱的邮件自动推送到微信
                        </p>
                    </div>
                </div>

                {/* 专属邮箱地址展示 */}
                {settings.email_address && (
                    <div className="form-group">
                        <label className="form-label">您的专属收件地址</label>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '12px 16px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '8px',
                            fontFamily: 'monospace',
                            fontSize: '14px',
                        }}>
                            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
                                {settings.email_address}
                            </span>
                            <button
                                className="btn btn-sm"
                                style={{ marginLeft: 'auto', padding: '4px 12px' }}
                                onClick={() => {
                                    navigator.clipboard.writeText(settings.email_address || '');
                                    alert('已复制到剪贴板');
                                }}
                            >
                                📋 复制
                            </button>
                        </div>
                        <div className="form-hint">
                            将此地址作为收件人，发送到此邮箱的邮件将自动转发到您的微信
                        </div>
                    </div>
                )}

                {/* 启用开关 */}
                <div className="form-group">
                    <label className="toggle-item" style={{ cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={settings.enabled}
                            onChange={(e) => setSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                        />
                        <span className="toggle-label">
                            <span className="toggle-title">启用邮件转发</span>
                            <span className="toggle-desc">开启后，发送到专属邮箱的邮件将自动转发到微信</span>
                        </span>
                    </label>
                </div>

                {/* 推送通知配置 */}
                <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🔔 推送配置
                    </label>

                    {/* 配置模式选择 */}
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <label className="checkbox-item">
                            <input
                                type="radio"
                                name="pushConfigMode"
                                checked={useDefaultConfig}
                                onChange={() => setUseDefaultConfig(true)}
                            />
                            <span>跟随系统默认配置 (推荐)</span>
                        </label>
                        <label className="checkbox-item">
                            <input
                                type="radio"
                                name="pushConfigMode"
                                checked={!useDefaultConfig}
                                onChange={() => setUseDefaultConfig(false)}
                            />
                            <span>自定义配置 (AppID, Secret 等)</span>
                        </label>

                        {!useDefaultConfig && (
                            <div style={{ marginLeft: 'auto' }}>
                                <select
                                    className="form-input"
                                    style={{ width: 'auto', padding: '4px 8px', fontSize: '13px', height: '30px' }}
                                    value={matchedConfigId}
                                    onChange={(e) => {
                                        const cfg = savedPushConfigs.find(c => c.id === Number(e.target.value));
                                        if (cfg) {
                                            try {
                                                const val = JSON.parse(cfg.value);
                                                setPushConfig({
                                                    appid: val.appid || '',
                                                    secret: val.secret || '',
                                                    userid: val.userid || '',
                                                    template_id: val.template_id || ''
                                                });
                                                setWxpushToken(val.userid || ''); // 同步更新 Token 字段以保持兼容
                                            } catch { }
                                        }
                                    }}
                                >
                                    <option value="" disabled>从保存的配置加载...</option>
                                    {savedPushConfigs.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {!useDefaultConfig && (
                        <div style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '16px' }}>
                            <div className="form-row" style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                                <div style={{ flex: 1 }}>
                                    <label className="form-label" style={{ fontSize: '13px' }}>AppID</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="wx..."
                                        value={pushConfig.appid}
                                        onChange={(e) => setPushConfig({ ...pushConfig, appid: e.target.value })}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label className="form-label" style={{ fontSize: '13px' }}>AppSecret</label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        placeholder="Secret"
                                        value={pushConfig.secret}
                                        onChange={(e) => setPushConfig({ ...pushConfig, secret: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="form-row" style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                                <div style={{ flex: 1 }}>
                                    <label className="form-label" style={{ fontSize: '13px' }}>用户 UID *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="UID_..."
                                        value={useDefaultConfig ? '' : (pushConfig.userid || wxpushToken)}
                                        onChange={(e) => {
                                            setPushConfig({ ...pushConfig, userid: e.target.value });
                                            setWxpushToken(e.target.value); // 保持兼容
                                        }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label className="form-label" style={{ fontSize: '13px' }}>消息模板 ID</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="可选"
                                        value={pushConfig.template_id}
                                        onChange={(e) => setPushConfig({ ...pushConfig, template_id: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* WxPush Token (仅在默认模式显示，用于兼容) */}
                    {useDefaultConfig && (
                        <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label className="form-label" style={{ fontSize: '14px' }}>WxPush UID (用户ID) *</label>
                            <input
                                type="password"
                                className="form-input"
                                placeholder={settings.wxpush_token ? `当前：${settings.wxpush_token}（输入新值以更新）` : '输入您的 WxPush UID'}
                                value={wxpushToken}
                                onChange={(e) => setWxpushToken(e.target.value)}
                            />
                            <div className="form-hint">
                                使用系统默认的推送服务通道，仅需提供您的 UID 即可接收通知。
                            </div>
                        </div>
                    )}

                    {/* 模板名称覆盖 */}
                    <div className="form-group">
                        <label className="form-label" style={{ fontSize: '14px' }}>推送卡片标题 (可选)</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="默认: NeverForget 邮件提醒"
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                        />
                        <div className="form-hint">
                            自定义推送到微信卡片上的标题文字
                        </div>
                    </div>
                </div>

                {/* 高级配置 */}
                <details style={{ marginBottom: '16px' }}>
                    <summary
                        style={{
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            fontSize: '14px',
                            marginBottom: '12px',
                        }}
                    >
                        ⚙️ 高级配置（可选）
                    </summary>

                    <div className="form-group">
                        <label className="form-label">自定义 WxPush 服务地址</label>
                        <input
                            type="url"
                            className="form-input"
                            placeholder="https://wxpusher.zjiecode.com"
                            value={wxpushUrl}
                            onChange={(e) => setWxpushUrl(e.target.value)}
                        />
                        <div className="form-hint">
                            留空使用默认官方地址，或输入自建 WxPusher 服务地址
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">转发规则配置 (JSON)</label>
                        <textarea
                            className="form-input"
                            rows={10}
                            placeholder={`{
  "block_senders": ["spam@example.com"],
  "allow_senders": ["boss@company.com"],
  "block_keywords": ["广告", "退订"],
  "match_keywords": ["重要"]
}`}
                            value={forwardRules}
                            onChange={(e) => setForwardRules(e.target.value)}
                            style={{ fontFamily: 'monospace', fontSize: '13px' }}
                        />
                        <div className="form-hint">
                            配置 JSON 格式的转发规则，支持黑白名单和关键词过滤。
                        </div>
                    </div>
                </details>

                {/* 状态提示 */}
                {status !== 'idle' && (
                    <div className={`alert ${status === 'success' ? 'alert-success' : 'alert-error'}`}>
                        {status === 'success' ? '✅ ' : '❌ '}
                        {statusMessage}
                    </div>
                )}

                {/* 操作按钮 */}
                <div className="form-actions">
                    <button
                        className="btn btn-secondary"
                        onClick={handleTest}
                        disabled={testing || (useDefaultConfig ? (!settings.wxpush_token && !wxpushToken) : !pushConfig.userid)}
                    >
                        {testing ? (
                            <>
                                <span className="spinner-sm" />
                                测试中...
                            </>
                        ) : (
                            '🔔 发送测试推送'
                        )}
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? (
                            <>
                                <span className="spinner-sm" />
                                保存中...
                            </>
                        ) : (
                            '💾 保存配置'
                        )}
                    </button>
                </div>
            </div>

            {/* 统计信息 */}
            <div className="card" style={{ marginTop: '24px' }}>
                <div className="card-header">
                    <div>
                        <h3 className="card-title">📊 转发统计</h3>
                    </div>
                </div>

                <div className="about-details">
                    <div className="about-row">
                        <span className="about-label">已转发邮件</span>
                        <span className="about-value">{settings.total_forwarded} 封</span>
                    </div>
                    <div className="about-row">
                        <span className="about-label">最后转发时间</span>
                        <span className="about-value">
                            {settings.last_forwarded_at
                                ? new Date(settings.last_forwarded_at).toLocaleString('zh-CN')
                                : '暂无记录'}
                        </span>
                    </div>
                </div>

                {/* 转发日志 */}
                <details
                    style={{ padding: '16px', borderTop: '1px solid var(--border)' }}
                    onToggle={(e) => setShowLogs((e.target as HTMLDetailsElement).open)}
                >
                    <summary
                        style={{
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            fontSize: '14px',
                        }}
                    >
                        📜 查看转发日志（最近 {logsTotal} 条）
                    </summary>

                    {logs.length > 0 ? (
                        <div style={{ marginTop: '12px' }}>
                            <table className="data-table" style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th>时间</th>
                                        <th>发件人</th>
                                        <th>主题</th>
                                        <th>状态</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((log) => (
                                        <tr key={log.id}>
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                {new Date(log.received_at).toLocaleString('zh-CN')}
                                            </td>
                                            <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {log.from_address}
                                            </td>
                                            <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {log.subject || '(无主题)'}
                                            </td>
                                            <td>
                                                <span className={`badge ${log.status === 'success' ? 'badge-success' : 'badge-error'}`}>
                                                    {log.status === 'success' ? '✓ 成功' : '✗ 失败'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '14px' }}>
                            暂无转发记录
                        </p>
                    )}
                </details>
            </div>
        </div>
    );
}
