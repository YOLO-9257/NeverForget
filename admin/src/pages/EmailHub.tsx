import { useState } from 'react';
import { ExternalAccountsPanel } from '../components/ExternalAccountsPanel';
import { EmailForwardingPanel } from '../components/EmailForwardingPanel';
import styles from './EmailHub.module.css';

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

            <div className={styles.tabs}>
                <button
                    className={`${styles.tab} ${activeTab === 'accounts' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('accounts')}
                >
                    📫 外部邮箱 (External Mailboxes)
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'forwarding' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('forwarding')}
                >
                    📨 转发服务 (Forwarding Service)
                </button>
            </div>

            <div className="tab-content">
                {activeTab === 'accounts' && <ExternalAccountsPanel />}
                {activeTab === 'forwarding' && <EmailForwardingPanel />}
            </div>
        </div>
    );
}
