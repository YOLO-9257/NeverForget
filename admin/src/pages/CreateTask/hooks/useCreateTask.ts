/**
 * CreateTask 状态管理 Hook
 * @author zhangws
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { reminderApi, configApi, type SavedConfig } from '../../../api';
import type { CreateReminderRequest } from '../../../types';
import { generateContent, getAiProfiles } from '../../../utils/ai';
import type { NlpParseResult } from '../../../utils/nlpParser';
import {
    type CreateTaskFormData,
    type WxPushTemplate,
    type UserMessageTemplate,
    type TaskTemplate,
    defaultFormData,
} from '../types';

export function useCreateTask() {
    const navigate = useNavigate();
    const { id: editId } = useParams<{ id?: string }>();
    const isEditMode = !!editId;

    // 基础状态
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<1 | 2 | 3>(isEditMode ? 2 : 1);
    const [showNlpInput, setShowNlpInput] = useState(false);

    // 模板状态
    const [wxpushTemplates, setWxpushTemplates] = useState<WxPushTemplate[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [userTemplates, setUserTemplates] = useState<UserMessageTemplate[]>([]);
    const [inputMode, setInputMode] = useState<'select' | 'input'>('select');

    // 保存的配置
    const [savedUserIds, setSavedUserIds] = useState<SavedConfig[]>([]);
    const [savedTemplateIds, setSavedTemplateIds] = useState<SavedConfig[]>([]);
    const [savedPushConfigs, setSavedPushConfigs] = useState<SavedConfig[]>([]);
    const [manageModal, setManageModal] = useState<{ open: boolean; category: string; title: string }>({
        open: false,
        category: '',
        title: '',
    });

    // AI 状态
    const [polishing, setPolishing] = useState(false);
    const hasAi = getAiProfiles().length > 0;

    // 表单数据
    const [formData, setFormData] = useState<CreateTaskFormData>(defaultFormData);

    // 加载保存的配置
    const loadSavedConfigs = useCallback(async (category: string) => {
        try {
            const res = await configApi.list(category);
            if (res.data) {
                if (category === 'wxpush_userid') setSavedUserIds(res.data);
                if (category === 'wxpush_templateid') setSavedTemplateIds(res.data);
                if (category === 'push_config') setSavedPushConfigs(res.data);
            }
        } catch (e) {
            console.error('加载配置失败', e);
        }
    }, []);

    // 步骤 3 时加载配置
    useEffect(() => {
        if (step === 3) {
            loadSavedConfigs('wxpush_userid');
            loadSavedConfigs('wxpush_templateid');
            loadSavedConfigs('push_config');
        }
    }, [step, loadSavedConfigs]);

    // 加载默认配置和用户自定义模板
    useEffect(() => {
        const savedConfig = localStorage.getItem('default_push_config');
        if (savedConfig) {
            try {
                const config = JSON.parse(savedConfig);
                setFormData((prev) => ({
                    ...prev,
                    appid: prev.appid || config.appid || '',
                    secret: prev.secret || config.secret || '',
                    template_id: prev.template_id || config.template_id || '',
                    push_url: prev.push_url || config.push_service_url || '',
                }));
            } catch (e) {
                console.error('Failed to load default config', e);
            }
        }

        const savedTemplates = localStorage.getItem('message_templates');
        if (savedTemplates) {
            try {
                const parsed = JSON.parse(savedTemplates) as UserMessageTemplate[];
                setUserTemplates(parsed);
            } catch (e) {
                console.error('Failed to load user templates', e);
            }
        }
    }, []);

    // 加载 go-wxpush 模板列表
    const loadWxPushTemplates = useCallback(async (pushUrl: string) => {
        if (!pushUrl) return;
        try {
            setLoadingTemplates(true);
            let baseUrl = pushUrl.replace(/\/$/, '');
            baseUrl = baseUrl.replace(/\/wxpush$/, '');
            const apiUrl = baseUrl + '/api/templates';

            const res = await fetch(apiUrl);
            if (res.ok) {
                const data = await res.json();
                if (data.templates) {
                    setWxpushTemplates(data.templates);
                }
            }
        } catch (e) {
            console.warn('Failed to load wxpush templates:', e);
        } finally {
            setLoadingTemplates(false);
        }
    }, []);

    // 监听 push_url 变化，自动加载模板列表
    useEffect(() => {
        if (formData.push_url && /^https?:\/\//.test(formData.push_url)) {
            const timer = setTimeout(() => {
                loadWxPushTemplates(formData.push_url);
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [formData.push_url, loadWxPushTemplates]);

    // 加载任务数据（编辑模式）
    const loadTaskForEdit = useCallback(async (taskId: string) => {
        try {
            setLoading(true);
            const res = await reminderApi.get(taskId);
            if (res.data) {
                const task = res.data;
                setFormData({
                    title: task.title,
                    content: task.content,
                    schedule_type: task.schedule_type,
                    schedule_time: task.schedule_time || '09:00',
                    schedule_date: task.schedule_date || '',
                    schedule_weekday: task.schedule_weekday ?? 1,
                    schedule_day: task.schedule_day ?? 1,
                    schedule_cron: task.schedule_cron || '',
                    timezone: task.timezone || 'Asia/Shanghai',
                    appid: task.push_config?.appid || '',
                    secret: '******',
                    userid: task.push_config?.userid || '',
                    template_id: task.push_config?.template_id || '',
                    push_url: task.push_url || '',
                    template_name: task.template_name || '',
                    ack_required: !!task.ack_required,
                    retry_interval: task.retry_interval ?? 30,
                });
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载任务失败');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (editId) {
            loadTaskForEdit(editId);
        }
    }, [editId, loadTaskForEdit]);

    // 选择预设模板
    const handleSelectTemplate = useCallback((template: TaskTemplate) => {
        setFormData((prev) => ({
            ...prev,
            title: template.title,
            content: template.content,
            schedule_type: template.schedule_type,
            schedule_time: template.schedule_time,
        }));
        setStep(2);
    }, []);

    // 处理 NLP 解析结果
    const handleNlpApply = useCallback((result: NlpParseResult) => {
        setFormData((prev) => ({
            ...prev,
            title: result.title || prev.title,
            content: result.content || result.title || prev.content,
            schedule_type: result.schedule_type || prev.schedule_type,
            schedule_time: result.schedule_time || prev.schedule_time,
            schedule_date: result.schedule_date || prev.schedule_date,
            schedule_weekday: result.schedule_weekday ?? prev.schedule_weekday,
            schedule_day: result.schedule_day ?? prev.schedule_day,
        }));
        setShowNlpInput(false);
        setStep(2);
    }, []);

    // 更新表单数据
    const updateFormData = useCallback((field: keyof CreateTaskFormData, value: string | number | boolean) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    }, []);

    // 提交表单
    const handleSubmit = useCallback(async () => {
        if (!formData.title.trim()) {
            setError('请输入任务标题');
            return;
        }
        if (!formData.content.trim()) {
            setError('请输入提醒内容');
            return;
        }
        if (!formData.appid || !formData.userid || !formData.template_id) {
            setError('请完善推送配置信息（AppID、UserID、模板ID）');
            return;
        }
        if (!isEditMode && !formData.secret) {
            setError('请输入 AppSecret');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const request: CreateReminderRequest = {
                title: formData.title,
                content: formData.content,
                schedule_type: formData.schedule_type,
                schedule_time: formData.schedule_time,
                timezone: formData.timezone,
                push_config: {
                    appid: formData.appid,
                    secret: formData.secret,
                    userid: formData.userid,
                    template_id: formData.template_id,
                },
                push_url: formData.push_url || undefined,
                template_name: formData.template_name || null,
                ack_required: formData.ack_required,
                retry_interval: formData.ack_required ? formData.retry_interval : undefined,
            };

            if (formData.schedule_type === 'once') {
                request.schedule_date = formData.schedule_date;
            } else if (formData.schedule_type === 'weekly') {
                request.schedule_weekday = formData.schedule_weekday;
            } else if (formData.schedule_type === 'monthly') {
                request.schedule_day = formData.schedule_day;
            } else if (formData.schedule_type === 'cron') {
                request.schedule_cron = formData.schedule_cron;
            }

            if (isEditMode && editId) {
                await reminderApi.update(editId, request);
            } else {
                await reminderApi.create(request);
            }
            navigate('/tasks');
        } catch (err) {
            setError(err instanceof Error ? err.message : (isEditMode ? '更新失败' : '创建失败') + '，请重试');
        } finally {
            setLoading(false);
        }
    }, [formData, isEditMode, editId, navigate]);

    // AI 润色内容
    const handlePolish = useCallback(async () => {
        if ((!formData.title && !formData.content) || polishing) return;

        setPolishing(true);
        try {
            const prompt = `你是一个专业的私人助理。请润色以下任务提醒信息，使其更清晰、专业或温馨（取决于原始内容的风格）。保持原意不变。
标题: ${formData.title || '(无)'}
内容: ${formData.content || '(无)'}

请务必只返回一个纯 JSON 对象，不要包含 markdown 格式或其他文字：
{
  "title": "润色后的标题",
  "content": "润色后的内容"
}`;
            const resultStr = await generateContent(prompt);
            let jsonStr = resultStr;
            const match = resultStr.match(/\{[\s\S]*\}/);
            if (match) {
                jsonStr = match[0];
            }
            const json = JSON.parse(jsonStr);
            setFormData((prev) => ({
                ...prev,
                title: json.title || prev.title,
                content: json.content || prev.content,
            }));
        } catch (e) {
            console.error('Polish failed', e);
            setError('AI 润色失败，请重试');
        } finally {
            setPolishing(false);
        }
    }, [formData.title, formData.content, polishing]);

    return {
        // 状态
        loading,
        error,
        step,
        showNlpInput,
        wxpushTemplates,
        loadingTemplates,
        userTemplates,
        inputMode,
        savedUserIds,
        savedTemplateIds,
        savedPushConfigs,
        manageModal,
        polishing,
        hasAi,
        formData,
        isEditMode,

        // 设置器
        setError,
        setStep,
        setShowNlpInput,
        setInputMode,
        setManageModal,
        setFormData,

        // 操作函数
        loadSavedConfigs,
        loadWxPushTemplates,
        handleSelectTemplate,
        handleNlpApply,
        updateFormData,
        handleSubmit,
        handlePolish,
    };
}
