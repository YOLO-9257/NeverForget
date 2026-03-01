/**
 * AI 配置选项卡
 * @author zhangws
 */

import React from 'react';
import type { AiProfile, AiProvider, ConnectionStatus } from '../types';
import styles from './AiConfigTab.module.css';

interface AiConfigTabProps {
    aiProfiles: AiProfile[];
    editingProfile: Partial<AiProfile> | null;
    testingLlm: boolean;
    llmStatus: ConnectionStatus;
    onAddProfile: () => void;
    onEditProfile: (profile: AiProfile) => void;
    onDeleteProfile: (id: string) => void;
    onSaveProfile: () => void;
    onCancelEdit: () => void;
    onTestProfile: () => void;
    onSaveToCloud: (profile: AiProfile) => void;
    onOpenManageModal: () => void;
    onProfileChange: (profile: Partial<AiProfile>) => void;
}

export const AiConfigTab: React.FC<AiConfigTabProps> = ({
    aiProfiles,
    editingProfile,
    testingLlm,
    llmStatus,
    onAddProfile,
    onEditProfile,
    onDeleteProfile,
    onSaveProfile,
    onCancelEdit,
    onTestProfile,
    onSaveToCloud,
    onOpenManageModal,
    onProfileChange,
}) => {
    // 列表视图
    if (!editingProfile) {
        return (
            <div className={styles.section}>
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div>
                            <h3 className={styles.cardTitle}>🧠 AI 模型池</h3>
                            <p className={styles.cardSubtitle}>管理多个 AI 模型配置，可用于 NLP 解析、内容润色和趋势分析</p>
                        </div>
                        <div className={styles.headerActions}>
                            <button className={styles.btnSecondary} onClick={onOpenManageModal}>
                                📂 库管理
                            </button>
                            <button className={styles.btnPrimary} onClick={onAddProfile}>
                                ➕ 添加模型
                            </button>
                        </div>
                    </div>

                    <div className={styles.profileList}>
                        {aiProfiles.length === 0 ? (
                            <div className={styles.emptyState}>暂无配置的 AI 模型，请点击上方按钮添加。</div>
                        ) : (
                            aiProfiles.map((profile) => (
                                <div key={profile.id} className={styles.profileItem}>
                                    <div className={styles.profileInfo}>
                                        <div className={styles.profileIcon}>{profile.provider === 'gemini' ? '💎' : '🤖'}</div>
                                        <div>
                                            <div className={styles.profileName}>
                                                {profile.name}
                                                {profile.isDefault && <span className={styles.badge}>默认</span>}
                                            </div>
                                            <div className={styles.profileMeta}>
                                                {profile.provider === 'gemini' ? 'Google Gemini' : 'OpenAI Compatible'} | {profile.model || 'Auto'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className={styles.profileActions}>
                                        <button className={styles.btnGhost} title="保存到库" onClick={() => onSaveToCloud(profile)}>
                                            ☁️
                                        </button>
                                        <button className={styles.btnSecondary} onClick={() => onEditProfile(profile)}>
                                            ✏️ 编辑
                                        </button>
                                        <button className={styles.btnDanger} onClick={() => onDeleteProfile(profile.id)}>
                                            🗑 删除
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 功能说明 */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h3 className={styles.cardTitle}>💡 功能说明</h3>
                    </div>
                    <div className={styles.helpContent}>
                        <p><strong>多模型支持：</strong></p>
                        <ul>
                            <li>您可以配置多个 API Key，例如同时使用 Gemini（免费）和 GPT-4。</li>
                            <li>通过设置「默认模型」，系统将在智能输入、润色等场景优先使用该模型。</li>
                        </ul>
                    </div>
                </div>
            </div>
        );
    }

    // 编辑视图
    const isExisting = aiProfiles.some((p) => p.id === editingProfile.id);

    return (
        <div className={styles.section}>
            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>{isExisting ? '✏️ 编辑模型' : '➕ 添加模型'}</h3>
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label}>配置名称</label>
                    <input
                        type="text"
                        className={styles.input}
                        placeholder="例如：My Free Gemini"
                        value={editingProfile.name || ''}
                        onChange={(e) => onProfileChange({ ...editingProfile, name: e.target.value })}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label}>提供商</label>
                    <select
                        className={styles.select}
                        value={editingProfile.provider || 'gemini'}
                        onChange={(e) =>
                            onProfileChange({
                                ...editingProfile,
                                provider: e.target.value as AiProvider,
                                baseUrl: e.target.value === 'gemini' ? '' : e.target.value === 'openai' ? 'https://api.openai.com/v1' : '',
                            })
                        }
                    >
                        <option value="gemini">Google Gemini</option>
                        <option value="openai">OpenAI</option>
                        <option value="custom">Custom (OpenAI Compatible)</option>
                    </select>
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label}>API Key *</label>
                    <input
                        type="password"
                        className={styles.input}
                        value={editingProfile.apiKey || ''}
                        onChange={(e) => onProfileChange({ ...editingProfile, apiKey: e.target.value })}
                    />
                </div>

                {/* 高级选项 */}
                <details open={!!editingProfile.baseUrl || !!editingProfile.model} className={styles.details}>
                    <summary className={styles.summary}>高级设置</summary>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Base URL (可选)</label>
                        <input
                            type="url"
                            className={styles.input}
                            placeholder="例如：https://api.openai.com/v1"
                            value={editingProfile.baseUrl || ''}
                            onChange={(e) => onProfileChange({ ...editingProfile, baseUrl: e.target.value })}
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>模型名称 (可选)</label>
                        <input
                            type="text"
                            className={styles.input}
                            placeholder={editingProfile.provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o'}
                            value={editingProfile.model || ''}
                            onChange={(e) => onProfileChange({ ...editingProfile, model: e.target.value })}
                        />
                    </div>
                </details>

                <div className={styles.toggleRow}>
                    <label className={styles.toggleItem}>
                        <input
                            type="checkbox"
                            checked={editingProfile.isDefault || false}
                            onChange={(e) => onProfileChange({ ...editingProfile, isDefault: e.target.checked })}
                        />
                        <span>设为默认模型</span>
                    </label>
                </div>

                {/* 连接状态 */}
                {llmStatus !== 'idle' && (
                    <div className={`${styles.alert} ${llmStatus === 'success' ? styles.alertSuccess : styles.alertError}`}>
                        {llmStatus === 'success' ? <>✅ 测试通过！</> : <>❌ 连接失败，请检查 API Key</>}
                    </div>
                )}

                <div className={styles.actionsSpread}>
                    <button className={styles.btnSecondary} onClick={onTestProfile} disabled={testingLlm}>
                        {testingLlm ? '测试中...' : '🔍 测试连接'}
                    </button>
                    <div className={styles.actionsRight}>
                        <button className={styles.btnSecondary} onClick={onCancelEdit}>
                            取消
                        </button>
                        <button className={styles.btnPrimary} onClick={onSaveProfile}>
                            💾 保存
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AiConfigTab;
