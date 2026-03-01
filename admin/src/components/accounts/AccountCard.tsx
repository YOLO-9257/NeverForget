/**
 * 账户卡片组件
 * @author zhangws
 */

import React from 'react';
import type { EmailAccount } from './types';
import styles from './AccountCard.module.css';

export interface AccountCardProps {
    account: EmailAccount;
    onEdit: (account: EmailAccount) => void;
    onDelete: (id: string, e: React.MouseEvent) => void;
    onSync: (id: string, e: React.MouseEvent) => void;
    onViewInbox: (account: EmailAccount) => void;
}

export const AccountCard: React.FC<AccountCardProps> = ({
    account,
    onEdit,
    onDelete,
    onSync,
    onViewInbox,
}) => {
    const getSyncStatusBadge = () => {
        switch (account.sync_status) {
            case 'syncing':
                return <span className={`${styles.badge} ${styles.badgeSyncing}`}>同步中...</span>;
            case 'error':
                return <span className={`${styles.badge} ${styles.badgeError}`}>同步失败</span>;
            default:
                return account.last_sync ? (
                    <span className={styles.lastSync}>
                        上次同步: {new Date(account.last_sync).toLocaleString()}
                    </span>
                ) : null;
        }
    };

    return (
        <div
            className={`${styles.card} ${!account.enabled ? styles.disabled : ''}`}
            onClick={() => onViewInbox(account)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onViewInbox(account)}
        >
            <div className={styles.header}>
                <div className={styles.info}>
                    <div className={styles.name}>{account.name}</div>
                    <div className={styles.email}>{account.email}</div>
                </div>
                <div className={styles.status}>
                    {account.enabled ? (
                        <span className={`${styles.badge} ${styles.badgeActive}`}>已启用</span>
                    ) : (
                        <span className={`${styles.badge} ${styles.badgeInactive}`}>已禁用</span>
                    )}
                </div>
            </div>

            <div className={styles.meta}>
                <div className={styles.metaItem}>
                    📧 {account.email_count ?? 0} 封邮件
                </div>
                {(account.pending_count || 0) > 0 && (
                    <div className={styles.metaItem}>
                        ⏳ 待处理 {account.pending_count}
                    </div>
                )}
                {(account.failed_count || 0) > 0 && (
                    <div className={styles.metaItem}>
                        ❌ 失败 {account.failed_count}
                    </div>
                )}
                <div className={styles.metaItem}>
                    🔐 {account.use_ssl ? 'SSL' : '无 SSL'}
                </div>
                {account.auto_push && (
                    <div className={styles.metaItem}>
                        📤 自动推送
                    </div>
                )}
                {account.ai_spam_filter && (
                    <div className={styles.metaItem}>
                        🤖 AI 过滤
                    </div>
                )}
                {account.ai_profile_id && (
                    <div className={styles.metaItem}>
                        🧠 已绑定模型
                    </div>
                )}
            </div>

            <div className={styles.syncStatus}>
                {getSyncStatusBadge()}
            </div>

            <div className={styles.actions}>
                <button
                    className={styles.actionBtn}
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit(account);
                    }}
                    title="编辑"
                >
                    ✏️
                </button>
                <button
                    className={styles.actionBtn}
                    onClick={(e) => onSync(account.id, e)}
                    disabled={account.sync_status === 'syncing'}
                    title="同步"
                >
                    🔄
                </button>
                <button
                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                    onClick={(e) => onDelete(account.id, e)}
                    title="删除"
                >
                    🗑️
                </button>
            </div>
        </div>
    );
};

export default AccountCard;
