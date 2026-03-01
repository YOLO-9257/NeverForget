/**
 * 账户编辑模态框
 * @author zhangws
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { EmailAccount, AccountFormData } from './types';
import styles from './AccountEditorModal.module.css';

interface SavedConfigItem {
    id: number;
    name: string;
    value: string;
}

interface WxpushTemplate {
    id: string | number;
    name: string;
    description?: string;
}

interface PushProfileValue {
    appid: string;
    secret: string;
    userid: string;
    template_id: string;
    push_service_url?: string;
}

interface AiProfileOption {
    id: string;
    name: string;
    provider?: string;
    model?: string;
    isDefault?: boolean;
}

function parsePushProfileValue(raw: string): Partial<PushProfileValue> | null {
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        return {
            appid: typeof parsed.appid === 'string' ? parsed.appid : '',
            secret: typeof parsed.secret === 'string' ? parsed.secret : '',
            userid: typeof parsed.userid === 'string' ? parsed.userid : '',
            template_id: typeof parsed.template_id === 'string' ? parsed.template_id : '',
            push_service_url: typeof parsed.push_service_url === 'string' ? parsed.push_service_url : '',
        };
    } catch {
        return null;
    }
}

function parseAiProfileOption(config: SavedConfigItem): AiProfileOption | null {
    try {
        const parsed = JSON.parse(config.value) as Record<string, unknown>;
        const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';
        if (!id) {
            return null;
        }

        return {
            id,
            name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : config.name,
            provider: typeof parsed.provider === 'string' ? parsed.provider : undefined,
            model: typeof parsed.model === 'string' ? parsed.model : undefined,
            isDefault: Boolean(parsed.isDefault),
        };
    } catch {
        return null;
    }
}

function readDefaultPushProfile(): Partial<PushProfileValue> {
    const raw = localStorage.getItem('default_push_config');
    if (!raw) {
        return {};
    }

    const parsed = parsePushProfileValue(raw);
    return parsed || {};
}

function normalizePushApiBaseUrl(pushUrl: string): string {
    return pushUrl
        .trim()
        .replace(/\/$/, '')
        .replace(/\/wxpush$/, '');
}

export interface AccountEditorModalProps {
    isOpen: boolean;
    editingAccount: EmailAccount | null;
    onClose: () => void;
    onSaveSuccess: () => void;
}

const defaultFormData: AccountFormData = {
    name: '',
    email: '',
    imap_host: '',
    imap_port: 993,
    username: '',
    password: '',
    use_ssl: true,
    enabled: true,
    auto_push: false,
    push_user_id: '',
    push_profile_id: '',
    push_template_id: '',
    push_appid: '',
    push_secret: '',
    push_url: '',
    template_name: '',
    ai_spam_filter: false,
    ai_profile_id: '',
    ads_keep_importance_threshold: 0.75,
};

export const AccountEditorModal: React.FC<AccountEditorModalProps> = ({
    isOpen,
    editingAccount,
    onClose,
    onSaveSuccess,
}) => {
    const [formData, setFormData] = useState<AccountFormData>(defaultFormData);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [userConfigs, setUserConfigs] = useState<SavedConfigItem[]>([]);
    const [templateConfigs, setTemplateConfigs] = useState<SavedConfigItem[]>([]);
    const [savedPushConfigs, setSavedPushConfigs] = useState<SavedConfigItem[]>([]);
    const [savedAiProfiles, setSavedAiProfiles] = useState<AiProfileOption[]>([]);
    const [wxpushTemplates, setWxpushTemplates] = useState<WxpushTemplate[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);

    const apiUrl = localStorage.getItem('api_url') || '';
    const authToken = localStorage.getItem('auth_token') || '';
    const headers = useMemo(() => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
    }), [authToken]);

    // 加载推送相关配置（用户ID / 模板ID / 推送配置）
    const loadPushRelatedConfigs = useCallback(async () => {
        try {
            const fetchConfigList = async (category: string): Promise<SavedConfigItem[]> => {
                const res = await fetch(`${apiUrl}/api/configs?category=${category}`, { headers });
                const json = await res.json() as { code: number; data?: SavedConfigItem[] };
                if (json.code === 0 && Array.isArray(json.data)) {
                    return json.data;
                }
                return [];
            };

            const [users, templates, pushConfigs, aiProfiles] = await Promise.all([
                fetchConfigList('wxpush_userid'),
                fetchConfigList('wxpush_templateid'),
                fetchConfigList('push_config'),
                fetchConfigList('ai_profile'),
            ]);

            setUserConfigs(users);
            setTemplateConfigs(templates);
            setSavedPushConfigs(pushConfigs);
            setSavedAiProfiles(
                aiProfiles
                    .map(parseAiProfileOption)
                    .filter((item): item is AiProfileOption => item !== null)
            );
        } catch (e) {
            console.error('加载推送配置失败', e);
        }
    }, [apiUrl, headers]);

    // 拉取 go-wxpush 详情模板列表
    const loadWxpushTemplates = useCallback(async (pushUrl: string) => {
        if (!pushUrl.trim()) {
            setWxpushTemplates([]);
            return;
        }
        if (!/^https?:\/\//.test(pushUrl.trim())) {
            return;
        }

        try {
            setLoadingTemplates(true);
            const apiBase = normalizePushApiBaseUrl(pushUrl);
            const res = await fetch(`${apiBase}/api/templates`);

            if (!res.ok) {
                return;
            }

            const data = await res.json() as { templates?: WxpushTemplate[] };
            if (Array.isArray(data.templates)) {
                setWxpushTemplates(data.templates);
            }
        } catch (e) {
            console.warn('加载 go-wxpush 模板失败', e);
        } finally {
            setLoadingTemplates(false);
        }
    }, []);

    // 初始化表单数据
    useEffect(() => {
        if (isOpen) {
            void loadPushRelatedConfigs();

            const defaultPush = readDefaultPushProfile();
            const defaultPushUrl = (defaultPush.push_service_url || '').trim();

            if (editingAccount) {
                const parsedConfig = editingAccount.push_config;

                setFormData({
                    name: editingAccount.name || '',
                    email: editingAccount.email || '',
                    imap_host: editingAccount.imap_host || '',
                    imap_port: editingAccount.imap_port || 993,
                    username: editingAccount.username || '',
                    password: '',
                    use_ssl: editingAccount.use_ssl ?? true,
                    enabled: editingAccount.enabled ?? true,
                    auto_push: editingAccount.auto_push ?? false,
                    push_user_id: editingAccount.push_user_id || parsedConfig?.userid || '',
                    push_profile_id: '',
                    push_template_id: editingAccount.push_template_id || parsedConfig?.template_id || defaultPush.template_id || '',
                    push_appid: editingAccount.push_appid || parsedConfig?.appid || defaultPush.appid || '',
                    push_secret: editingAccount.push_secret || parsedConfig?.secret || defaultPush.secret || '',
                    push_url: editingAccount.push_url || defaultPushUrl,
                    template_name: editingAccount.template_name || '',
                    ai_spam_filter: editingAccount.ai_spam_filter ?? false,
                    ai_profile_id: editingAccount.ai_profile_id || '',
                    ads_keep_importance_threshold: editingAccount.ai_filter_config?.ads_keep_importance_threshold ?? 0.75,
                });
            } else {
                setFormData({
                    ...defaultFormData,
                    push_template_id: defaultPush.template_id || '',
                    push_appid: defaultPush.appid || '',
                    push_secret: defaultPush.secret || '',
                    push_url: defaultPushUrl,
                    ads_keep_importance_threshold: 0.75,
                });
            }
            setError('');
        }
    }, [isOpen, editingAccount, loadPushRelatedConfigs]);

    // 监听 push_url 变化，自动刷新详情模板列表
    useEffect(() => {
        if (!isOpen) {
            return;
        }

        if (!formData.push_url.trim()) {
            setWxpushTemplates([]);
            return;
        }

        const timer = setTimeout(() => {
            void loadWxpushTemplates(formData.push_url);
        }, 800);

        return () => clearTimeout(timer);
    }, [isOpen, formData.push_url, loadWxpushTemplates]);

    const handleChange = <K extends keyof AccountFormData>(field: K, value: AccountFormData[K]) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleApplySavedPushConfig = (configId: string) => {
        handleChange('push_profile_id', configId);
        if (!configId) {
            return;
        }

        const selected = savedPushConfigs.find(c => c.id.toString() === configId);
        if (!selected) {
            return;
        }

        const parsed = parsePushProfileValue(selected.value);
        if (!parsed) {
            return;
        }

        setFormData(prev => ({
            ...prev,
            push_profile_id: configId,
            push_appid: parsed.appid || prev.push_appid,
            push_secret: parsed.secret || prev.push_secret,
            push_user_id: parsed.userid || prev.push_user_id,
            push_template_id: parsed.template_id || prev.push_template_id,
            push_url: parsed.push_service_url || prev.push_url,
        }));
    };

    const handleSave = async () => {
        // 验证
        if (!formData.name.trim()) {
            setError('请输入账户名称');
            return;
        }
        if (!formData.email.trim()) {
            setError('请输入邮箱地址');
            return;
        }
        if (!formData.imap_host.trim()) {
            setError('请输入 IMAP 服务器地址');
            return;
        }
        const imapUser = (formData.username || formData.email).trim();
        if (!imapUser) {
            setError('请输入用户名');
            return;
        }
        if (!editingAccount && !formData.password) {
            setError('请输入密码');
            return;
        }
        if (formData.auto_push) {
            if (!formData.push_appid.trim()) {
                setError('自动推送已开启，请填写 AppID');
                return;
            }
            if (!formData.push_secret.trim()) {
                setError('自动推送已开启，请填写 AppSecret');
                return;
            }
            if (!formData.push_user_id.trim()) {
                setError('自动推送已开启，请填写推送用户ID');
                return;
            }
            if (!formData.push_template_id.trim()) {
                setError('自动推送已开启，请填写模板ID');
                return;
            }
        }
        if (!Number.isFinite(formData.ads_keep_importance_threshold) || formData.ads_keep_importance_threshold < 0 || formData.ads_keep_importance_threshold > 1) {
            setError('广告中严重度保留线必须在 0~1 之间');
            return;
        }

        setSaving(true);
        setError('');

        try {
            const hasPushConfig = Boolean(
                formData.push_appid.trim()
                || formData.push_secret.trim()
                || formData.push_user_id.trim()
                || formData.push_template_id.trim()
            );

            const payload: Record<string, unknown> = {
                name: formData.name.trim(),
                email: formData.email.trim(),
                imap_host: formData.imap_host.trim(),
                imap_port: formData.imap_port,
                imap_user: imapUser,
                username: imapUser, // 兼容旧参数
                use_ssl: formData.use_ssl, // 兼容旧参数
                imap_tls: formData.use_ssl,
                enabled: formData.enabled,
                auto_push: formData.auto_push,
                push_user_id: formData.push_user_id,
                push_template_id: formData.push_template_id,
                push_appid: formData.push_appid,
                push_secret: formData.push_secret,
                push_url: formData.push_url.trim() || null,
                template_name: formData.template_name.trim() || null,
                push_config: hasPushConfig ? {
                    appid: formData.push_appid.trim(),
                    secret: formData.push_secret.trim(),
                    userid: formData.push_user_id.trim(),
                    template_id: formData.push_template_id.trim(),
                } : null,
                ai_spam_filter: formData.ai_spam_filter,
                enable_ai_spam_filter: formData.ai_spam_filter,
                ai_profile_id: formData.ai_profile_id.trim() || null,
                ai_filter_config: {
                    ads_keep_importance_threshold: Math.min(1, Math.max(0, formData.ads_keep_importance_threshold)),
                },
            };

            if (formData.password) {
                payload.password = formData.password; // 兼容旧参数
                payload.imap_password = formData.password;
            }

            const url = editingAccount
                ? `${apiUrl}/api/email/accounts/${editingAccount.id}`
                : `${apiUrl}/api/email/accounts`;

            const res = await fetch(url, {
                method: editingAccount ? 'PUT' : 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            const json = await res.json();

            if (json.code === 0) {
                onSaveSuccess();
                onClose();
            } else {
                setError(json.message || '保存失败');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : '保存失败';
            setError(message);
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2>{editingAccount ? '编辑邮箱账户' : '添加邮箱账户'}</h2>
                    <button className={styles.closeBtn} onClick={onClose}>×</button>
                </div>

                <div className={styles.content}>
                    {error && (
                        <div className={styles.error}>{error}</div>
                    )}

                    {/* 基本信息 */}
                    <div className={styles.section}>
                        <h4 className={styles.sectionTitle}>基本信息</h4>
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>账户名称 *</label>
                                <input
                                    type="text"
                                    className={styles.input}
                                    value={formData.name}
                                    onChange={e => handleChange('name', e.target.value)}
                                    placeholder="例如：工作邮箱"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>邮箱地址 *</label>
                                <input
                                    type="email"
                                    className={styles.input}
                                    value={formData.email}
                                    onChange={e => handleChange('email', e.target.value)}
                                    placeholder="your@email.com"
                                />
                            </div>
                        </div>
                    </div>

                    {/* IMAP 设置 */}
                    <div className={styles.section}>
                        <h4 className={styles.sectionTitle}>IMAP 服务器设置</h4>
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>IMAP 服务器 *</label>
                                <input
                                    type="text"
                                    className={styles.input}
                                    value={formData.imap_host}
                                    onChange={e => handleChange('imap_host', e.target.value)}
                                    placeholder="imap.gmail.com"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>端口</label>
                                <input
                                    type="number"
                                    className={styles.input}
                                    value={formData.imap_port}
                                    onChange={e => handleChange('imap_port', parseInt(e.target.value) || 993)}
                                />
                            </div>
                        </div>
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>用户名</label>
                                <input
                                    type="text"
                                    className={styles.input}
                                    value={formData.username}
                                    onChange={e => handleChange('username', e.target.value)}
                                    placeholder="留空则使用邮箱地址"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>
                                    密码 {editingAccount ? '(留空保持不变)' : '*'}
                                </label>
                                <input
                                    type="password"
                                    className={styles.input}
                                    value={formData.password}
                                    onChange={e => handleChange('password', e.target.value)}
                                    placeholder={editingAccount ? '留空保持不变' : '输入密码或应用专用密码'}
                                />
                            </div>
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.toggle}>
                                <input
                                    type="checkbox"
                                    checked={formData.use_ssl}
                                    onChange={e => handleChange('use_ssl', e.target.checked)}
                                />
                                <span className={styles.toggleSlider}></span>
                                <span className={styles.toggleLabel}>使用 SSL/TLS 加密连接</span>
                            </label>
                        </div>
                    </div>

                    {/* 推送设置 */}
                    <div className={styles.section}>
                        <h4 className={styles.sectionTitle}>推送设置</h4>
                        <div className={styles.formGroup}>
                            <label className={styles.toggle}>
                                <input
                                    type="checkbox"
                                    checked={formData.auto_push}
                                    onChange={e => handleChange('auto_push', e.target.checked)}
                                />
                                <span className={styles.toggleSlider}></span>
                                <span className={styles.toggleLabel}>自动推送新邮件到微信</span>
                            </label>
                        </div>
                        {formData.auto_push && (
                            <>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>快捷推送配置（可选）</label>
                                    <select
                                        className={styles.input}
                                        value={formData.push_profile_id}
                                        onChange={e => handleApplySavedPushConfig(e.target.value)}
                                    >
                                        <option value="">-- 选择已保存推送配置 --</option>
                                        {savedPushConfigs.map(c => (
                                            <option key={c.id} value={c.id.toString()}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>AppID *</label>
                                        <input
                                            type="text"
                                            className={styles.input}
                                            value={formData.push_appid}
                                            onChange={e => handleChange('push_appid', e.target.value)}
                                            placeholder="公众号 AppID"
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>AppSecret *</label>
                                        <input
                                            type="password"
                                            className={styles.input}
                                            value={formData.push_secret}
                                            onChange={e => handleChange('push_secret', e.target.value)}
                                            placeholder="公众号 AppSecret"
                                        />
                                    </div>
                                </div>

                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>推送用户 ID *</label>
                                        <input
                                            type="text"
                                            className={styles.input}
                                            list="account-push-users"
                                            value={formData.push_user_id}
                                            onChange={e => handleChange('push_user_id', e.target.value)}
                                            placeholder="接收推送的用户 OpenID"
                                        />
                                        <datalist id="account-push-users">
                                            {userConfigs.map(c => (
                                                <option key={c.id} value={c.value}>{c.name}</option>
                                            ))}
                                        </datalist>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.label}>模板选择 *</label>
                                        <input
                                            type="text"
                                            className={styles.input}
                                            list="account-template-ids"
                                            value={formData.push_template_id}
                                            onChange={e => handleChange('push_template_id', e.target.value)}
                                            placeholder="微信消息模板 ID"
                                        />
                                        <datalist id="account-template-ids">
                                            {templateConfigs.map(c => (
                                                <option key={c.id} value={c.value}>{c.name}</option>
                                            ))}
                                        </datalist>
                                    </div>
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.label}>推送服务地址</label>
                                    <input
                                        type="url"
                                        className={styles.input}
                                        value={formData.push_url}
                                        onChange={e => handleChange('push_url', e.target.value)}
                                        placeholder="例如：https://your-go-wxpush.com"
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.label}>详情模板选择</label>
                                    <select
                                        className={styles.input}
                                        value={formData.template_name}
                                        onChange={e => handleChange('template_name', e.target.value)}
                                    >
                                        <option value="">-- 不使用详情模板 --</option>
                                        {wxpushTemplates.map(t => (
                                            <option key={t.id} value={t.name}>
                                                {t.name}{t.description ? ` - ${t.description}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className={styles.formGroup}>
                                    <label className={styles.label}>详情模板名称（手动输入）</label>
                                    <input
                                        type="text"
                                        className={styles.input}
                                        value={formData.template_name}
                                        onChange={e => handleChange('template_name', e.target.value)}
                                        placeholder="可直接输入 go-wxpush 详情模板名称"
                                    />
                                </div>

                                <div className={styles.formGroup}>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => loadWxpushTemplates(formData.push_url)}
                                        disabled={loadingTemplates || !formData.push_url.trim()}
                                    >
                                        {loadingTemplates ? '刷新中...' : '刷新详情模板列表'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* AI 设置 */}
                    <div className={styles.section}>
                        <h4 className={styles.sectionTitle}>AI 智能功能</h4>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>绑定 AI 模型（可选）</label>
                            <select
                                className={styles.input}
                                value={formData.ai_profile_id}
                                onChange={e => handleChange('ai_profile_id', e.target.value)}
                            >
                                <option value="">-- 使用默认模型 --</option>
                                {savedAiProfiles.map(profile => (
                                    <option key={profile.id} value={profile.id}>
                                        {profile.name}
                                        {profile.isDefault ? ' (默认)' : ''}
                                        {profile.model ? ` - ${profile.model}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.toggle}>
                                <input
                                    type="checkbox"
                                    checked={formData.ai_spam_filter}
                                    onChange={e => handleChange('ai_spam_filter', e.target.checked)}
                                />
                                <span className={styles.toggleSlider}></span>
                                <span className={styles.toggleLabel}>启用 AI 垃圾邮件过滤</span>
                            </label>
                        </div>
                        {formData.ai_spam_filter && (
                            <div className={styles.formGroup}>
                                <label className={styles.label}>广告中严重度保留线（0~1）</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    className={styles.input}
                                    value={formData.ads_keep_importance_threshold}
                                    onChange={e => {
                                        const raw = Number.parseFloat(e.target.value);
                                        handleChange('ads_keep_importance_threshold', Number.isFinite(raw) ? raw : 0.75);
                                    }}
                                    placeholder="0.75"
                                />
                                <small className={styles.hint}>
                                    广告类且“中严重度”邮件，重要度高于该值将保留，不会被自动过滤。
                                </small>
                            </div>
                        )}
                    </div>

                    {/* 启用状态 */}
                    <div className={styles.section}>
                        <div className={styles.formGroup}>
                            <label className={styles.toggle}>
                                <input
                                    type="checkbox"
                                    checked={formData.enabled}
                                    onChange={e => handleChange('enabled', e.target.checked)}
                                />
                                <span className={styles.toggleSlider}></span>
                                <span className={styles.toggleLabel}>启用此账户</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div className={styles.footer}>
                    <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
                        取消
                    </button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? '保存中...' : '保存'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AccountEditorModal;
