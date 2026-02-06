import { useState, useEffect } from 'react';
import { testConnection } from '../api';
import { getAiProfiles, saveAiProfiles, generateContent } from '../utils/ai';
import type { AiProfile, AiProvider } from '../utils/ai';
import { ConfigManagerModal } from '../components/ConfigManagerModal';
import { configApi } from '../api';


/**
 * 系统设置页面
 * 管理 API 配置、推送服务设置、AI 配置等
 */
export function Settings() {
    const [activeTab, setActiveTab] = useState<'api' | 'push' | 'ai' | 'about'>('api');

    // API 配置
    const [apiUrl, setApiUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [testingConnection, setTestingConnection] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

    // 默认推送配置
    const [defaultPushConfig, setDefaultPushConfig] = useState({
        appid: '',
        secret: '',
        template_id: '',
        push_service_url: 'http://1.94.168.67:5566', // 默认推送服务地址
    });

    // 通知设置
    const [notifications, setNotifications] = useState({
        enableSound: true,
        enableDesktop: false,
    });

    // AI Profiles 配置
    const [aiProfiles, setAiProfiles] = useState<AiProfile[]>([]);
    const [editingProfile, setEditingProfile] = useState<Partial<AiProfile> | null>(null);
    const [testingLlm, setTestingLlm] = useState(false);
    const [llmStatus, setLlmStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [manageModal, setManageModal] = useState<{ open: boolean; category: string; title: string }>({ open: false, category: '', title: '' });

    // 加载保存的设置
    useEffect(() => {
        const savedApiUrl = localStorage.getItem('api_url') || '';
        const savedApiKey = localStorage.getItem('api_key') || '';
        const savedPushConfig = localStorage.getItem('default_push_config');
        const savedNotifications = localStorage.getItem('notification_settings');

        setAiProfiles(getAiProfiles());

        setApiUrl(savedApiUrl);
        setApiKey(savedApiKey);

        if (savedPushConfig) {
            try {
                setDefaultPushConfig(JSON.parse(savedPushConfig));
            } catch { }
        }

        if (savedNotifications) {
            try {
                setNotifications(JSON.parse(savedNotifications));
            } catch { }
        }
    }, []);

    // 测试 API 连接
    const handleTestConnection = async () => {
        if (!apiUrl || !apiKey) {
            alert('请先填写 API 地址和密钥');
            return;
        }

        setTestingConnection(true);
        setConnectionStatus('idle');

        try {
            const success = await testConnection(apiUrl, apiKey);
            setConnectionStatus(success ? 'success' : 'error');
        } catch {
            setConnectionStatus('error');
        } finally {
            setTestingConnection(false);
        }
    };

    // 保存 API 配置
    const handleSaveApiConfig = () => {
        localStorage.setItem('api_url', apiUrl);
        localStorage.setItem('api_key', apiKey);
        alert('API 配置已保存');
    };

    // 保存推送配置
    const handleSavePushConfig = () => {
        localStorage.setItem('default_push_config', JSON.stringify(defaultPushConfig));
        alert('推送配置已保存');
    };

    // 保存通知设置
    const handleSaveNotifications = () => {
        localStorage.setItem('notification_settings', JSON.stringify(notifications));
        alert('通知设置已保存');
    };

    // --- AI Profile Management ---

    const handleAddProfile = () => {
        setEditingProfile({
            id: crypto.randomUUID(),
            name: 'New Model',
            provider: 'gemini',
            apiKey: '',
            baseUrl: '',
            model: '',
            isDefault: aiProfiles.length === 0 // 第一个自动设为默认
        });
        setLlmStatus('idle');
    };

    const handleEditProfile = (profile: AiProfile) => {
        setEditingProfile({ ...profile });
        setLlmStatus('idle');
    };

    const handleDeleteProfile = (id: string) => {
        if (!confirm('确定要删除这个模型配置吗？')) return;
        const newProfiles = aiProfiles.filter(p => p.id !== id);
        setAiProfiles(newProfiles);
        saveAiProfiles(newProfiles);
    };

    const handleSaveProfile = () => {
        if (!editingProfile || !editingProfile.id || !editingProfile.name || !editingProfile.apiKey) {
            alert('请填写名称和 API Key');
            return;
        }

        const newProfile = editingProfile as AiProfile;

        // 如果设为默认，取消其他默认
        let updatedProfiles = [...aiProfiles];
        if (newProfile.isDefault) {
            updatedProfiles = updatedProfiles.map(p => ({ ...p, isDefault: false }));
        }

        const existingIndex = updatedProfiles.findIndex(p => p.id === newProfile.id);
        if (existingIndex >= 0) {
            updatedProfiles[existingIndex] = newProfile;
        } else {
            updatedProfiles.push(newProfile);
        }

        // 确保至少有一个默认
        if (updatedProfiles.length > 0 && !updatedProfiles.some(p => p.isDefault)) {
            updatedProfiles[0].isDefault = true;
        }

        setAiProfiles(updatedProfiles);
        saveAiProfiles(updatedProfiles);
        setEditingProfile(null);
    };

    const handleCancelEdit = () => {
        setEditingProfile(null);
    };

    const handleTestProfile = async () => {
        if (!editingProfile || !editingProfile.apiKey) {
            alert('请先填写 API Key');
            return;
        }

        setTestingLlm(true);
        setLlmStatus('idle');

        try {
            await generateContent('Hello, reply with OK', undefined, undefined);
            // 注意：generateContent 是基于已保存的 profile 调用的，这里我们需要一种方式测试未保存的
            // 为了简单，我们只测试连接。
            // 实际上 fetch 逻辑都在 ai.ts 里。我们可以暂时模拟，或者直接调用 ai.ts 里未导出的函数?
            // 更好的方式是保存后再测试，或者让 generateContent 支持传入临时配置。
            // 此时 generateContent 只接受 profileId。

            // 妥协方案：临时构造请求（代码重复，但在 UI层测试连接可以接受）
            // 或者：直接在 ai.ts 导出 callGeminiApi 供测试用？不想暴露内部实现。
            // 让我们在 UI 里简单 fetch 测试一下，类似之前的 Settings.tsx 实现

            const config = editingProfile;
            let response: Response;

            if (config.provider === 'gemini') {
                const baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
                const model = config.model || 'gemini-2.0-flash';
                response = await fetch(`${baseUrl}/models/${model}:generateContent?key=${config.apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: 'Hi' }] }],
                        generationConfig: { maxOutputTokens: 5 },
                    }),
                });
            } else {
                const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
                const model = config.model || 'gpt-4o-mini';
                response = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${config.apiKey}`,
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: 'user', content: 'Hi' }],
                        max_tokens: 5,
                    }),
                });
            }

            if (response.ok) {
                setLlmStatus('success');
            } else {
                setLlmStatus('error');
            }
        } catch (e) {
            console.error(e);
            setLlmStatus('error');
        } finally {
            setTestingLlm(false);
        }
    };

    // 导出所有设置
    const handleExportSettings = () => {
        const settings = {
            api_url: apiUrl,
            api_key: apiKey,
            default_push_config: defaultPushConfig,
            notification_settings: notifications,
            ai_profiles: aiProfiles,
            message_templates: localStorage.getItem('message_templates'),
            exported_at: new Date().toISOString(),
        };

        const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `never-forget-settings-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // 导入设置
    const handleImportSettings = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const settings = JSON.parse(text);

                if (settings.api_url) {
                    setApiUrl(settings.api_url);
                    localStorage.setItem('api_url', settings.api_url);
                }
                if (settings.api_key) {
                    setApiKey(settings.api_key);
                    localStorage.setItem('api_key', settings.api_key);
                }
                if (settings.default_push_config) {
                    setDefaultPushConfig(settings.default_push_config);
                    localStorage.setItem('default_push_config', JSON.stringify(settings.default_push_config));
                }
                if (settings.notification_settings) {
                    setNotifications(settings.notification_settings);
                    localStorage.setItem('notification_settings', JSON.stringify(settings.notification_settings));
                }
                if (settings.ai_profiles) {
                    setAiProfiles(settings.ai_profiles);
                    saveAiProfiles(settings.ai_profiles);
                }
                if (settings.message_templates) {
                    localStorage.setItem('message_templates', settings.message_templates);
                }

                alert('设置已成功导入');
            } catch {
                alert('导入失败：无效的配置文件');
            }
        };
        input.click();
    };

    // 清除所有数据
    const handleClearData = () => {
        if (!confirm('确定要清除所有本地数据吗？此操作不可恢复。')) {
            return;
        }

        localStorage.removeItem('api_url');
        localStorage.removeItem('api_key');
        localStorage.removeItem('default_push_config');
        localStorage.removeItem('notification_settings');
        localStorage.removeItem('message_templates');
        localStorage.removeItem('ai_profiles');
        localStorage.removeItem('llm_api_config'); // cleanup old

        setApiUrl('');
        setApiKey('');
        setDefaultPushConfig({ appid: '', secret: '', template_id: '', push_service_url: 'http://1.94.168.67:5566' });
        setNotifications({ enableSound: true, enableDesktop: false });
        setAiProfiles([]);

        alert('所有数据已清除');
    };

    return (
        <div>
            {/* 页面标题 */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">系统设置</h1>
                    <p className="page-subtitle">管理 API 连接、推送配置和系统选项</p>
                </div>
            </div>

            {/* 设置选项卡 */}
            <div className="tabs" style={{ marginBottom: '24px' }}>
                <button
                    className={`tab ${activeTab === 'api' ? 'active' : ''}`}
                    onClick={() => setActiveTab('api')}
                >
                    🔗 API 配置
                </button>
                <button
                    className={`tab ${activeTab === 'push' ? 'active' : ''}`}
                    onClick={() => setActiveTab('push')}
                >
                    📱 推送设置
                </button>

                <button
                    className={`tab ${activeTab === 'ai' ? 'active' : ''}`}
                    onClick={() => setActiveTab('ai')}
                >
                    🧠 AI 模型池
                </button>
                <button
                    className={`tab ${activeTab === 'about' ? 'active' : ''}`}
                    onClick={() => setActiveTab('about')}
                >
                    ℹ️ 关于
                </button>
            </div>

            {/* API 配置 */}
            {activeTab === 'api' && (
                <div className="settings-section">
                    <div className="card">
                        <div className="card-header">
                            <div>
                                <h3 className="card-title">API 连接配置</h3>
                                <p className="card-subtitle">配置 NeverForget Workers 的 API 地址和密钥</p>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">API 地址</label>
                            <input
                                type="url"
                                className="form-input"
                                placeholder="例如：https://never-forget.your-account.workers.dev"
                                value={apiUrl}
                                onChange={(e) => setApiUrl(e.target.value)}
                            />
                            <div className="form-hint">
                                Cloudflare Workers 部署后的 URL 地址
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">API 密钥</label>
                            <input
                                type="password"
                                className="form-input"
                                placeholder="输入您的 API Key"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                            />
                            <div className="form-hint">
                                部署时通过 wrangler secret put API_KEYS 设置的密钥
                            </div>
                        </div>

                        {/* 连接状态 */}
                        {connectionStatus !== 'idle' && (
                            <div
                                className={`alert ${connectionStatus === 'success' ? 'alert-success' : 'alert-error'
                                    }`}
                            >
                                {connectionStatus === 'success' ? (
                                    <>✅ 连接成功！API 服务正常运行</>
                                ) : (
                                    <>❌ 连接失败，请检查 API 地址和密钥</>
                                )}
                            </div>
                        )}

                        <div className="form-actions">
                            <button
                                className="btn btn-secondary"
                                onClick={handleTestConnection}
                                disabled={testingConnection}
                            >
                                {testingConnection ? (
                                    <>
                                        <span className="spinner-sm" />
                                        测试中...
                                    </>
                                ) : (
                                    '🔍 测试连接'
                                )}
                            </button>
                            <button className="btn btn-primary" onClick={handleSaveApiConfig}>
                                💾 保存配置
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 推送设置 */}
            {activeTab === 'push' && (
                <div className="settings-section">
                    <div className="card">
                        <div className="card-header">
                            <div>
                                <h3 className="card-title">默认推送配置</h3>
                                <p className="card-subtitle">
                                    设置默认的微信推送配置，创建任务时可自动填充
                                </p>
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">AppID</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="公众号 AppID"
                                    value={defaultPushConfig.appid}
                                    onChange={(e) =>
                                        setDefaultPushConfig((prev) => ({ ...prev, appid: e.target.value }))
                                    }
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">AppSecret</label>
                                <input
                                    type="password"
                                    className="form-input"
                                    placeholder="公众号 AppSecret"
                                    value={defaultPushConfig.secret}
                                    onChange={(e) =>
                                        setDefaultPushConfig((prev) => ({ ...prev, secret: e.target.value }))
                                    }
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">默认模板 ID</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="微信消息模板 ID"
                                value={defaultPushConfig.template_id}
                                onChange={(e) =>
                                    setDefaultPushConfig((prev) => ({ ...prev, template_id: e.target.value }))
                                }
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">推送服务地址 (go-wxpush)</label>
                            <input
                                type="url"
                                className="form-input"
                                placeholder="例如：http://1.94.168.67:5566"
                                value={defaultPushConfig.push_service_url}
                                onChange={(e) =>
                                    setDefaultPushConfig((prev) => ({ ...prev, push_service_url: e.target.value }))
                                }
                            />
                            <div className="form-hint">
                                go-wxpush 服务的公网地址，用于发送微信推送消息
                            </div>
                        </div>

                        <div className="form-actions" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn-secondary" onClick={() => setManageModal({ open: true, category: 'push_config', title: '推送配置库' })}>
                                    📂 配置库
                                </button>
                                <button className="btn btn-ghost" onClick={async () => {
                                    const name = prompt('请输入配置名称 (用于库保存)', '我的推送配置');
                                    if (name) {
                                        try {
                                            await configApi.create({ category: 'push_config', name, value: JSON.stringify(defaultPushConfig) });
                                            alert('已保存到配置库');
                                        } catch (e) { alert('保存失败'); }
                                    }
                                }}>
                                    ✨ 保存当前到库
                                </button>
                            </div>
                            <button className="btn btn-primary" onClick={handleSavePushConfig}>
                                💾 保存本地
                            </button>
                        </div>
                    </div>

                    {/* 通知设置 */}
                    <div className="card" style={{ marginTop: '24px' }}>
                        <div className="card-header">
                            <div>
                                <h3 className="card-title">通知设置</h3>
                                <p className="card-subtitle">管理界面的通知提醒设置</p>
                            </div>
                        </div>

                        <div className="settings-toggles">
                            <label className="toggle-item">
                                <input
                                    type="checkbox"
                                    checked={notifications.enableSound}
                                    onChange={(e) =>
                                        setNotifications((prev) => ({
                                            ...prev,
                                            enableSound: e.target.checked,
                                        }))
                                    }
                                />
                                <span className="toggle-label">
                                    <span className="toggle-title">提示音</span>
                                    <span className="toggle-desc">操作完成时播放提示音</span>
                                </span>
                            </label>

                            <label className="toggle-item">
                                <input
                                    type="checkbox"
                                    checked={notifications.enableDesktop}
                                    onChange={(e) =>
                                        setNotifications((prev) => ({
                                            ...prev,
                                            enableDesktop: e.target.checked,
                                        }))
                                    }
                                />
                                <span className="toggle-label">
                                    <span className="toggle-title">桌面通知</span>
                                    <span className="toggle-desc">任务执行时发送桌面通知（需要浏览器授权）</span>
                                </span>
                            </label>
                        </div>

                        <div className="form-actions">
                            <button className="btn btn-primary" onClick={handleSaveNotifications}>
                                💾 保存设置
                            </button>
                        </div>
                    </div>
                </div>
            )}



            {/* AI/LLM 配置 (新版多模型) */}
            {activeTab === 'ai' && (
                <div className="settings-section">
                    {/* 模型列表 */}
                    {!editingProfile ? (
                        <div className="card">
                            <div className="card-header">
                                <div>
                                    <h3 className="card-title">🧠 AI 模型池</h3>
                                    <p className="card-subtitle">
                                        管理多个 AI 模型配置，可用于 NLP 解析、内容润色和趋势分析
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setManageModal({ open: true, category: 'ai_profile', title: 'AI 模型库' })}>
                                        📂 库管理
                                    </button>
                                    <button className="btn btn-primary btn-sm" onClick={handleAddProfile}>
                                        ➕ 添加模型
                                    </button>
                                </div>
                            </div>

                            <div className="profile-list">
                                {aiProfiles.length === 0 ? (
                                    <div className="empty-state" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        暂无配置的 AI 模型，请点击上方按钮添加。
                                    </div>
                                ) : (
                                    aiProfiles.map(profile => (
                                        <div key={profile.id} className="profile-item" style={{
                                            border: '1px solid var(--border)',
                                            borderRadius: '8px',
                                            padding: '16px',
                                            marginBottom: '12px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            backgroundColor: 'var(--bg-card)'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{
                                                    width: '40px', height: '40px', borderRadius: '50%',
                                                    backgroundColor: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '20px'
                                                }}>
                                                    {profile.provider === 'gemini' ? '💎' : '🤖'}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {profile.name}
                                                        {profile.isDefault && <span className="badge badge-primary">默认</span>}
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                        {profile.provider === 'gemini' ? 'Google Gemini' : 'OpenAI Compatible'} | {profile.model || 'Auto'}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button className="btn btn-ghost btn-sm" title="保存到库" onClick={async () => {
                                                    try {
                                                        await configApi.create({
                                                            category: 'ai_profile',
                                                            name: profile.name,
                                                            value: JSON.stringify(profile)
                                                        });
                                                        alert('已同步到云端库');
                                                    } catch (e) { alert('同步失败'); }
                                                }}>
                                                    ☁️
                                                </button>
                                                <button className="btn btn-secondary btn-sm" onClick={() => handleEditProfile(profile)}>
                                                    ✏️ 编辑
                                                </button>
                                                <button className="btn btn-danger btn-sm" onClick={() => handleDeleteProfile(profile.id)}>
                                                    🗑 删除
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    ) : (
                        // 编辑/新增模式
                        <div className="card">
                            <div className="card-header">
                                <div>
                                    <h3 className="card-title">{editingProfile.id === aiProfiles.find(p => p.id === editingProfile.id)?.id ? '✏️ 编辑模型' : '➕ 添加模型'}</h3>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">配置名称</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="例如：My Free Gemini"
                                    value={editingProfile.name}
                                    onChange={(e) => setEditingProfile(prev => ({ ...prev!, name: e.target.value }))}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">提供商</label>
                                <select
                                    className="form-select"
                                    value={editingProfile.provider}
                                    onChange={(e) => setEditingProfile(prev => ({
                                        ...prev!,
                                        provider: e.target.value as AiProvider,
                                        // Auto preset Base URL if switching
                                        baseUrl: e.target.value === 'gemini'
                                            ? ''
                                            : (e.target.value === 'openai' ? 'https://api.openai.com/v1' : '')
                                    }))}
                                >
                                    <option value="gemini">Google Gemini</option>
                                    <option value="openai">OpenAI</option>
                                    <option value="custom">Custom (OpenAI Compatible)</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">API Key *</label>
                                <input
                                    type="password"
                                    className="form-input"
                                    value={editingProfile.apiKey}
                                    onChange={(e) => setEditingProfile(prev => ({ ...prev!, apiKey: e.target.value }))}
                                />
                            </div>

                            {/* 高级选项 details */}
                            <details open={!!editingProfile.baseUrl || !!editingProfile.model}>
                                <summary style={{ cursor: 'pointer', marginBottom: '12px', color: 'var(--primary)' }}>高级设置</summary>
                                <div className="form-group">
                                    <label className="form-label">Base URL (可选)</label>
                                    <input
                                        type="url"
                                        className="form-input"
                                        placeholder="例如：https://api.openai.com/v1"
                                        value={editingProfile.baseUrl || ''}
                                        onChange={(e) => setEditingProfile(prev => ({ ...prev!, baseUrl: e.target.value }))}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">模型名称 (可选)</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder={editingProfile.provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o'}
                                        value={editingProfile.model || ''}
                                        onChange={(e) => setEditingProfile(prev => ({ ...prev!, model: e.target.value }))}
                                    />
                                </div>
                            </details>

                            <div className="form-group">
                                <label className="toggle-item">
                                    <input
                                        type="checkbox"
                                        checked={editingProfile.isDefault || false}
                                        onChange={(e) => setEditingProfile(prev => ({ ...prev!, isDefault: e.target.checked }))}
                                    />
                                    <span className="toggle-label">设为默认模型</span>
                                </label>
                            </div>

                            {/* 连接状态 */}
                            {llmStatus !== 'idle' && (
                                <div
                                    className={`alert ${llmStatus === 'success' ? 'alert-success' : 'alert-error'
                                        }`}
                                >
                                    {llmStatus === 'success' ? (
                                        <>✅ 测试通过！</>
                                    ) : (
                                        <>❌ 连接失败，请检查 API Key</>
                                    )}
                                </div>
                            )}

                            <div className="form-actions">
                                <button className="btn btn-secondary" onClick={handleTestProfile} disabled={testingLlm}>
                                    {testingLlm ? '测试中...' : '🔍 测试连接'}
                                </button>
                                <div style={{ flex: 1 }}></div>
                                <button className="btn btn-secondary" onClick={handleCancelEdit}>取消</button>
                                <button className="btn btn-primary" onClick={handleSaveProfile}>💾 保存</button>
                            </div>
                        </div>
                    )}

                    {/* 功能说明 */}
                    <div className="card" style={{ marginTop: '24px' }}>
                        <div className="card-header">
                            <div>
                                <h3 className="card-title">💡 功能说明</h3>
                            </div>
                        </div>

                        <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.8' }}>
                            <p><strong>多模型支持：</strong></p>
                            <ul style={{ marginLeft: '20px', marginTop: '8px' }}>
                                <li>您可以配置多个 API Key，例如同时使用 Gemini（免费）和 GPT-4。</li>
                                <li>通过设置「默认模型」，系统将在智能输入、润色等场景优先使用该模型。</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* 关于 */}
            {activeTab === 'about' && (
                <div className="settings-section">
                    {/* 系统信息 */}
                    <div className="card">
                        <div className="card-header">
                            <div>
                                <h3 className="card-title">系统信息</h3>
                            </div>
                        </div>

                        <div className="about-info">
                            <div className="about-logo">
                                <div className="about-logo-icon">⏰</div>
                                <div className="about-logo-text">
                                    <h2>NeverForget</h2>
                                    <p>分布式低成本定时提醒系统</p>
                                </div>
                            </div>

                            <div className="about-details">
                                <div className="about-row">
                                    <span className="about-label">版本</span>
                                    <span className="about-value">v1.2.0</span>
                                </div>
                                <div className="about-row">
                                    <span className="about-label">技术栈</span>
                                    <span className="about-value">Cloudflare Workers + D1 + React</span>
                                </div>
                                <div className="about-row">
                                    <span className="about-label">推送服务</span>
                                    <span className="about-value">go-wxpush</span>
                                </div>
                                <div className="about-row">
                                    <span className="about-label">开源协议</span>
                                    <span className="about-value">MIT License</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 数据管理 */}
                    <div className="card" style={{ marginTop: '24px' }}>
                        <div className="card-header">
                            <div>
                                <h3 className="card-title">数据管理</h3>
                                <p className="card-subtitle">导入、导出或清除本地设置数据</p>
                            </div>
                        </div>

                        <div className="data-actions">
                            <button className="btn btn-secondary" onClick={handleExportSettings}>
                                📤 导出设置
                            </button>
                            <button className="btn btn-secondary" onClick={handleImportSettings}>
                                📥 导入设置
                            </button>
                            <button className="btn btn-danger" onClick={handleClearData}>
                                🗑 清除所有数据
                            </button>
                        </div>

                        <div className="form-hint" style={{ marginTop: '16px' }}>
                            导出的设置包括 API 配置、推送配置、通知设置和 AI 模型配置
                        </div>
                    </div>

                    {/* 帮助链接 */}
                    <div className="card" style={{ marginTop: '24px' }}>
                        <div className="card-header">
                            <div>
                                <h3 className="card-title">帮助与支持</h3>
                            </div>
                        </div>

                        <div className="help-links">
                            <a href="#" className="help-link">
                                <span className="help-link-icon">📖</span>
                                <span className="help-link-text">
                                    <span className="help-link-title">部署文档</span>
                                    <span className="help-link-desc">查看完整的部署和配置指南</span>
                                </span>
                            </a>
                            <a href="#" className="help-link">
                                <span className="help-link-icon">🐛</span>
                                <span className="help-link-text">
                                    <span className="help-link-title">问题反馈</span>
                                    <span className="help-link-desc">在 GitHub 上提交 Issue</span>
                                </span>
                            </a>
                            <a href="#" className="help-link">
                                <span className="help-link-icon">💬</span>
                                <span className="help-link-text">
                                    <span className="help-link-title">讨论区</span>
                                    <span className="help-link-desc">加入社区讨论</span>
                                </span>
                            </a>
                        </div>
                    </div>
                </div>
            )}
            {/* 配置管理弹窗 */}
            {manageModal.open && (
                <ConfigManagerModal
                    isOpen={manageModal.open}
                    onClose={() => setManageModal(prev => ({ ...prev, open: false }))}
                    category={manageModal.category}
                    title={manageModal.title}
                    onSelect={(value) => {
                        try {
                            const val = JSON.parse(value);
                            if (manageModal.category === 'push_config') {
                                setDefaultPushConfig(val);
                                localStorage.setItem('default_push_config', value);
                                alert('已应用并保存推送配置');
                            }
                            if (manageModal.category === 'ai_profile') {
                                // 检查是否已存在
                                const profiles = getAiProfiles();
                                // 如果 val 是单个 profile
                                if (val.id) {
                                    if (profiles.find(p => p.id === val.id)) {
                                        if (confirm('模型池中已存在相同 ID 的模型，是否覆盖？')) {
                                            const newProfiles = profiles.map(p => p.id === val.id ? val : p);
                                            saveAiProfiles(newProfiles);
                                            setAiProfiles(newProfiles);
                                        }
                                    } else {
                                        const newProfiles = [...profiles, val];
                                        saveAiProfiles(newProfiles);
                                        setAiProfiles(newProfiles);
                                        alert('已添加到模型池');
                                    }
                                }
                            }
                        } catch (e) { alert('应用失败：' + e); }
                    }}
                />
            )}
        </div>
    );
}

export default Settings;
