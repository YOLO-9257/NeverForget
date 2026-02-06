import { useState, useEffect } from 'react';
import { authApi, getApiBaseUrl } from '../api';

interface LoginProps {
    onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
    // 默认使用 getApiBaseUrl() 获取 URL (含 .env 回退)
    const [apiUrl, setApiUrl] = useState(getApiBaseUrl());
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSetupMode, setIsSetupMode] = useState(false); // 是否为系统初始化模式
    const [savedUsername, setSavedUsername] = useState('');
    const [checkingInit, setCheckingInit] = useState(false);

    // 加载保存的 API URL 和上次登录的用户名
    useEffect(() => {
        const savedUrl = localStorage.getItem('api_url');
        const lastUser = localStorage.getItem('last_username');

        if (savedUrl) {
            setApiUrl(savedUrl);
            checkInit(savedUrl);
        }

        if (lastUser) {
            setSavedUsername(lastUser);
            setUsername(lastUser);
        }
    }, []);

    // 检查系统是否初始化
    // 检查系统是否初始化
    const checkInit = async (url: string) => {
        if (!url) return;
        setCheckingInit(true);
        try {
            const { initialized } = await authApi.checkInitStatus(url);
            setIsSetupMode(!initialized);
            // 这里不再从 API 获取用户名，改为依赖本地缓存
        } catch (e) {
            setIsSetupMode(false);
        } finally {
            setCheckingInit(false);
        }
    };

    // 当用户输入 URL 停止时触发检查 (简单的防抖)
    useEffect(() => {
        const timer = setTimeout(() => {
            if (apiUrl && apiUrl.startsWith('http')) {
                // 如果用户修改了 URL，也要保存到 localStorage (或者是 handleSubmit 时存？这里主要是为了实时 checkInit)
                checkInit(apiUrl);
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [apiUrl]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!apiUrl.trim() || !username.trim() || !password.trim()) {
            setError('请填写完整信息');
            return;
        }

        setLoading(true);
        setError(null);

        // 先保存 URL，以便 api 模块使用
        localStorage.setItem('api_url', apiUrl);

        try {
            if (isSetupMode) {
                // 初始化
                await authApi.setup(username, password);
                // 初始化成功后，自动登录
                const { token } = await authApi.login(username, password);
                localStorage.setItem('auth_token', token);
                localStorage.setItem('username', username);
                localStorage.setItem('last_username', username);
                onLogin();
            } else {
                // 登录
                const { token } = await authApi.login(username, password);
                localStorage.setItem('auth_token', token);
                localStorage.setItem('username', username);
                localStorage.setItem('last_username', username);
                onLogin();
            }
        } catch (err: any) {
            setError(err.message || '操作失败，请检查网络或账号密码');
        } finally {
            setLoading(false);
        }
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
                            placeholder="https://your-worker.workers.dev"
                            value={apiUrl}
                            onChange={(e) => setApiUrl(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">用户名</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder={isSetupMode ? "设置管理员用户名" : "输入用户名"}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">密码</label>
                        <input
                            type="password"
                            className="form-input"
                            placeholder={isSetupMode ? "设置管理员密码" : "输入密码"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
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

                    <div style={{ marginBottom: '16px' }}>
                        {checkingInit ? (
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>正在连接检测...</span>
                        ) : savedUsername ? (
                            <div style={{ fontSize: '12px', color: 'var(--success)', marginBottom: '8px' }}>
                                👋 欢迎回来，管理员 <b>{savedUsername}</b>
                            </div>
                        ) : isSetupMode ? (
                            <div style={{ fontSize: '12px', color: 'var(--primary)', marginBottom: '8px' }}>
                                🎉 检测到全新系统，将为您创建管理员账户
                            </div>
                        ) : null}
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary btn-lg"
                        style={{ width: '100%', marginBottom: '12px' }}
                        disabled={loading || checkingInit}
                    >
                        {loading ? '处理中...' : (isSetupMode ? '🚀 初始化并登录' : '🔐 登录')}
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
