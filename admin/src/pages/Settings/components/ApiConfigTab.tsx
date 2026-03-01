/**
 * API 配置选项卡
 * @author zhangws
 */

import React from 'react';
import type { ConnectionStatus } from '../types';
import styles from './ApiConfigTab.module.css';

interface ApiConfigTabProps {
    apiUrl: string;
    apiKey: string;
    testingConnection: boolean;
    connectionStatus: ConnectionStatus;
    onApiUrlChange: (url: string) => void;
    onApiKeyChange: (key: string) => void;
    onTestConnection: () => void;
    onSaveConfig: () => void;
}

export const ApiConfigTab: React.FC<ApiConfigTabProps> = ({
    apiUrl,
    apiKey,
    testingConnection,
    connectionStatus,
    onApiUrlChange,
    onApiKeyChange,
    onTestConnection,
    onSaveConfig,
}) => {
    return (
        <div className={styles.section}>
            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <div>
                        <h3 className={styles.cardTitle}>API 连接配置</h3>
                        <p className={styles.cardSubtitle}>配置 NeverForget Workers 的 API 地址和密钥</p>
                    </div>
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label}>API 地址</label>
                    <input
                        type="url"
                        className={styles.input}
                        placeholder="例如：https://never-forget.your-account.workers.dev"
                        value={apiUrl}
                        onChange={(e) => onApiUrlChange(e.target.value)}
                    />
                    <div className={styles.hint}>Cloudflare Workers 部署后的 URL 地址</div>
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label}>API 密钥</label>
                    <input
                        type="password"
                        className={styles.input}
                        placeholder="输入您的 API Key"
                        value={apiKey}
                        onChange={(e) => onApiKeyChange(e.target.value)}
                    />
                    <div className={styles.hint}>部署时通过 wrangler secret put API_KEYS 设置的密钥</div>
                </div>

                {/* 连接状态 */}
                {connectionStatus !== 'idle' && (
                    <div className={`${styles.alert} ${connectionStatus === 'success' ? styles.alertSuccess : styles.alertError}`}>
                        {connectionStatus === 'success' ? (
                            <>✅ 连接成功！API 服务正常运行</>
                        ) : (
                            <>❌ 连接失败，请检查 API 地址和密钥</>
                        )}
                    </div>
                )}

                <div className={styles.actions}>
                    <button className={styles.btnSecondary} onClick={onTestConnection} disabled={testingConnection}>
                        {testingConnection ? (
                            <>
                                <span className={styles.spinner} />
                                测试中...
                            </>
                        ) : (
                            '🔍 测试连接'
                        )}
                    </button>
                    <button className={styles.btnPrimary} onClick={onSaveConfig}>
                        💾 保存配置
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ApiConfigTab;
