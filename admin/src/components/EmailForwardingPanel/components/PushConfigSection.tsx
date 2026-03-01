/**
 * 推送配置组件
 * @author zhangws
 */

import React from 'react';
import type { PushConfig, SavedConfig } from '../types';
import styles from './PushConfigSection.module.css';

interface PushConfigSectionProps {
    useDefaultConfig: boolean;
    pushConfig: PushConfig;
    wxpushToken: string;
    templateName: string;
    savedPushConfigs: SavedConfig[];
    matchedConfigId: string | number;
    onUseDefaultChange: (useDefault: boolean) => void;
    onPushConfigChange: (config: PushConfig) => void;
    onWxpushTokenChange: (token: string) => void;
    onTemplateNameChange: (name: string) => void;
    onApplyConfig: (configId: number) => void;
    existingWxpushToken: string | null;
}

export const PushConfigSection: React.FC<PushConfigSectionProps> = ({
    useDefaultConfig,
    pushConfig,
    wxpushToken,
    templateName,
    savedPushConfigs,
    matchedConfigId,
    onUseDefaultChange,
    onPushConfigChange,
    onWxpushTokenChange,
    onTemplateNameChange,
    onApplyConfig,
    existingWxpushToken,
}) => {
    return (
        <div className={styles.section}>
            <label className={styles.sectionLabel}>🔔 推送配置</label>

            {/* 配置模式选择 */}
            <div className={styles.modeSelect}>
                <label className={styles.radioItem}>
                    <input
                        type="radio"
                        name="pushConfigMode"
                        checked={useDefaultConfig}
                        onChange={() => onUseDefaultChange(true)}
                    />
                    <span>跟随系统默认配置 (推荐)</span>
                </label>
                <label className={styles.radioItem}>
                    <input
                        type="radio"
                        name="pushConfigMode"
                        checked={!useDefaultConfig}
                        onChange={() => onUseDefaultChange(false)}
                    />
                    <span>自定义配置 (AppID, Secret 等)</span>
                </label>

                {!useDefaultConfig && savedPushConfigs.length > 0 && (
                    <div className={styles.configSelect}>
                        <select
                            className={styles.select}
                            value={matchedConfigId}
                            onChange={(e) => onApplyConfig(Number(e.target.value))}
                        >
                            <option value="" disabled>
                                从保存的配置加载...
                            </option>
                            {savedPushConfigs.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* 自定义配置表单 */}
            {!useDefaultConfig && (
                <div className={styles.customConfigBox}>
                    <div className={styles.formRow}>
                        <div className={styles.formCol}>
                            <label className={styles.label}>AppID</label>
                            <input
                                type="text"
                                className={styles.input}
                                placeholder="wx..."
                                value={pushConfig.appid}
                                onChange={(e) => onPushConfigChange({ ...pushConfig, appid: e.target.value })}
                            />
                        </div>
                        <div className={styles.formCol}>
                            <label className={styles.label}>AppSecret</label>
                            <input
                                type="password"
                                className={styles.input}
                                placeholder="Secret"
                                value={pushConfig.secret}
                                onChange={(e) => onPushConfigChange({ ...pushConfig, secret: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className={styles.formRow}>
                        <div className={styles.formCol}>
                            <label className={styles.label}>用户 UID *</label>
                            <input
                                type="text"
                                className={styles.input}
                                placeholder="UID_..."
                                value={pushConfig.userid || wxpushToken}
                                onChange={(e) => {
                                    onPushConfigChange({ ...pushConfig, userid: e.target.value });
                                    onWxpushTokenChange(e.target.value);
                                }}
                            />
                        </div>
                        <div className={styles.formCol}>
                            <label className={styles.label}>消息模板 ID</label>
                            <input
                                type="text"
                                className={styles.input}
                                placeholder="可选"
                                value={pushConfig.template_id}
                                onChange={(e) => onPushConfigChange({ ...pushConfig, template_id: e.target.value })}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* WxPush Token (默认模式) */}
            {useDefaultConfig && (
                <div className={styles.formGroup}>
                    <label className={styles.label}>WxPush UID (用户ID) *</label>
                    <input
                        type="password"
                        className={styles.input}
                        placeholder={existingWxpushToken ? `当前：${existingWxpushToken}（输入新值以更新）` : '输入您的 WxPush UID'}
                        value={wxpushToken}
                        onChange={(e) => onWxpushTokenChange(e.target.value)}
                    />
                    <div className={styles.hint}>使用系统默认的推送服务通道，仅需提供您的 UID 即可接收通知。</div>
                </div>
            )}

            {/* 模板名称 */}
            <div className={styles.formGroup}>
                <label className={styles.label}>推送卡片标题 (可选)</label>
                <input
                    type="text"
                    className={styles.input}
                    placeholder="默认: NeverForget 邮件提醒"
                    value={templateName}
                    onChange={(e) => onTemplateNameChange(e.target.value)}
                />
                <div className={styles.hint}>自定义推送到微信卡片上的标题文字</div>
            </div>
        </div>
    );
};

export default PushConfigSection;
