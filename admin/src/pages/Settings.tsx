import { useState, useEffect } from 'react';
import { testConnection } from '../api';

/**
 * 系统设置页面
 * 管理 API 配置、推送服务设置等
 */
export function Settings() {
    const [activeTab, setActiveTab] = useState<'api' | 'push' | 'about'>('api');

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

    // 加载保存的设置
    useEffect(() => {
        const savedApiUrl = localStorage.getItem('api_url') || '';
        const savedApiKey = localStorage.getItem('api_key') || '';
        const savedPushConfig = localStorage.getItem('default_push_config');
        const savedNotifications = localStorage.getItem('notification_settings');

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

    // 导出所有设置
    const handleExportSettings = () => {
        const settings = {
            api_url: apiUrl,
            api_key: apiKey,
            default_push_config: defaultPushConfig,
            notification_settings: notifications,
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

        setApiUrl('');
        setApiKey('');
        setDefaultPushConfig({ appid: '', secret: '', template_id: '', push_service_url: 'http://1.94.168.67:5566' });
        setNotifications({ enableSound: true, enableDesktop: false });

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

                        <div className="form-actions">
                            <button className="btn btn-primary" onClick={handleSavePushConfig}>
                                💾 保存配置
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
                                    <span className="about-value">v1.0.0</span>
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
                            导出的设置包括 API 配置、推送配置、通知设置和自定义消息模板
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
        </div>
    );
}
