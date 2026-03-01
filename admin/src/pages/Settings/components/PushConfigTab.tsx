/**
 * 推送配置选项卡
 * @author zhangws
 */

import React from 'react';
import type { DefaultPushConfig, NotificationSettings } from '../types';
import styles from './PushConfigTab.module.css';

interface PushConfigTabProps {
    defaultPushConfig: DefaultPushConfig;
    notifications: NotificationSettings;
    onPushConfigChange: (config: DefaultPushConfig) => void;
    onNotificationsChange: (settings: NotificationSettings) => void;
    onSavePushConfig: () => void;
    onSaveNotifications: () => void;
    onOpenManageModal: () => void;
    onSaveToCloud: () => void;
}

export const PushConfigTab: React.FC<PushConfigTabProps> = ({
    defaultPushConfig,
    notifications,
    onPushConfigChange,
    onNotificationsChange,
    onSavePushConfig,
    onSaveNotifications,
    onOpenManageModal,
    onSaveToCloud,
}) => {
    return (
        <div className={styles.section}>
            {/* 默认推送配置 */}
            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <div>
                        <h3 className={styles.cardTitle}>默认推送配置</h3>
                        <p className={styles.cardSubtitle}>设置默认的微信推送配置，创建任务时可自动填充</p>
                    </div>
                </div>

                <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>AppID</label>
                        <input
                            type="text"
                            className={styles.input}
                            placeholder="公众号 AppID"
                            value={defaultPushConfig.appid}
                            onChange={(e) => onPushConfigChange({ ...defaultPushConfig, appid: e.target.value })}
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>AppSecret</label>
                        <input
                            type="password"
                            className={styles.input}
                            placeholder="公众号 AppSecret"
                            value={defaultPushConfig.secret}
                            onChange={(e) => onPushConfigChange({ ...defaultPushConfig, secret: e.target.value })}
                        />
                    </div>
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label}>默认模板 ID</label>
                    <input
                        type="text"
                        className={styles.input}
                        placeholder="微信消息模板 ID"
                        value={defaultPushConfig.template_id}
                        onChange={(e) => onPushConfigChange({ ...defaultPushConfig, template_id: e.target.value })}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label}>推送服务地址 (go-wxpush)</label>
                    <input
                        type="url"
                        className={styles.input}
                        placeholder="例如：http://1.94.168.67:5566"
                        value={defaultPushConfig.push_service_url}
                        onChange={(e) => onPushConfigChange({ ...defaultPushConfig, push_service_url: e.target.value })}
                    />
                    <div className={styles.hint}>go-wxpush 服务的公网地址，用于发送微信推送消息</div>
                </div>

                <div className={styles.actionsSpread}>
                    <div className={styles.actionsLeft}>
                        <button className={styles.btnSecondary} onClick={onOpenManageModal}>
                            📂 配置库
                        </button>
                        <button className={styles.btnGhost} onClick={onSaveToCloud}>
                            ✨ 保存当前到库
                        </button>
                    </div>
                    <button className={styles.btnPrimary} onClick={onSavePushConfig}>
                        💾 保存本地
                    </button>
                </div>
            </div>

            {/* 通知设置 */}
            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <div>
                        <h3 className={styles.cardTitle}>通知设置</h3>
                        <p className={styles.cardSubtitle}>管理界面的通知提醒设置</p>
                    </div>
                </div>

                <div className={styles.toggleList}>
                    <label className={styles.toggleItem}>
                        <input
                            type="checkbox"
                            checked={notifications.enableSound}
                            onChange={(e) => onNotificationsChange({ ...notifications, enableSound: e.target.checked })}
                        />
                        <span className={styles.toggleLabel}>
                            <span className={styles.toggleTitle}>提示音</span>
                            <span className={styles.toggleDesc}>操作完成时播放提示音</span>
                        </span>
                    </label>

                    <label className={styles.toggleItem}>
                        <input
                            type="checkbox"
                            checked={notifications.enableDesktop}
                            onChange={(e) => onNotificationsChange({ ...notifications, enableDesktop: e.target.checked })}
                        />
                        <span className={styles.toggleLabel}>
                            <span className={styles.toggleTitle}>桌面通知</span>
                            <span className={styles.toggleDesc}>任务执行时发送桌面通知（需要浏览器授权）</span>
                        </span>
                    </label>
                </div>

                <div className={styles.actions}>
                    <button className={styles.btnPrimary} onClick={onSaveNotifications}>
                        💾 保存设置
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PushConfigTab;
