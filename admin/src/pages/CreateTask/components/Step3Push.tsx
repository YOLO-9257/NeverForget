/**
 * 步骤 3：推送配置
 * @author zhangws
 */

import React from 'react';
import type { SavedConfig } from '../../../api';
import type { CreateTaskFormData, WxPushTemplate } from '../types';
import styles from './Step3Push.module.css';

interface Step3PushProps {
    formData: CreateTaskFormData;
    loading: boolean;
    loadingTemplates: boolean;
    isEditMode: boolean;
    wxpushTemplates: WxPushTemplate[];
    savedUserIds: SavedConfig[];
    savedTemplateIds: SavedConfig[];
    savedPushConfigs: SavedConfig[];
    inputMode: 'select' | 'input';
    onUpdateFormData: (field: keyof CreateTaskFormData, value: string | number | boolean) => void;
    onLoadWxPushTemplates: (url: string) => void;
    onOpenManageModal: (category: string, title: string) => void;
    onToggleInputMode: () => void;
    onPrev: () => void;
    onSubmit: () => void;
    onApplySavedConfig: (config: SavedConfig) => void;
}

export const Step3Push: React.FC<Step3PushProps> = ({
    formData,
    loading,
    loadingTemplates,
    isEditMode,
    wxpushTemplates,
    savedUserIds,
    savedTemplateIds,
    savedPushConfigs,
    inputMode,
    onUpdateFormData,
    onLoadWxPushTemplates,
    onOpenManageModal,
    onToggleInputMode,
    onPrev,
    onSubmit,
    onApplySavedConfig,
}) => {
    return (
        <div className={styles.card}>
            <div className={styles.section}>
                {/* Header */}
                <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>📱 微信推送配置</h3>
                    <div className={styles.headerActions}>
                        <button
                            className={styles.ghostBtn}
                            onClick={() => onOpenManageModal('push_config', '常用推送配置')}
                        >
                            ⚙️ 管理库
                        </button>
                        {savedPushConfigs.length > 0 && (
                            <select
                                className={styles.quickSelect}
                                onChange={(e) => {
                                    const config = savedPushConfigs.find((c) => c.id.toString() === e.target.value);
                                    if (config) onApplySavedConfig(config);
                                }}
                                value=""
                            >
                                <option value="">快速从库填充...</option>
                                {savedPushConfigs.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                <p className={styles.sectionDesc}>
                    配置 go-wxpush 服务所需的微信公众号信息。如果您还没有配置，请先完成微信公众号的开发者配置。
                </p>

                {/* AppID & Secret */}
                <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>AppID *</label>
                        <input
                            type="text"
                            className={styles.input}
                            placeholder="公众号 AppID"
                            value={formData.appid}
                            onChange={(e) => onUpdateFormData('appid', e.target.value)}
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>AppSecret *</label>
                        <input
                            type="password"
                            className={styles.input}
                            placeholder="公众号 AppSecret"
                            value={formData.secret}
                            onChange={(e) => onUpdateFormData('secret', e.target.value)}
                        />
                    </div>
                </div>

                {/* UserID & TemplateID */}
                <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                        <label className={styles.labelRow}>
                            <span>用户 OpenID *</span>
                            <button
                                className={styles.ghostBtnSm}
                                onClick={() => onOpenManageModal('wxpush_userid', '常用用户ID')}
                            >
                                ⚙️ 管理
                            </button>
                        </label>
                        <div className={styles.inputRow}>
                            <input
                                type="text"
                                className={styles.input}
                                placeholder="接收消息的用户 OpenID"
                                value={formData.userid}
                                onChange={(e) => onUpdateFormData('userid', e.target.value)}
                                list="saved-userids"
                            />
                            <datalist id="saved-userids">
                                {savedUserIds.map((c) => (
                                    <option key={c.id} value={c.value}>
                                        {c.name}
                                    </option>
                                ))}
                            </datalist>
                            {savedUserIds.length > 0 && (
                                <select
                                    className={styles.shortSelect}
                                    onChange={(e) => {
                                        if (e.target.value) onUpdateFormData('userid', e.target.value);
                                    }}
                                    value=""
                                >
                                    <option value="">快速选择</option>
                                    {savedUserIds.map((c) => (
                                        <option key={c.id} value={c.value}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.labelRow}>
                            <span>模板 ID *</span>
                            <button
                                className={styles.ghostBtnSm}
                                onClick={() => onOpenManageModal('wxpush_templateid', '常用模板ID')}
                            >
                                ⚙️ 管理
                            </button>
                        </label>
                        <div className={styles.inputRow}>
                            <input
                                type="text"
                                className={styles.input}
                                placeholder="微信消息模板 ID"
                                value={formData.template_id}
                                onChange={(e) => onUpdateFormData('template_id', e.target.value)}
                                list="saved-templateids"
                            />
                            <datalist id="saved-templateids">
                                {savedTemplateIds.map((c) => (
                                    <option key={c.id} value={c.value}>
                                        {c.name}
                                    </option>
                                ))}
                            </datalist>
                            {savedTemplateIds.length > 0 && (
                                <select
                                    className={styles.shortSelect}
                                    onChange={(e) => {
                                        if (e.target.value) onUpdateFormData('template_id', e.target.value);
                                    }}
                                    value=""
                                >
                                    <option value="">快速选择</option>
                                    {savedTemplateIds.map((c) => (
                                        <option key={c.id} value={c.value}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>
                </div>

                {/* Push URL */}
                <div className={styles.formGroup}>
                    <label className={styles.label}>推送服务地址</label>
                    <input
                        type="url"
                        className={styles.input}
                        placeholder="例如：https://push.your-domain.com"
                        value={formData.push_url}
                        onChange={(e) => onUpdateFormData('push_url', e.target.value)}
                    />
                    <div className={styles.hint}>
                        指定用于发送消息的 go-wxpush 服务地址（留空则使用默认配置）
                    </div>
                </div>

                {/* Template Name */}
                <div className={styles.formGroup}>
                    <label className={styles.labelRow}>
                        <span>详情页模板</span>
                        <div className={styles.btnGroup}>
                            <button
                                className={styles.ghostBtnSm}
                                onClick={() => onLoadWxPushTemplates(formData.push_url)}
                                disabled={loadingTemplates}
                                title="刷新模板列表"
                            >
                                {loadingTemplates ? <span className={styles.spinner} /> : '🔄'}
                            </button>
                            <button
                                className={styles.ghostBtnSm}
                                onClick={onToggleInputMode}
                                title={inputMode === 'select' ? '切换到手动输入' : '切换到列表选择'}
                            >
                                {inputMode === 'select' ? '✍️ 手动' : '📋 列表'}
                            </button>
                        </div>
                    </label>
                    {inputMode === 'select' ? (
                        <select
                            className={styles.input}
                            value={formData.template_name}
                            onChange={(e) => onUpdateFormData('template_name', e.target.value)}
                        >
                            <option value="">-- 不使用详情页模板 --</option>
                            {wxpushTemplates.map((t) => (
                                <option key={t.id} value={t.name}>
                                    {t.name} {t.description ? `- ${t.description}` : ''}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <input
                            type="text"
                            className={styles.input}
                            placeholder="输入 go-wxpush 详情页模板名称"
                            value={formData.template_name}
                            onChange={(e) => onUpdateFormData('template_name', e.target.value)}
                        />
                    )}
                    <div className={styles.hint}>
                        选择一个 go-wxpush 详情页模板，用于展示更丰富的提醒内容
                    </div>
                </div>
            </div>

            {/* 操作按钮 */}
            <div className={styles.actions}>
                <button className={styles.btnSecondary} onClick={onPrev}>
                    ← 上一步
                </button>
                <button className={styles.btnPrimary} onClick={onSubmit} disabled={loading}>
                    {loading ? (
                        <>
                            <span className={styles.spinnerWhite} />
                            提交中...
                        </>
                    ) : isEditMode ? (
                        '✓ 保存修改'
                    ) : (
                        '✓ 创建任务'
                    )}
                </button>
            </div>
        </div>
    );
};

export default Step3Push;
