/**
 * useEmailForwarding Hook
 * 管理邮件转发配置的状态和操作
 * @author zhangws
 */

import { useState, useEffect, useCallback } from 'react';
import { emailSettingsApi, configApi } from '../../../api';
import type {
    StatusType,
    PushConfig,
    EmailSettingsResponse,
    EmailForwardLog,
    SavedConfig,
} from '../types';

const DEFAULT_SETTINGS: EmailSettingsResponse = {
    enabled: false,
    email_address: null,
    wxpush_token: null,
    wxpush_url: null,
    forward_rules: null,
    push_config: null,
    template_name: null,
    enable_imap: false,
    imap_host: null,
    imap_port: null,
    imap_user: null,
    imap_tls: true,
    last_sync_at: null,
    sync_status: null,
    sync_error: null,
    total_forwarded: 0,
    last_forwarded_at: null,
};

const DEFAULT_PUSH_CONFIG: PushConfig = {
    appid: '',
    secret: '',
    userid: '',
    template_id: '',
};

type EmailSettingsUpdatePayload = {
    enabled: boolean;
    wxpush_url?: string;
    forward_rules?: string;
    push_config?: PushConfig | null;
    template_name?: string;
    wxpush_token?: string;
};

export function useEmailForwarding() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [status, setStatus] = useState<StatusType>('idle');
    const [statusMessage, setStatusMessage] = useState('');

    // 邮件设置
    const [settings, setSettings] = useState<EmailSettingsResponse>(DEFAULT_SETTINGS);

    // 表单状态
    const [wxpushToken, setWxpushToken] = useState('');
    const [wxpushUrl, setWxpushUrl] = useState('');
    const [forwardRules, setForwardRules] = useState('');

    // 推送配置
    const [pushConfig, setPushConfig] = useState<PushConfig>(DEFAULT_PUSH_CONFIG);
    const [templateName, setTemplateName] = useState('');
    const [useDefaultConfig, setUseDefaultConfig] = useState(true);

    // 转发日志
    const [logs, setLogs] = useState<EmailForwardLog[]>([]);
    const [logsTotal, setLogsTotal] = useState(0);
    const [showLogs, setShowLogs] = useState(false);

    // 保存的配置
    const [savedPushConfigs, setSavedPushConfigs] = useState<SavedConfig[]>([]);

    // 计算当前匹配的配置 ID
    const matchedConfigId =
        savedPushConfigs.find((c) => {
            try {
                const v = JSON.parse(c.value);
                return (
                    v.appid === pushConfig.appid &&
                    v.secret === pushConfig.secret &&
                    v.userid === pushConfig.userid &&
                    v.template_id === pushConfig.template_id
                );
            } catch {
                return false;
            }
        })?.id || '';

    // 加载设置
    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            const response = await emailSettingsApi.get();
            if (response.data) {
                setSettings(response.data);
                setWxpushUrl(response.data.wxpush_url || '');
                setForwardRules(response.data.forward_rules || '');

                if (response.data.push_config) {
                    setUseDefaultConfig(false);
                    setPushConfig(response.data.push_config);
                } else {
                    setUseDefaultConfig(true);
                    const savedDefault = localStorage.getItem('default_push_config');
                    if (savedDefault) {
                        try {
                            setPushConfig(JSON.parse(savedDefault));
                        } catch (parseError) {
                            console.warn('解析默认推送配置失败:', parseError);
                        }
                    }
                }
                setTemplateName(response.data.template_name || '');
            }
        } catch (error) {
            console.error('加载邮件设置失败:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // 加载推送配置列表
    const loadPushConfigs = useCallback(async () => {
        try {
            const res = await configApi.list('push_config');
            if (res.data) {
                setSavedPushConfigs(res.data);
            }
        } catch (error) {
            console.error('加载配置列表失败:', error);
        }
    }, []);

    // 初始加载
    useEffect(() => {
        loadSettings();
        loadPushConfigs();
    }, [loadSettings, loadPushConfigs]);

    // 保存设置
    const handleSave = useCallback(async () => {
        try {
            setSaving(true);
            setStatus('idle');

            const updateData: EmailSettingsUpdatePayload = {
                enabled: settings.enabled,
                wxpush_url: wxpushUrl || undefined,
                forward_rules: forwardRules || undefined,
                push_config: useDefaultConfig ? null : pushConfig,
                template_name: templateName || undefined,
            };

            if (wxpushToken) {
                updateData.wxpush_token = wxpushToken;
            }

            const response = await emailSettingsApi.update(updateData);
            if (response.data) {
                setSettings(response.data);
                setStatus('success');
                setStatusMessage('设置已保存');
                setWxpushToken('');
            }
        } catch (error) {
            setStatus('error');
            setStatusMessage(error instanceof Error ? error.message : '保存失败');
        } finally {
            setSaving(false);
        }
    }, [settings.enabled, wxpushUrl, forwardRules, useDefaultConfig, pushConfig, templateName, wxpushToken]);

    // 测试转发
    const handleTest = useCallback(async () => {
        try {
            setTesting(true);
            setStatus('idle');

            const response = await emailSettingsApi.test();
            if (response.data) {
                setStatus('success');
                setStatusMessage(response.data.message);
            }
        } catch (error) {
            setStatus('error');
            setStatusMessage(error instanceof Error ? error.message : '测试失败');
        } finally {
            setTesting(false);
        }
    }, []);

    // 加载日志
    const loadLogs = useCallback(async () => {
        try {
            const response = await emailSettingsApi.getLogs({ limit: 20 });
            if (response.data && Array.isArray(response.data.items)) {
                setLogs(response.data.items);
                setLogsTotal(response.data.total);
            } else {
                setLogs([]);
                setLogsTotal(0);
            }
        } catch (error) {
            console.error('加载日志失败:', error);
        }
    }, []);

    // 展开日志时加载
    useEffect(() => {
        if (showLogs) {
            loadLogs();
        }
    }, [showLogs, loadLogs]);

    // 应用保存的配置
    const applyPushConfig = useCallback((configId: number) => {
        const cfg = savedPushConfigs.find((c) => c.id === configId);
        if (cfg) {
            try {
                const val = JSON.parse(cfg.value);
                setPushConfig({
                    appid: val.appid || '',
                    secret: val.secret || '',
                    userid: val.userid || '',
                    template_id: val.template_id || '',
                });
                setWxpushToken(val.userid || '');
            } catch (parseError) {
                console.warn('应用推送配置失败:', parseError);
            }
        }
    }, [savedPushConfigs]);

    return {
        // 状态
        loading,
        saving,
        testing,
        status,
        statusMessage,

        // 设置
        settings,
        setSettings,

        // 表单
        wxpushToken,
        setWxpushToken,
        wxpushUrl,
        setWxpushUrl,
        forwardRules,
        setForwardRules,

        // 推送配置
        pushConfig,
        setPushConfig,
        templateName,
        setTemplateName,
        useDefaultConfig,
        setUseDefaultConfig,
        savedPushConfigs,
        matchedConfigId,
        applyPushConfig,

        // 日志
        logs,
        logsTotal,
        showLogs,
        setShowLogs,

        // 操作
        handleSave,
        handleTest,
    };
}
