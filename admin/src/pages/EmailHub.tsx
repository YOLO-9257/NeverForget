import { useState } from 'react';
import { ExternalAccountsPanel } from '../components/ExternalAccountsPanel';
import { EmailForwardingPanel } from '../components/EmailForwardingPanel';

/**
 * 邮箱中心主页面
 * 集成外部邮箱账号管理与邮件转发服务配置
 */
export function EmailHub() {
    const [activeTab, setActiveTab] = useState<'accounts' | 'forwarding'>('accounts');

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">邮箱中心 (Email Hub)</h1>
                <p className="page-subtitle">统一管理邮件转发服务与外部邮箱同步，实现全方位邮件通知</p>
            </div>

            <div className="tabs" style={{ marginBottom: '24px', borderBottom: '1px solid var(--border)' }}>
                <button
                    className={`tab ${activeTab === 'accounts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('accounts')}
                    style={{
                        padding: '12px 24px',
                        cursor: 'pointer',
                        borderBottom: activeTab === 'accounts' ? '2px solid var(--primary)' : 'none',
                        color: activeTab === 'accounts' ? 'var(--primary)' : 'var(--text-secondary)',
                        background: 'transparent',
                        border: 'none',
                        borderBottomWidth: '2px',
                        borderBottomStyle: 'solid',
                        borderBottomColor: activeTab === 'accounts' ? 'var(--primary)' : 'transparent',
                        fontWeight: 500
                    }}
                >
                    📫 外部邮箱 (External Mailboxes)
                </button>
                <button
                    className={`tab ${activeTab === 'forwarding' ? 'active' : ''}`}
                    onClick={() => setActiveTab('forwarding')}
                    style={{
                        padding: '12px 24px',
                        cursor: 'pointer',
                        borderBottom: activeTab === 'forwarding' ? '2px solid var(--primary)' : 'none',
                        color: activeTab === 'forwarding' ? 'var(--primary)' : 'var(--text-secondary)',
                        background: 'transparent',
                        border: 'none',
                        borderBottomWidth: '2px',
                        borderBottomStyle: 'solid',
                        borderBottomColor: activeTab === 'forwarding' ? 'var(--primary)' : 'transparent',
                        fontWeight: 500
                    }}
                >
                    📨 转发服务 (Forwarding Service)
                </button>
            </div>

            <div className="tab-content">
                {activeTab === 'accounts' && <ExternalAccountsPanel />}
                {activeTab === 'forwarding' && <EmailForwardingPanel />}
            </div>

            <style>{`
                .tab:hover {
                    color: var(--primary) !important;
                }
            `}</style>
        </div>
    );
}
