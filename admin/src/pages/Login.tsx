import { useState, useEffect } from 'react';
import { testConnection } from '../api';

interface LoginProps {
    onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
    const [apiUrl, setApiUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 检查是否已有保存的配置
    useEffect(() => {
        const savedUrl = localStorage.getItem('api_url');
        const savedKey = localStorage.getItem('api_key');
        if (savedUrl && savedKey) {
            setApiUrl(savedUrl);
            setApiKey(savedKey);
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!apiUrl.trim() || !apiKey.trim()) {
            setError('请填写完整的 API 配置');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const success = await testConnection(apiUrl, apiKey);

            if (success) {
                localStorage.setItem('api_url', apiUrl);
                localStorage.setItem('api_key', apiKey);
                onLogin();
            } else {
                setError('连接失败，请检查 API 地址和 Key 是否正确');
            }
        } catch (err) {
            setError('连接失败，请检查网络或 API 配置');
        } finally {
            setLoading(false);
        }
    };

    // 跳过登录（演示模式）
    const handleSkip = () => {
        localStorage.setItem('demo_mode', 'true');
        onLogin();
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo">
                    <div className="login-logo-icon">⏰</div>
                    <h1 className="login-logo-title">NeverForget</h1>
                    <p className="login-logo-subtitle">定时提醒管理系统</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">API 地址</label>
                        <input
                            type="url"
                            className="form-input"
                            placeholder="https://never-forget.xxx.workers.dev"
                            value={apiUrl}
                            onChange={(e) => setApiUrl(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">API Key</label>
                        <input
                            type="password"
                            className="form-input"
                            placeholder="输入你的 API Key"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                        />
                    </div>

                    {error && (
                        <div
                            style={{
                                padding: '12px 16px',
                                borderRadius: 'var(--radius-md)',
                                marginBottom: '20px',
                                background: 'hsla(0, 75%, 55%, 0.15)',
                                border: '1px solid var(--error)',
                                color: 'var(--error)',
                                fontSize: '14px',
                            }}
                        >
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary btn-lg"
                        style={{ width: '100%', marginBottom: '12px' }}
                        disabled={loading}
                    >
                        {loading ? '连接中...' : '🔗 连接到 API'}
                    </button>

                    <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ width: '100%' }}
                        onClick={handleSkip}
                    >
                        📖 演示模式（跳过登录）
                    </button>
                </form>

                <div
                    style={{
                        marginTop: '24px',
                        paddingTop: '24px',
                        borderTop: '1px solid var(--border)',
                        fontSize: '13px',
                        color: 'var(--text-muted)',
                        textAlign: 'center',
                    }}
                >
                    <p>第一次使用？请先部署 NeverForget Workers</p>
                    <p style={{ marginTop: '8px' }}>
                        <a
                            href="https://github.com/YOLO-9257/NeverForget"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--primary-light)' }}
                        >
                            查看部署指南 →
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
