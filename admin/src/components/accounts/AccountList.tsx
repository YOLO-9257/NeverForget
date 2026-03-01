/**
 * 账户列表组件
 * @author zhangws
 */

import React from 'react';
import type { EmailAccount } from './types';
import { AccountCard } from './AccountCard';
import styles from './AccountList.module.css';

export interface AccountListProps {
    accounts: EmailAccount[];
    loading: boolean;
    onEdit: (account: EmailAccount) => void;
    onDelete: (id: string, e: React.MouseEvent) => void;
    onSync: (id: string, e: React.MouseEvent) => void;
    onViewInbox: (account: EmailAccount) => void;
}

export const AccountList: React.FC<AccountListProps> = ({
    accounts,
    loading,
    onEdit,
    onDelete,
    onSync,
    onViewInbox,
}) => {
    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner}></div>
                <span>加载中...</span>
            </div>
        );
    }

    if (accounts.length === 0) {
        return (
            <div className={styles.empty}>
                <div className={styles.emptyIcon}>📭</div>
                <h3>暂无邮箱账户</h3>
                <p>点击"添加账号"按钮添加您的第一个邮箱账户</p>
            </div>
        );
    }

    return (
        <div className={styles.grid}>
            {accounts.map((account) => (
                <AccountCard
                    key={account.id}
                    account={account}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onSync={onSync}
                    onViewInbox={onViewInbox}
                />
            ))}
        </div>
    );
};

export default AccountList;
