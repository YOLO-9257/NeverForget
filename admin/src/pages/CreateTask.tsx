import { useState, useEffect } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { reminderApi } from '../api';
import type { CreateReminderRequest } from '../types';
import type { NlpParseResult } from '../utils/nlpParser';
import { NlpInput } from '../components/NlpInput';
import { generateContent, getAiProfiles } from '../utils/ai';
import { ConfigManagerModal } from '../components/ConfigManagerModal';
import { configApi, type SavedConfig } from '../api';

// go-wxpush 模板类型
interface WxPushTemplate {
    id: string;
    name: string;
    description?: string;
}

// 用户自定义消息模板类型（来自 Templates 页面）
interface UserMessageTemplate {
    id: string;
    name: string;
    description: string;
    content: string;
    variables: string[];
    category: 'reminder' | 'notification' | 'greeting' | 'custom';
    createdAt: number;
    updatedAt: number;
}

/**
 * 任务创建/编辑页面
 * 支持创建各种类型的定时提醒任务
 */
export function CreateTask() {
    const navigate = useNavigate();
    const { id: editId } = useParams<{ id?: string }>();
    const isEditMode = !!editId;

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<1 | 2 | 3>(isEditMode ? 2 : 1);
    const [wxpushTemplates, setWxpushTemplates] = useState<WxPushTemplate[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [inputMode, setInputMode] = useState<'select' | 'input'>('select');
    const [userTemplates, setUserTemplates] = useState<UserMessageTemplate[]>([]);
    const [showNlpInput, setShowNlpInput] = useState(false);

    // 保存的配置
    const [savedUserIds, setSavedUserIds] = useState<SavedConfig[]>([]);
    const [savedTemplateIds, setSavedTemplateIds] = useState<SavedConfig[]>([]);
    const [savedPushConfigs, setSavedPushConfigs] = useState<SavedConfig[]>([]);
    const [manageModal, setManageModal] = useState<{ open: boolean; category: string; title: string }>({ open: false, category: '', title: '' });

    // 加载保存的配置
    useEffect(() => {
        if (step === 3) {
            loadSavedConfigs('wxpush_userid');
            loadSavedConfigs('wxpush_templateid');
            loadSavedConfigs('push_config');
        }
    }, [step]);

    const loadSavedConfigs = async (category: string) => {
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
    };

    // AI 状态
    const [polishing, setPolishing] = useState(false);
    const hasAi = getAiProfiles().length > 0;

    // 表单数据
    const [formData, setFormData] = useState({
        // 基本信息
        title: '',
        content: '',

        // 调度配置
        schedule_type: 'daily' as 'once' | 'daily' | 'weekly' | 'monthly' | 'cron',
        schedule_time: '09:00',
        schedule_date: '',
        schedule_weekday: 1,
        schedule_day: 1,
        schedule_cron: '',
        timezone: 'Asia/Shanghai',

        // 推送配置
        appid: '',
        secret: '',
        userid: '',
        template_id: '',
        push_url: '',
        template_name: '',  // go-wxpush 模板名称

        // 确认配置
        ack_required: false,
        retry_interval: 30,  // 强提醒重试间隔（分钟）
    });

    // 预设模板
    const templates = [
        {
            id: 'drink_water',
            name: '喝水提醒',
            icon: '💧',
            color: 'hsl(200, 80%, 50%)',
            title: '喝水提醒',
            content: '该喝水啦！保持健康，多喝水~ 💧',
            schedule_type: 'daily' as const,
            schedule_time: '09:00',
        },
        {
            id: 'take_break',
            name: '休息提醒',
            icon: '☕',
            color: 'hsl(30, 80%, 50%)',
            title: '休息提醒',
            content: '工作辛苦了，起来活动一下吧！🏃',
            schedule_type: 'daily' as const,
            schedule_time: '11:00',
        },
        {
            id: 'meeting',
            name: '会议提醒',
            icon: '📅',
            color: 'hsl(260, 70%, 55%)',
            title: '会议即将开始',
            content: '您有一个会议即将开始，请提前做好准备。',
            schedule_type: 'once' as const,
            schedule_time: '10:00',
        },
        {
            id: 'weekly_report',
            name: '周报提醒',
            icon: '📝',
            color: 'hsl(150, 70%, 45%)',
            title: '周报提醒',
            content: '本周工作接近尾声，别忘了写周报哦！📝',
            schedule_type: 'weekly' as const,
            schedule_time: '17:00',
        },
        {
            id: 'birthday',
            name: '生日提醒',
            icon: '🎂',
            color: 'hsl(340, 80%, 55%)',
            title: '生日提醒',
            content: '今天是特别的日子，记得送上祝福！🎉',
            schedule_type: 'monthly' as const,
            schedule_time: '08:00',
        },
        {
            id: 'custom',
            name: '自定义任务',
            icon: '✨',
            color: 'hsl(245, 80%, 60%)',
            title: '',
            content: '',
            schedule_type: 'daily' as const,
            schedule_time: '09:00',
        },
    ];

    // 加载默认配置和用户自定义模板
    useEffect(() => {
        // 加载推送配置
        const savedConfig = localStorage.getItem('default_push_config');
        if (savedConfig) {
            try {
                const config = JSON.parse(savedConfig);
                setFormData(prev => ({
                    ...prev,
                    appid: prev.appid || config.appid || '',
                    secret: prev.secret || config.secret || '',
                    template_id: prev.template_id || config.template_id || '',
                    // 如果 savedConfig 中有 url 且当前 formData 为空，则填充
                    push_url: prev.push_url || config.push_service_url || '',
                }));
            } catch (e) {
                console.error('Failed to load default config', e);
            }
        }

        // 加载用户自定义模板（来自 Templates 页面的 localStorage）
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

    // 监听 push_url 变化，自动加载模板列表
    useEffect(() => {
        if (formData.push_url && /^https?:\/\//.test(formData.push_url)) {
            const timer = setTimeout(() => {
                loadWxPushTemplates(formData.push_url);
            }, 800); // 防抖
            return () => clearTimeout(timer);
        }
    }, [formData.push_url]);

    // 编辑模式：加载任务数据
    useEffect(() => {
        if (editId) {
            loadTaskForEdit(editId);
        }
    }, [editId]);

    // 加载任务数据（编辑模式）
    const loadTaskForEdit = async (taskId: string) => {
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
                    secret: '******', // 回填脱敏密钥，后端收到 ****** 会保留原值
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
    };

    // 加载 go-wxpush 模板列表
    const loadWxPushTemplates = async (pushUrl: string) => {
        if (!pushUrl) return;
        try {
            setLoadingTemplates(true);

            // 智能修正 URL: 去掉可能的 /wxsend 或 /wxpush 后缀, 确保指向根路径
            // 例如: https://push.your-domain.com/wxpush -> https://push.your-domain.com
            let baseUrl = pushUrl.replace(/\/$/, '');
            baseUrl = baseUrl.replace(/\/wxsend$/, '').replace(/\/wxpush$/, '');

            const apiUrl = baseUrl + '/api/templates';

            console.log('Fetching templates from:', apiUrl);
            const res = await fetch(apiUrl);

            if (res.ok) {
                const data = await res.json();
                if (data.templates) {
                    setWxpushTemplates(data.templates);
                }
            } else {
                console.warn('Failed to fetch templates, status:', res.status);
            }
        } catch (e) {
            console.warn('Failed to load wxpush templates:', e);
        } finally {
            setLoadingTemplates(false);
        }
    };

    // 选择模板
    const handleSelectTemplate = (template: typeof templates[0]) => {
        setFormData((prev) => ({
            ...prev,
            title: template.title,
            content: template.content,
            schedule_type: template.schedule_type,
            schedule_time: template.schedule_time,
        }));
        setStep(2);
    };

    // 处理 NLP 解析结果
    const handleNlpApply = (result: NlpParseResult) => {
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
    };

    // 更新表单数据
    const updateFormData = (field: string, value: string | number | boolean) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    // 提交表单
    const handleSubmit = async () => {
        // 验证必填字段
        if (!formData.title.trim()) {
            setError('请输入任务标题');
            return;
        }
        if (!formData.content.trim()) {
            setError('请输入提醒内容');
            return;
        }
        // 编辑模式下不强制要求 secret（API 返回时会隐藏）
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

            // 调试日志
            console.log('[CreateTask] formData.template_name =', formData.template_name);

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
                template_name: formData.template_name || null,  // 空字符串时传 null 以清除设置
                ack_required: formData.ack_required,
                retry_interval: formData.ack_required ? formData.retry_interval : undefined,
            };

            // 根据类型添加额外字段
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
    };

    // AI 润色内容
    const handlePolish = async () => {
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

            // 尝试提取 JSON
            let jsonStr = resultStr;
            const match = resultStr.match(/\{[\s\S]*\}/);
            if (match) {
                jsonStr = match[0];
            }

            const json = JSON.parse(jsonStr);
            setFormData(prev => ({
                ...prev,
                title: json.title || prev.title,
                content: json.content || prev.content
            }));
        } catch (e) {
            console.error('Polish failed', e);
            setError('AI 润色失败，请重试');
        } finally {
            setPolishing(false);
        }
    };

    return (
        <div>
            {/* 页面标题 */}
            <div className="page-header">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Link to="/tasks" className="btn btn-ghost btn-icon" title="返回">
                            ←
                        </Link>
                        <div>
                            <h1 className="page-title">创建任务</h1>
                            <p className="page-subtitle">
                                {step === 1 && '第 1 步：选择任务模板'}
                                {step === 2 && '第 2 步：配置任务详情'}
                                {step === 3 && '第 3 步：配置推送信息'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 步骤指示器 */}
            <div className="steps-indicator">
                <div className={`step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
                    <div className="step-number">{step > 1 ? '✓' : '1'}</div>
                    <div className="step-label">选择模板</div>
                </div>
                <div className="step-line" />
                <div className={`step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
                    <div className="step-number">{step > 2 ? '✓' : '2'}</div>
                    <div className="step-label">任务配置</div>
                </div>
                <div className="step-line" />
                <div className={`step ${step >= 3 ? 'active' : ''}`}>
                    <div className="step-number">3</div>
                    <div className="step-label">推送配置</div>
                </div>
            </div>

            {/* 错误提示 */}
            {error && (
                <div className="alert alert-error">
                    <span>❌</span>
                    <span>{error}</span>
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            {/* 步骤 1：选择模板 */}
            {step === 1 && (
                <>
                    {/* 智能输入入口 */}
                    {!showNlpInput ? (
                        <div
                            className="nlp-entry-card"
                            onClick={() => setShowNlpInput(true)}
                            style={{
                                background: 'linear-gradient(135deg, hsl(245 50% 25%) 0%, hsl(280 50% 20%) 100%)',
                                border: '2px dashed hsl(245 50% 40%)',
                                borderRadius: '16px',
                                padding: '24px',
                                marginBottom: '24px',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.borderColor = 'var(--primary)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.borderColor = 'hsl(245 50% 40%)';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            <div style={{ fontSize: '40px' }}>🧠</div>
                            <div style={{ flex: 1 }}>
                                <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text)', marginBottom: '4px' }}>
                                    ✨ 智能输入
                                </h3>
                                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>
                                    用自然语言描述，如 "明天下午3点提醒我开会" 或 "every Friday at 5pm"
                                </p>
                            </div>
                            <div style={{ fontSize: '24px', color: 'var(--primary)' }}>→</div>
                        </div>
                    ) : (
                        <div style={{ marginBottom: '24px' }}>
                            <NlpInput
                                onApply={handleNlpApply}
                                onClose={() => setShowNlpInput(false)}
                            />
                        </div>
                    )}

                    {/* 分割线 */}
                    {!showNlpInput && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            marginBottom: '24px',
                            color: 'var(--text-muted)',
                            fontSize: '14px',
                        }}>
                            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                            <span>或选择模板</span>
                            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                        </div>
                    )}

                    {!showNlpInput && (
                        <div className="template-grid">
                            {templates.map((template) => (
                                <div
                                    key={template.id}
                                    className="template-card"
                                    style={{ '--template-color': template.color } as React.CSSProperties}
                                    onClick={() => handleSelectTemplate(template)}
                                >
                                    <div className="template-icon">{template.icon}</div>
                                    <div className="template-name">{template.name}</div>
                                    <div className="template-desc">
                                        {template.id === 'custom'
                                            ? '从头开始创建自定义提醒任务'
                                            : `预设：${getScheduleTypeLabel(template.schedule_type)} ${template.schedule_time}`}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 用户自定义模板（来自"消息模板"页面） */}
                    {!showNlpInput && userTemplates.length > 0 && (
                        <>
                            <h3 style={{ marginTop: '32px', marginBottom: '16px', color: 'var(--text-muted)', fontSize: '14px', fontWeight: 500 }}>
                                📝 我的模板（来自消息模板页面）
                            </h3>
                            <div className="template-grid">
                                {userTemplates.map((template) => (
                                    <div
                                        key={template.id}
                                        className="template-card"
                                        style={{ '--template-color': 'hsl(180, 60%, 50%)' } as React.CSSProperties}
                                        onClick={() => {
                                            // 解析模板中的变量并填充默认值
                                            let content = template.content;
                                            template.variables.forEach((v) => {
                                                const defaultVal = v === 'time' ? new Date().toLocaleString('zh-CN') : `{{${v}}}`;
                                                content = content.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), defaultVal);
                                            });
                                            setFormData((prev) => ({
                                                ...prev,
                                                title: template.name,
                                                content: content,
                                            }));
                                            setStep(2);
                                        }}
                                    >
                                        <div className="template-icon">📋</div>
                                        <div className="template-name">{template.name}</div>
                                        <div className="template-desc">{template.description || '自定义模板'}</div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </>
            )}

            {/* 步骤 2：任务配置 */}
            {step === 2 && (
                <div className="card">
                    <div className="form-grid">
                        {/* 基本信息 */}
                        <div className="form-section">
                            <h3 className="form-section-title">📋 基本信息</h3>
                            <div className="form-group">
                                <label className="form-label">任务标题 *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="例如：每日喝水提醒"
                                    value={formData.title}
                                    onChange={(e) => updateFormData('title', e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <label className="form-label" style={{ marginBottom: 0 }}>提醒内容 *</label>
                                    {hasAi && (
                                        <button
                                            className="btn btn-ghost btn-xs"
                                            onClick={handlePolish}
                                            disabled={polishing || (!formData.title && !formData.content)}
                                            title="使用 AI 优化标题和内容"
                                            style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            {polishing ? <span className="spinner-sm" style={{ width: '12px', height: '12px' }} /> : '✨'}
                                            AI 润色
                                        </button>
                                    )}
                                </div>
                                <textarea
                                    className="form-textarea"
                                    placeholder="输入要推送的消息内容..."
                                    value={formData.content}
                                    onChange={(e) => updateFormData('content', e.target.value)}
                                />
                            </div>
                        </div>

                        {/* 调度配置 */}
                        <div className="form-section">
                            <h3 className="form-section-title">⏰ 调度配置</h3>
                            <div className="form-group">
                                <label className="form-label">调度类型</label>
                                <select
                                    className="form-select"
                                    value={formData.schedule_type}
                                    onChange={(e) => updateFormData('schedule_type', e.target.value)}
                                >
                                    <option value="once">一次性</option>
                                    <option value="daily">每天</option>
                                    <option value="weekly">每周</option>
                                    <option value="monthly">每月</option>
                                    <option value="cron">Cron 表达式</option>
                                </select>
                            </div>

                            {/* 一次性：选择日期 */}
                            {formData.schedule_type === 'once' && (
                                <div className="form-group">
                                    <label className="form-label">执行日期</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={formData.schedule_date}
                                        onChange={(e) => updateFormData('schedule_date', e.target.value)}
                                    />
                                </div>
                            )}

                            {/* 每周：选择星期 */}
                            {formData.schedule_type === 'weekly' && (
                                <div className="form-group">
                                    <label className="form-label">执行星期</label>
                                    <select
                                        className="form-select"
                                        value={formData.schedule_weekday}
                                        onChange={(e) => updateFormData('schedule_weekday', parseInt(e.target.value))}
                                    >
                                        <option value={0}>周日</option>
                                        <option value={1}>周一</option>
                                        <option value={2}>周二</option>
                                        <option value={3}>周三</option>
                                        <option value={4}>周四</option>
                                        <option value={5}>周五</option>
                                        <option value={6}>周六</option>
                                    </select>
                                </div>
                            )}

                            {/* 每月：选择日期 */}
                            {formData.schedule_type === 'monthly' && (
                                <div className="form-group">
                                    <label className="form-label">执行日期</label>
                                    <select
                                        className="form-select"
                                        value={formData.schedule_day}
                                        onChange={(e) => updateFormData('schedule_day', parseInt(e.target.value))}
                                    >
                                        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                                            <option key={day} value={day}>
                                                每月 {day} 日
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Cron 表达式 */}
                            {formData.schedule_type === 'cron' && (
                                <div className="form-group">
                                    <label className="form-label">Cron 表达式</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="例如：0 9 * * 1-5（工作日 9:00）"
                                        value={formData.schedule_cron}
                                        onChange={(e) => updateFormData('schedule_cron', e.target.value)}
                                    />
                                    <div className="form-hint">
                                        格式：分钟 小时 日 月 星期。示例：<code>0 9 * * 1-5</code> = 工作日每天 9:00
                                    </div>
                                </div>
                            )}

                            {/* 执行时间（非 Cron 模式） */}
                            {formData.schedule_type !== 'cron' && (
                                <div className="form-group">
                                    <label className="form-label">执行时间</label>
                                    <input
                                        type="time"
                                        className="form-input"
                                        value={formData.schedule_time}
                                        onChange={(e) => updateFormData('schedule_time', e.target.value)}
                                    />
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">时区</label>
                                <select
                                    className="form-select"
                                    value={formData.timezone}
                                    onChange={(e) => updateFormData('timezone', e.target.value)}
                                >
                                    <option value="Asia/Shanghai">Asia/Shanghai (UTC+8)</option>
                                    <option value="Asia/Tokyo">Asia/Tokyo (UTC+9)</option>
                                    <option value="America/New_York">America/New_York (UTC-5)</option>
                                    <option value="Europe/London">Europe/London (UTC+0)</option>
                                    <option value="UTC">UTC</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="form-group" style={{ marginTop: '24px', padding: '16px', background: '#fff1f2', borderRadius: '8px', border: '1px solid #fda4af' }}>
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginBottom: '8px', color: '#be123c', fontSize: '15px' }}>
                            <input
                                type="checkbox"
                                checked={formData.ack_required || false}
                                onChange={(e) => updateFormData('ack_required', e.target.checked)}
                                style={{ width: '20px', height: '20px', marginRight: '10px', accentColor: '#e11d48' }}
                            />
                            开启强提醒 (催命模式) 🔥
                        </label>
                        <div className="form-hint" style={{ marginLeft: '30px', color: '#881337' }}>
                            开启后，若未点击推送消息中的“收到”按钮，系统将每隔 <strong>30分钟</strong> 持续轰炸，直到确认收到为止。
                        </div>

                        {/* 重试间隔设置 - 仅在开启强提醒时显示 */}
                        {formData.ack_required && (
                            <div style={{ marginTop: '12px', marginLeft: '30px' }}>
                                <label className="form-label" style={{ color: '#881337', fontSize: '13px', marginBottom: '6px' }}>
                                    重试间隔（分钟）
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="number"
                                        min="1"
                                        max="1440"
                                        className="form-input"
                                        value={formData.retry_interval}
                                        onChange={(e) => updateFormData('retry_interval', Math.max(1, Math.min(1440, parseInt(e.target.value) || 30)))}
                                        style={{ width: '100px', padding: '6px 10px' }}
                                    />
                                    <span style={{ color: '#881337', fontSize: '13px' }}>
                                        每隔 <strong>{formData.retry_interval}</strong> 分钟提醒一次
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                    {/* 操作按钮 */}
                    <div className="form-actions">
                        <button className="btn btn-secondary" onClick={() => setStep(1)}>
                            ← 上一步
                        </button>
                        <button className="btn btn-primary" onClick={() => setStep(3)}>
                            下一步 →
                        </button>
                    </div>
                </div>
            )}

            {/* 步骤 3：推送配置 */}
            {
                step === 3 && (
                    <div className="card">
                        <div className="form-section">
                            <div className="form-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h3 className="form-section-title" style={{ marginBottom: 0 }}>📱 微信推送配置</h3>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        className="btn btn-ghost btn-xs"
                                        onClick={() => setManageModal({ open: true, category: 'push_config', title: '常用推送配置' })}
                                    >
                                        ⚙️ 管理库
                                    </button>
                                    {savedPushConfigs.length > 0 && (
                                        <select
                                            className="form-select"
                                            style={{ width: '150px', fontSize: '12px', padding: '4px 8px' }}
                                            onChange={(e) => {
                                                const config = savedPushConfigs.find(c => c.id.toString() === e.target.value);
                                                if (config) {
                                                    try {
                                                        const val = JSON.parse(config.value);
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            appid: val.appid || prev.appid,
                                                            secret: val.secret || prev.secret,
                                                            userid: val.userid || prev.userid,
                                                            template_id: val.template_id || prev.template_id,
                                                        }));
                                                    } catch (e) { console.error('解析配置失败', e); }
                                                }
                                            }}
                                            value=""
                                        >
                                            <option value="">快速从库填充...</option>
                                            {savedPushConfigs.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            </div>
                            <p className="form-section-desc">
                                配置 go-wxpush 服务所需的微信公众号信息。如果您还没有配置，请先完成微信公众号的开发者配置。
                            </p>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">AppID *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="公众号 AppID"
                                        value={formData.appid}
                                        onChange={(e) => updateFormData('appid', e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">AppSecret *</label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        placeholder="公众号 AppSecret"
                                        value={formData.secret}
                                        onChange={(e) => updateFormData('secret', e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>用户 OpenID *</span>
                                        <button
                                            className="btn btn-ghost btn-xs"
                                            onClick={() => setManageModal({ open: true, category: 'wxpush_userid', title: '常用用户ID' })}
                                        >
                                            ⚙️ 管理
                                        </button>
                                    </label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="接收消息的用户 OpenID"
                                            value={formData.userid}
                                            onChange={(e) => updateFormData('userid', e.target.value)}
                                            list="saved-userids"
                                        />
                                        <datalist id="saved-userids">
                                            {savedUserIds.map(c => (
                                                <option key={c.id} value={c.value}>{c.name}</option>
                                            ))}
                                        </datalist>
                                        {savedUserIds.length > 0 && (
                                            <select
                                                className="form-select"
                                                style={{ width: '120px' }}
                                                onChange={(e) => {
                                                    if (e.target.value) updateFormData('userid', e.target.value);
                                                }}
                                                value=""
                                            >
                                                <option value="">快速选择</option>
                                                {savedUserIds.map(c => (
                                                    <option key={c.id} value={c.value}>{c.name}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>模板 ID *</span>
                                        <button
                                            className="btn btn-ghost btn-xs"
                                            onClick={() => setManageModal({ open: true, category: 'wxpush_templateid', title: '常用模板ID' })}
                                        >
                                            ⚙️ 管理
                                        </button>
                                    </label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="微信消息模板 ID"
                                            value={formData.template_id}
                                            onChange={(e) => updateFormData('template_id', e.target.value)}
                                            list="saved-templateids"
                                        />
                                        <datalist id="saved-templateids">
                                            {savedTemplateIds.map(c => (
                                                <option key={c.id} value={c.value}>{c.name}</option>
                                            ))}
                                        </datalist>
                                        {savedTemplateIds.length > 0 && (
                                            <select
                                                className="form-select"
                                                style={{ width: '120px' }}
                                                onChange={(e) => {
                                                    if (e.target.value) updateFormData('template_id', e.target.value);
                                                }}
                                                value=""
                                            >
                                                <option value="">快速选择</option>
                                                {savedTemplateIds.map(c => (
                                                    <option key={c.id} value={c.value}>{c.name}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">推送服务地址</label>
                                <input
                                    type="url"
                                    className="form-input"
                                    placeholder="例如：https://push.your-domain.com"
                                    value={formData.push_url}
                                    onChange={(e) => updateFormData('push_url', e.target.value)}
                                />
                                <div className="form-hint">
                                    指定用于发送消息的 go-wxpush 服务地址（留空则使用默认配置）
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>详情页模板</span>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-xs"
                                            onClick={() => loadWxPushTemplates(formData.push_url)}
                                            disabled={loadingTemplates}
                                            title="刷新模板列表"
                                        >
                                            {loadingTemplates ? (
                                                <span className="spinner-sm" style={{ width: '12px', height: '12px', borderWidth: '1px' }} />
                                            ) : (
                                                '🔄'
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-xs"
                                            onClick={() => setInputMode(prev => prev === 'select' ? 'input' : 'select')}
                                            title={inputMode === 'select' ? "切换到手动输入" : "切换到列表选择"}
                                            style={{ fontSize: '12px' }}
                                        >
                                            {inputMode === 'select' ? '✍️ 手动' : '📋 列表'}
                                        </button>
                                    </div>
                                </label>

                                {inputMode === 'select' ? (
                                    <select
                                        className="form-input"
                                        value={formData.template_name}
                                        onChange={(e) => updateFormData('template_name', e.target.value)}
                                        disabled={loadingTemplates}
                                    >
                                        <option value="">使用默认模板 (default)</option>
                                        {wxpushTemplates.map((tpl) => (
                                            <option key={tpl.id} value={tpl.name}>
                                                {tpl.name} {tpl.description ? `- ${tpl.description}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="输入模板名称 (例如: holiday)"
                                        value={formData.template_name}
                                        onChange={(e) => updateFormData('template_name', e.target.value)}
                                    />
                                )}

                                <div className="form-hint">
                                    {inputMode === 'select'
                                        ? '选择预设的 HTML 详情页模板（需先在 go-wxpush 服务中配置）'
                                        : '手动指定 go-wxpush 服务中详情页模板的名称'}
                                </div>
                            </div>
                        </div>

                        {/* 任务预览 */}
                        <div className="form-section">
                            <h3 className="form-section-title">📋 任务预览</h3>
                            <div className="preview-card">
                                <div className="preview-row">
                                    <span className="preview-label">任务标题</span>
                                    <span className="preview-value">{formData.title || '-'}</span>
                                </div>
                                <div className="preview-row">
                                    <span className="preview-label">提醒内容</span>
                                    <span className="preview-value">{formData.content || '-'}</span>
                                </div>
                                <div className="preview-row">
                                    <span className="preview-label">执行时间</span>
                                    <span className="preview-value">
                                        {getSchedulePreview(formData)}
                                    </span>
                                </div>
                                <div className="preview-row">
                                    <span className="preview-label">接收用户</span>
                                    <span className="preview-value table-mono">{formData.userid || '-'}</span>
                                </div>
                                <div className="preview-row">
                                    <span className="preview-label">模板 ID</span>
                                    <span className="preview-value table-mono">{formData.template_id || '-'}</span>
                                </div>
                            </div>
                        </div>

                        {/* 操作按钮 */}
                        <div className="form-actions">
                            <button className="btn btn-secondary" onClick={() => setStep(2)}>
                                ← 上一步
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSubmit}
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <span className="spinner-sm" />
                                        创建中...
                                    </>
                                ) : (
                                    '✅ 创建任务'
                                )}
                            </button>
                        </div>
                    </div>
                )
            }
            {/* 配置管理弹窗 */}
            {manageModal.open && (
                <ConfigManagerModal
                    isOpen={manageModal.open}
                    onClose={() => {
                        setManageModal(prev => ({ ...prev, open: false }));
                        loadSavedConfigs(manageModal.category);
                    }}
                    category={manageModal.category}
                    title={manageModal.title}
                    onSelect={(value) => {
                        if (manageModal.category === 'wxpush_userid') updateFormData('userid', value);
                        if (manageModal.category === 'wxpush_templateid') updateFormData('template_id', value);
                        if (manageModal.category === 'push_config') {
                            try {
                                const val = JSON.parse(value);
                                setFormData(prev => ({
                                    ...prev,
                                    appid: val.appid || prev.appid,
                                    secret: val.secret || prev.secret,
                                    userid: val.userid || prev.userid,
                                    template_id: val.template_id || prev.template_id,
                                }));
                            } catch (e) { console.error('解析失败', e); }
                        }
                    }}
                />
            )}
        </div>
    );
}

// 获取调度类型标签
function getScheduleTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        once: '一次性',
        daily: '每天',
        weekly: '每周',
        monthly: '每月',
        cron: 'Cron',
    };
    return labels[type] || type;
}

// 获取调度预览文本
function getSchedulePreview(formData: {
    schedule_type: string;
    schedule_time: string;
    schedule_date: string;
    schedule_weekday: number;
    schedule_day: number;
    schedule_cron: string;
    timezone: string;
}): string {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    switch (formData.schedule_type) {
        case 'once':
            return `${formData.schedule_date || '待设置'} ${formData.schedule_time} (${formData.timezone})`;
        case 'daily':
            return `每天 ${formData.schedule_time} (${formData.timezone})`;
        case 'weekly':
            return `每${weekdays[formData.schedule_weekday]} ${formData.schedule_time} (${formData.timezone})`;
        case 'monthly':
            return `每月 ${formData.schedule_day} 日 ${formData.schedule_time} (${formData.timezone})`;
        case 'cron':
            return formData.schedule_cron || '待设置 Cron 表达式';
        default:
            return '-';
    }
}
