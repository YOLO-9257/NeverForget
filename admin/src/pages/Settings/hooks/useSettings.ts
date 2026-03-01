/**
 * Settings 状态管理 Hook
 * @author zhangws
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { testConnection, configApi } from '../../../api';
import { getAiProfiles, saveAiProfiles } from '../../../utils/ai';
import type { AiProfile } from '../../../utils/ai';
import type {
    SettingsTab,
    DefaultPushConfig,
    NotificationSettings,
    ConnectionStatus,
    ManageModalState,
} from '../types';

interface ConfigRecord {
    id: number;
    name: string;
    value: string;
}

function normalizeProvider(provider: unknown): AiProfile['provider'] {
    const value = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
    if (value === 'gemini' || value === 'openai' || value === 'custom') {
        return value;
    }
    return 'gemini';
}

function normalizeProfileId(id: unknown, fallbackId: string): string {
    if (typeof id === 'string' && id.trim()) {
        return id.trim();
    }
    if (typeof id === 'number' && Number.isFinite(id)) {
        return String(id);
    }
    return fallbackId;
}

function normalizeAiProfile(
    raw: Partial<AiProfile> | null | undefined,
    fallbackId: string,
    fallbackName = ''
): AiProfile | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const id = normalizeProfileId((raw as { id?: unknown }).id, fallbackId);
    const name = typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : fallbackName.trim();
    const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '';
    const baseUrl = typeof raw.baseUrl === 'string' ? raw.baseUrl.trim() : '';
    const model = typeof raw.model === 'string' ? raw.model.trim() : '';

    if (!id || !name || !apiKey) {
        return null;
    }

    return {
        id,
        name,
        provider: normalizeProvider(raw.provider),
        apiKey,
        baseUrl,
        model,
        isDefault: Boolean(raw.isDefault),
    };
}

function ensureSingleDefault(profiles: AiProfile[]): AiProfile[] {
    if (profiles.length === 0) {
        return [];
    }

    let defaultAssigned = false;
    const normalized = profiles.map((profile) => {
        if (profile.isDefault && !defaultAssigned) {
            defaultAssigned = true;
            return { ...profile, isDefault: true };
        }
        return { ...profile, isDefault: false };
    });

    if (!defaultAssigned) {
        normalized[0] = { ...normalized[0], isDefault: true };
    }

    return normalized;
}

function sanitizeAiProfiles(
    profiles: Array<Partial<AiProfile> | null | undefined>
): AiProfile[] {
    const deduped = new Map<string, AiProfile>();

    for (const raw of profiles) {
        const normalized = normalizeAiProfile(raw, crypto.randomUUID());
        if (!normalized) {
            continue;
        }

        // 保留首次出现的 id，避免重复 key 导致页面更新异常
        if (!deduped.has(normalized.id)) {
            deduped.set(normalized.id, normalized);
        }
    }

    return ensureSingleDefault(Array.from(deduped.values()));
}

function parseAiProfileFromConfig(item: ConfigRecord): AiProfile | null {
    try {
        const parsed = JSON.parse(item.value) as Partial<AiProfile> & Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        const legacyApiKey = typeof parsed.api_key === 'string'
            ? String(parsed.api_key).trim()
            : '';
        const apiKey = typeof parsed.apiKey === 'string' && parsed.apiKey.trim()
            ? parsed.apiKey.trim()
            : legacyApiKey;
        const legacyBaseUrl = typeof parsed.base_url === 'string'
            ? String(parsed.base_url).trim()
            : '';
        return normalizeAiProfile(
            {
                id: parsed.id,
                name: parsed.name || item.name,
                provider: parsed.provider,
                apiKey,
                baseUrl: parsed.baseUrl || legacyBaseUrl,
                model: parsed.model,
                isDefault: parsed.isDefault,
            },
            `legacy_${item.id}`,
            item.name
        );
    } catch {
        return null;
    }
}

const DEFAULT_PUSH_CONFIG: DefaultPushConfig = {
    appid: '',
    secret: '',
    template_id: '',
    push_service_url: 'http://1.94.168.67:5566',
};

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
    enableSound: true,
    enableDesktop: false,
};

export function useSettings() {
    // 选项卡
    const [activeTab, setActiveTab] = useState<SettingsTab>('api');

    // API 配置
    const [apiUrl, setApiUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [testingConnection, setTestingConnection] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');

    // 推送配置
    const [defaultPushConfig, setDefaultPushConfig] = useState<DefaultPushConfig>(DEFAULT_PUSH_CONFIG);

    // 通知设置
    const [notifications, setNotifications] = useState<NotificationSettings>(DEFAULT_NOTIFICATIONS);

    // AI Profiles
    const [aiProfiles, setAiProfiles] = useState<AiProfile[]>([]);
    const [editingProfile, setEditingProfile] = useState<Partial<AiProfile> | null>(null);
    const [testingLlm, setTestingLlm] = useState(false);
    const [llmStatus, setLlmStatus] = useState<ConnectionStatus>('idle');
    const aiProfilesRef = useRef<AiProfile[]>([]);
    const aiProfilesTouchedRef = useRef(false);

    // 管理弹窗
    const [manageModal, setManageModal] = useState<ManageModalState>({
        open: false,
        category: '',
        title: '',
    });

    const applyAiProfiles = useCallback((profiles: Array<Partial<AiProfile> | null | undefined>): AiProfile[] => {
        const normalizedProfiles = sanitizeAiProfiles(profiles);
        aiProfilesRef.current = normalizedProfiles;
        setAiProfiles(normalizedProfiles);
        saveAiProfiles(normalizedProfiles);
        return normalizedProfiles;
    }, []);

    useEffect(() => {
        aiProfilesRef.current = aiProfiles;
    }, [aiProfiles]);

    // 本地模型池与云端配置库的双向同步（以本地为更新源）
    const syncAiProfilesToCloud = useCallback(async (profiles: AiProfile[]): Promise<boolean> => {
        try {
            const normalizedProfiles = sanitizeAiProfiles(profiles);
            const listResponse = await configApi.list('ai_profile');
            const existing = (listResponse.data || []) as ConfigRecord[];

            // 删除分类下所有历史记录，避免脏数据导致编辑后重复
            await Promise.all(existing.map((item) => configApi.delete(item.id)));

            await Promise.all(normalizedProfiles.map((profile) => configApi.create({
                    category: 'ai_profile',
                    name: profile.name,
                    value: JSON.stringify(profile),
                })));

            return true;
        } catch (e) {
            console.warn('同步 AI 模型到云端失败:', e);
            return false;
        }
    }, []);

    // 加载保存的设置
    useEffect(() => {
        let cancelled = false;
        const savedApiUrl = localStorage.getItem('api_url') || '';
        const savedApiKey = localStorage.getItem('api_key') || '';
        const savedPushConfig = localStorage.getItem('default_push_config');
        const savedNotifications = localStorage.getItem('notification_settings');
        const localProfiles = sanitizeAiProfiles(getAiProfiles());

        applyAiProfiles(localProfiles);
        setApiUrl(savedApiUrl);
        setApiKey(savedApiKey);

        if (savedPushConfig) {
            try {
                setDefaultPushConfig(JSON.parse(savedPushConfig));
            } catch (error) {
                console.warn('解析默认推送配置失败:', error);
            }
        }

        if (savedNotifications) {
            try {
                setNotifications(JSON.parse(savedNotifications));
            } catch (error) {
                console.warn('解析通知配置失败:', error);
            }
        }

        // 优先加载云端模型池；云端为空时回写本地到云端，保证前后端配置一致
        void (async () => {
            try {
                const cloudResponse = await configApi.list('ai_profile');
                const cloudProfiles = sanitizeAiProfiles(((cloudResponse.data || []) as ConfigRecord[])
                    .map(parseAiProfileFromConfig)
                    .filter((item): item is AiProfile => item !== null));

                if (cloudProfiles.length > 0) {
                    // 若用户已在本地进行增删改，避免异步覆盖最新状态
                    if (!cancelled && !aiProfilesTouchedRef.current) {
                        applyAiProfiles(cloudProfiles);
                    }
                    return;
                }

                if (localProfiles.length > 0) {
                    await syncAiProfilesToCloud(localProfiles);
                }
            } catch (e) {
                console.warn('加载云端 AI 模型池失败，使用本地配置:', e);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [applyAiProfiles, syncAiProfilesToCloud]);

    // 测试 API 连接
    const handleTestConnection = useCallback(async () => {
        if (!apiUrl || !apiKey) {
            alert('请先填写 API 地址和密钥');
            return;
        }

        setTestingConnection(true);
        setConnectionStatus('idle');

        try {
            const success = await testConnection(apiUrl, apiKey);
            setConnectionStatus(success ? 'success' : 'error');
        } catch {
            setConnectionStatus('error');
        } finally {
            setTestingConnection(false);
        }
    }, [apiUrl, apiKey]);

    // 保存 API 配置
    const handleSaveApiConfig = useCallback(() => {
        localStorage.setItem('api_url', apiUrl);
        localStorage.setItem('api_key', apiKey);
        alert('API 配置已保存');
    }, [apiUrl, apiKey]);

    // 保存推送配置
    const handleSavePushConfig = useCallback(() => {
        localStorage.setItem('default_push_config', JSON.stringify(defaultPushConfig));
        alert('推送配置已保存');
    }, [defaultPushConfig]);

    // 保存通知设置
    const handleSaveNotifications = useCallback(() => {
        localStorage.setItem('notification_settings', JSON.stringify(notifications));
        alert('通知设置已保存');
    }, [notifications]);

    // --- AI Profile 管理 ---
    const handleAddProfile = useCallback(() => {
        setEditingProfile({
            id: crypto.randomUUID(),
            name: 'New Model',
            provider: 'gemini',
            apiKey: '',
            baseUrl: '',
            model: '',
            isDefault: aiProfilesRef.current.length === 0,
        });
        setLlmStatus('idle');
    }, []);

    const handleEditProfile = useCallback((profile: AiProfile) => {
        setEditingProfile({ ...profile });
        setLlmStatus('idle');
    }, []);

    const handleDeleteProfile = useCallback(async (id: string) => {
        if (!confirm('确定要删除这个模型配置吗？')) return;
        aiProfilesTouchedRef.current = true;
        const currentProfiles = aiProfilesRef.current;
        const newProfiles = applyAiProfiles(
            currentProfiles.filter((p) => String(p.id) !== String(id))
        );

        const synced = await syncAiProfilesToCloud(newProfiles);
        if (!synced) {
            alert('模型已在本地更新，但同步到云端失败。');
        }
    }, [applyAiProfiles, syncAiProfilesToCloud]);

    const handleSaveProfile = useCallback(async () => {
        if (!editingProfile) {
            alert('请填写名称和 API Key');
            return;
        }

        const name = typeof editingProfile.name === 'string' ? editingProfile.name.trim() : '';
        const apiKey = typeof editingProfile.apiKey === 'string' ? editingProfile.apiKey.trim() : '';
        if (!name || !apiKey) {
            alert('请填写名称和 API Key');
            return;
        }

        const newProfile: AiProfile = {
            id: normalizeProfileId((editingProfile as { id?: unknown }).id, crypto.randomUUID()),
            name,
            provider: normalizeProvider(editingProfile.provider),
            apiKey,
            baseUrl: typeof editingProfile.baseUrl === 'string' ? editingProfile.baseUrl.trim() : '',
            model: typeof editingProfile.model === 'string' ? editingProfile.model.trim() : '',
            isDefault: Boolean(editingProfile.isDefault),
        };

        aiProfilesTouchedRef.current = true;
        let updatedProfiles = [...aiProfilesRef.current];
        if (newProfile.isDefault) {
            updatedProfiles = updatedProfiles.map((p) => ({ ...p, isDefault: false }));
        }

        const existingIndex = updatedProfiles.findIndex((p) => String(p.id) === String(newProfile.id));
        if (existingIndex >= 0) {
            updatedProfiles[existingIndex] = newProfile;
        } else {
            updatedProfiles.push(newProfile);
        }

        const normalizedProfiles = applyAiProfiles(updatedProfiles);
        setEditingProfile(null);
        const synced = await syncAiProfilesToCloud(normalizedProfiles);
        if (!synced) {
            alert('模型已在本地保存，但同步到云端失败。');
        }
    }, [editingProfile, applyAiProfiles, syncAiProfilesToCloud]);

    const handleCancelEdit = useCallback(() => {
        setEditingProfile(null);
    }, []);

    const handleTestProfile = useCallback(async () => {
        if (!editingProfile || !editingProfile.apiKey) {
            alert('请先填写 API Key');
            return;
        }

        setTestingLlm(true);
        setLlmStatus('idle');

        try {
            const config = editingProfile;
            let response: Response;

            if (config.provider === 'gemini') {
                const baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
                const model = config.model || 'gemini-2.0-flash';
                response = await fetch(`${baseUrl}/models/${model}:generateContent?key=${config.apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: 'Hi' }] }],
                        generationConfig: { maxOutputTokens: 5 },
                    }),
                });
            } else {
                const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
                const model = config.model || 'gpt-4o-mini';
                response = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${config.apiKey}`,
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: 'user', content: 'Hi' }],
                        max_tokens: 5,
                    }),
                });
            }

            setLlmStatus(response.ok ? 'success' : 'error');
        } catch (e) {
            console.error(e);
            setLlmStatus('error');
        } finally {
            setTestingLlm(false);
        }
    }, [editingProfile]);

    // 导出设置
    const handleExportSettings = useCallback(() => {
        const settings = {
            api_url: apiUrl,
            api_key: apiKey,
            default_push_config: defaultPushConfig,
            notification_settings: notifications,
            ai_profiles: aiProfiles,
            message_templates: localStorage.getItem('message_templates'),
            exported_at: new Date().toISOString(),
        };

        const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `never-forget-settings-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [apiUrl, apiKey, defaultPushConfig, notifications, aiProfiles]);

    // 导入设置
    const handleImportSettings = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const settings = JSON.parse(text);

                if (settings.api_url) {
                    setApiUrl(settings.api_url);
                    localStorage.setItem('api_url', settings.api_url);
                }
                if (settings.api_key) {
                    setApiKey(settings.api_key);
                    localStorage.setItem('api_key', settings.api_key);
                }
                if (settings.default_push_config) {
                    setDefaultPushConfig(settings.default_push_config);
                    localStorage.setItem('default_push_config', JSON.stringify(settings.default_push_config));
                }
                if (settings.notification_settings) {
                    setNotifications(settings.notification_settings);
                    localStorage.setItem('notification_settings', JSON.stringify(settings.notification_settings));
                }
                if (Array.isArray(settings.ai_profiles)) {
                    aiProfilesTouchedRef.current = true;
                    const importedProfiles = applyAiProfiles(settings.ai_profiles);
                    await syncAiProfilesToCloud(importedProfiles);
                }
                if (settings.message_templates) {
                    localStorage.setItem('message_templates', settings.message_templates);
                }

                alert('设置已成功导入');
            } catch {
                alert('导入失败：无效的配置文件');
            }
        };
        input.click();
    }, [applyAiProfiles, syncAiProfilesToCloud]);

    // 清除所有数据
    const handleClearData = useCallback(() => {
        if (!confirm('确定要清除所有本地数据吗？此操作不可恢复。')) {
            return;
        }

        localStorage.removeItem('api_url');
        localStorage.removeItem('api_key');
        localStorage.removeItem('default_push_config');
        localStorage.removeItem('notification_settings');
        localStorage.removeItem('message_templates');
        localStorage.removeItem('ai_profiles');
        localStorage.removeItem('llm_api_config');

        setApiUrl('');
        setApiKey('');
        setDefaultPushConfig(DEFAULT_PUSH_CONFIG);
        setNotifications(DEFAULT_NOTIFICATIONS);
        setAiProfiles([]);
        aiProfilesRef.current = [];
        aiProfilesTouchedRef.current = true;

        alert('所有数据已清除');
    }, []);

    // 保存 Profile 到云端库
    const handleSaveProfileToCloud = useCallback(async (profile: AiProfile) => {
        try {
            const normalizedProfile = normalizeAiProfile(profile, crypto.randomUUID(), profile.name);
            if (!normalizedProfile) {
                alert('模型配置不完整，无法同步');
                return;
            }

            aiProfilesTouchedRef.current = true;
            const exists = aiProfilesRef.current.some(item => String(item.id) === String(normalizedProfile.id));
            const nextProfiles = exists
                ? aiProfilesRef.current.map(item => String(item.id) === String(normalizedProfile.id) ? normalizedProfile : item)
                : [...aiProfilesRef.current, normalizedProfile];
            const normalizedProfiles = applyAiProfiles(nextProfiles);
            const ok = await syncAiProfilesToCloud(normalizedProfiles);
            alert(ok ? '已同步到云端库' : '同步失败');
        } catch {
            alert('同步失败');
        }
    }, [applyAiProfiles, syncAiProfilesToCloud]);

    // 保存推送配置到云端库
    const handleSavePushConfigToCloud = useCallback(async () => {
        const name = prompt('请输入配置名称 (用于库保存)', '我的推送配置');
        if (name) {
            try {
                await configApi.create({
                    category: 'push_config',
                    name,
                    value: JSON.stringify(defaultPushConfig),
                });
                alert('已保存到配置库');
            } catch {
                alert('保存失败');
            }
        }
    }, [defaultPushConfig]);

    return {
        // 选项卡
        activeTab,
        setActiveTab,

        // API 配置
        apiUrl,
        setApiUrl,
        apiKey,
        setApiKey,
        testingConnection,
        connectionStatus,
        handleTestConnection,
        handleSaveApiConfig,

        // 推送配置
        defaultPushConfig,
        setDefaultPushConfig,
        handleSavePushConfig,
        handleSavePushConfigToCloud,

        // 通知设置
        notifications,
        setNotifications,
        handleSaveNotifications,

        // AI Profiles
        aiProfiles,
        editingProfile,
        setEditingProfile,
        testingLlm,
        llmStatus,
        handleAddProfile,
        handleEditProfile,
        handleDeleteProfile,
        handleSaveProfile,
        handleCancelEdit,
        handleTestProfile,
        handleSaveProfileToCloud,

        // 管理弹窗
        manageModal,
        setManageModal,

        // 数据管理
        handleExportSettings,
        handleImportSettings,
        handleClearData,
    };
}
