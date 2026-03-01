/**
 * 邮件地址和启用开关组件
 * @author zhangws
 */

import React from 'react';
import styles from './EmailAddressSection.module.css';

interface EmailAddressSectionProps {
    emailAddress: string | null;
    enabled: boolean;
    onEnabledChange: (enabled: boolean) => void;
}

export const EmailAddressSection: React.FC<EmailAddressSectionProps> = ({
    emailAddress,
    enabled,
    onEnabledChange,
}) => {
    const handleCopy = () => {
        if (emailAddress) {
            navigator.clipboard.writeText(emailAddress);
            alert('已复制到剪贴板');
        }
    };

    return (
        <>
            {/* 专属邮箱地址展示 */}
            {emailAddress && (
                <div className={styles.formGroup}>
                    <label className={styles.label}>您的专属收件地址</label>
                    <div className={styles.emailBox}>
                        <span className={styles.emailAddress}>{emailAddress}</span>
                        <button className={styles.copyBtn} onClick={handleCopy}>
                            📋 复制
                        </button>
                    </div>
                    <div className={styles.hint}>将此地址作为收件人，发送到此邮箱的邮件将自动转发到您的微信</div>
                </div>
            )}

            {/* 启用开关 */}
            <div className={styles.formGroup}>
                <label className={styles.toggleItem}>
                    <input type="checkbox" checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} />
                    <span className={styles.toggleLabel}>
                        <span className={styles.toggleTitle}>启用邮件转发</span>
                        <span className={styles.toggleDesc}>开启后，发送到专属邮箱的邮件将自动转发到微信</span>
                    </span>
                </label>
            </div>
        </>
    );
};

export default EmailAddressSection;
