import { useState, useEffect } from 'react';

/**
 * HTML 消息模板管理页面
 * 支持创建、编辑、预览和管理消息模板
 */

// 模板类型定义
interface MessageTemplate {
    id: string;
    name: string;
    description: string;
    content: string;
    variables: string[];
    category: 'reminder' | 'notification' | 'greeting' | 'custom';
    createdAt: number;
    updatedAt: number;
}

// 预设模板
const defaultTemplates: MessageTemplate[] = [
    {
        id: 'default-reminder',
        name: '通用提醒',
        description: '简洁的提醒消息模板',
        content: '{{title}}\n\n{{content}}\n\n⏰ 发送时间：{{time}}',
        variables: ['title', 'content', 'time'],
        category: 'reminder',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'drink-water',
        name: '喝水提醒',
        description: '带有趣味图标的喝水提醒',
        content: '💧 {{title}} 💧\n\n{{content}}\n\n保持健康，从每一杯水开始！\n\n━━━━━━━━━━━━━━━\n⏰ {{time}}',
        variables: ['title', 'content', 'time'],
        category: 'reminder',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'work-break',
        name: '工作休息',
        description: '提醒用户休息的模板',
        content: '☕ {{title}}\n\n{{content}}\n\n🧘 适当休息，工作更高效！\n\n今日已工作：{{hours}}小时',
        variables: ['title', 'content', 'hours'],
        category: 'reminder',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'meeting-alert',
        name: '会议提醒',
        description: '正式的会议通知模板',
        content: '📅 会议提醒\n\n━━━━━━━━━━━━━━━\n📌 会议主题：{{title}}\n⏰ 开始时间：{{time}}\n📍 会议地点：{{location}}\n━━━━━━━━━━━━━━━\n\n{{content}}\n\n请提前5分钟到场！',
        variables: ['title', 'time', 'location', 'content'],
        category: 'notification',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
    {
        id: 'birthday',
        name: '生日祝福',
        description: '生日祝福消息模板',
        content: '🎂 {{title}} 🎉\n\n亲爱的 {{name}}：\n\n{{content}}\n\n🎁🎈🎊 祝您生日快乐！🎊🎈🎁',
        variables: ['title', 'name', 'content'],
        category: 'greeting',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
];

export function Templates() {
    const [templates, setTemplates] = useState<MessageTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({});

    // 编辑表单状态
    const [editForm, setEditForm] = useState({
        name: '',
        description: '',
        content: '',
        category: 'custom' as MessageTemplate['category'],
    });

    // 加载模板数据
    useEffect(() => {
        // 从 localStorage 加载自定义模板
        const savedTemplates = localStorage.getItem('message_templates');
        if (savedTemplates) {
            try {
                const parsed = JSON.parse(savedTemplates);
                setTemplates([...defaultTemplates, ...parsed]);
            } catch {
                setTemplates(defaultTemplates);
            }
        } else {
            setTemplates(defaultTemplates);
        }
    }, []);

    // 保存模板到 localStorage
    const saveTemplates = (newTemplates: MessageTemplate[]) => {
        const customTemplates = newTemplates.filter(
            (t) => !defaultTemplates.find((dt) => dt.id === t.id)
        );
        localStorage.setItem('message_templates', JSON.stringify(customTemplates));
        setTemplates(newTemplates);
    };

    // 筛选模板
    const filteredTemplates = templates.filter((template) => {
        const matchesCategory = filterCategory === 'all' || template.category === filterCategory;
        const matchesSearch =
            searchQuery === '' ||
            template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            template.description.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    // 选择模板查看详情
    const handleSelectTemplate = (template: MessageTemplate) => {
        setSelectedTemplate(template);
        setIsEditing(false);
        setIsCreating(false);

        // 初始化预览变量
        const vars: Record<string, string> = {};
        template.variables.forEach((v) => {
            vars[v] = getDefaultVariableValue(v);
        });
        setPreviewVariables(vars);
    };

    // 获取变量默认值
    const getDefaultVariableValue = (varName: string): string => {
        const defaults: Record<string, string> = {
            title: '测试标题',
            content: '这是一条测试消息内容',
            time: new Date().toLocaleString('zh-CN'),
            name: '用户',
            hours: '4',
            location: '会议室A',
        };
        return defaults[varName] || `{{${varName}}}`;
    };

    // 渲染预览内容
    const renderPreview = (content: string, variables: Record<string, string>): string => {
        let result = content;
        Object.entries(variables).forEach(([key, value]) => {
            result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
        });
        return result;
    };

    // 开始编辑
    const handleStartEdit = () => {
        if (selectedTemplate) {
            setEditForm({
                name: selectedTemplate.name,
                description: selectedTemplate.description,
                content: selectedTemplate.content,
                category: selectedTemplate.category,
            });
            setIsEditing(true);
        }
    };

    // 开始创建
    const handleStartCreate = () => {
        setEditForm({
            name: '',
            description: '',
            content: '',
            category: 'custom',
        });
        setSelectedTemplate(null);
        setIsCreating(true);
        setIsEditing(false);
    };

    // 保存模板
    const handleSave = () => {
        if (!editForm.name.trim() || !editForm.content.trim()) {
            alert('请填写模板名称和内容');
            return;
        }

        // 提取变量
        const variableMatches = editForm.content.match(/\{\{(\w+)\}\}/g) || [];
        const variables = [...new Set(variableMatches.map((v) => v.replace(/[{}]/g, '')))];

        if (isCreating) {
            // 创建新模板
            const newTemplate: MessageTemplate = {
                id: `custom-${Date.now()}`,
                name: editForm.name,
                description: editForm.description,
                content: editForm.content,
                variables,
                category: editForm.category,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            saveTemplates([...templates, newTemplate]);
            setSelectedTemplate(newTemplate);
        } else if (selectedTemplate) {
            // 更新现有模板
            const updatedTemplates = templates.map((t) =>
                t.id === selectedTemplate.id
                    ? {
                        ...t,
                        name: editForm.name,
                        description: editForm.description,
                        content: editForm.content,
                        category: editForm.category,
                        variables,
                        updatedAt: Date.now(),
                    }
                    : t
            );
            saveTemplates(updatedTemplates);
            setSelectedTemplate({
                ...selectedTemplate,
                name: editForm.name,
                description: editForm.description,
                content: editForm.content,
                category: editForm.category,
                variables,
                updatedAt: Date.now(),
            });
        }

        setIsEditing(false);
        setIsCreating(false);
    };

    // 删除模板
    const handleDelete = () => {
        if (!selectedTemplate) return;

        // 不允许删除默认模板
        if (defaultTemplates.find((t) => t.id === selectedTemplate.id)) {
            alert('默认模板不可删除');
            return;
        }

        if (!confirm(`确定要删除模板 "${selectedTemplate.name}" 吗？`)) {
            return;
        }

        const updatedTemplates = templates.filter((t) => t.id !== selectedTemplate.id);
        saveTemplates(updatedTemplates);
        setSelectedTemplate(null);
    };

    // 复制模板内容
    const handleCopyContent = () => {
        if (selectedTemplate) {
            navigator.clipboard.writeText(selectedTemplate.content);
            alert('模板内容已复制到剪贴板');
        }
    };

    // 获取分类标签
    const getCategoryLabel = (category: string): string => {
        const labels: Record<string, string> = {
            reminder: '提醒',
            notification: '通知',
            greeting: '祝福',
            custom: '自定义',
        };
        return labels[category] || category;
    };

    // 获取分类颜色
    const getCategoryColor = (category: string): string => {
        const colors: Record<string, string> = {
            reminder: 'hsl(200, 80%, 50%)',
            notification: 'hsl(260, 70%, 55%)',
            greeting: 'hsl(340, 80%, 55%)',
            custom: 'hsl(150, 70%, 45%)',
        };
        return colors[category] || 'hsl(245, 80%, 60%)';
    };

    return (
        <div>
            {/* 页面标题 */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">消息模板</h1>
                    <p className="page-subtitle">管理和自定义推送消息的 HTML 模板</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        className="btn btn-secondary"
                        onClick={() => {
                            const savedConfig = localStorage.getItem('default_push_config');
                            let adminUrl = 'http://localhost:5566/admin'; // 默认 fallback
                            if (savedConfig) {
                                try {
                                    const config = JSON.parse(savedConfig);
                                    if (config.push_service_url) {
                                        try {
                                            // 尝试解析 URL 获取 origin，避免 /wxpush 等子路径导致 404
                                            const urlObj = new URL(config.push_service_url);
                                            adminUrl = `${urlObj.origin}/admin`;
                                        } catch (e) {
                                            // 降级处理：直接拼接
                                            adminUrl = config.push_service_url.replace(/\/$/, '') + '/admin';
                                        }
                                    }
                                } catch (e) {
                                    console.warn('Failed to parse push config', e);
                                }
                            }
                            window.open(adminUrl, '_blank');
                        }}
                        title="打开 go-wxpush 模板管理后台"
                    >
                        🌐 管理远程模板
                    </button>
                    <button className="btn btn-primary" onClick={handleStartCreate}>
                        ➕ 创建模板
                    </button>
                </div>
            </div>

            {/* 主内容区域 */}
            <div className="templates-layout">
                {/* 左侧：模板列表 */}
                <div className="templates-sidebar">
                    {/* 搜索和筛选 */}
                    <div className="templates-filters">
                        <input
                            type="text"
                            className="form-input"
                            placeholder="🔍 搜索模板..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <div className="tabs" style={{ marginTop: '12px' }}>
                            {['all', 'reminder', 'notification', 'greeting', 'custom'].map((cat) => (
                                <button
                                    key={cat}
                                    className={`tab ${filterCategory === cat ? 'active' : ''}`}
                                    onClick={() => setFilterCategory(cat)}
                                >
                                    {cat === 'all' ? '全部' : getCategoryLabel(cat)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 模板列表 */}
                    <div className="templates-list">
                        {filteredTemplates.length === 0 ? (
                            <div className="empty-state" style={{ padding: '40px 20px' }}>
                                <div className="empty-state-icon">📝</div>
                                <div className="empty-state-title">暂无模板</div>
                                <div className="empty-state-text">
                                    {searchQuery ? '没有找到匹配的模板' : '开始创建您的第一个模板'}
                                </div>
                            </div>
                        ) : (
                            filteredTemplates.map((template) => (
                                <div
                                    key={template.id}
                                    className={`template-list-item ${selectedTemplate?.id === template.id ? 'active' : ''
                                        }`}
                                    onClick={() => handleSelectTemplate(template)}
                                >
                                    <div
                                        className="template-list-indicator"
                                        style={{ background: getCategoryColor(template.category) }}
                                    />
                                    <div className="template-list-content">
                                        <div className="template-list-name">{template.name}</div>
                                        <div className="template-list-desc">{template.description}</div>
                                        <div className="template-list-meta">
                                            <span className="badge" style={{
                                                background: `${getCategoryColor(template.category)}20`,
                                                color: getCategoryColor(template.category)
                                            }}>
                                                {getCategoryLabel(template.category)}
                                            </span>
                                            <span>{template.variables.length} 个变量</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 右侧：模板详情/编辑 */}
                <div className="templates-detail">
                    {isCreating || isEditing ? (
                        /* 编辑模式 */
                        <div className="card">
                            <div className="card-header">
                                <h3 className="card-title">
                                    {isCreating ? '创建新模板' : '编辑模板'}
                                </h3>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => {
                                        setIsEditing(false);
                                        setIsCreating(false);
                                    }}
                                >
                                    取消
                                </button>
                            </div>

                            <div className="form-group">
                                <label className="form-label">模板名称 *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="例如：会议通知模板"
                                    value={editForm.name}
                                    onChange={(e) =>
                                        setEditForm((prev) => ({ ...prev, name: e.target.value }))
                                    }
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">模板描述</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="简要描述模板用途"
                                    value={editForm.description}
                                    onChange={(e) =>
                                        setEditForm((prev) => ({ ...prev, description: e.target.value }))
                                    }
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">分类</label>
                                <select
                                    className="form-select"
                                    value={editForm.category}
                                    onChange={(e) =>
                                        setEditForm((prev) => ({
                                            ...prev,
                                            category: e.target.value as MessageTemplate['category'],
                                        }))
                                    }
                                >
                                    <option value="reminder">提醒</option>
                                    <option value="notification">通知</option>
                                    <option value="greeting">祝福</option>
                                    <option value="custom">自定义</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">
                                    模板内容 *
                                    <span className="form-hint" style={{ marginLeft: '8px' }}>
                                        使用 {"{{变量名}}"} 定义变量
                                    </span>
                                </label>
                                <textarea
                                    className="form-textarea"
                                    style={{ minHeight: '200px', fontFamily: 'var(--font-mono)' }}
                                    placeholder="输入模板内容，使用 {{变量名}} 定义可替换的变量..."
                                    value={editForm.content}
                                    onChange={(e) =>
                                        setEditForm((prev) => ({ ...prev, content: e.target.value }))
                                    }
                                />
                            </div>

                            <div className="form-actions">
                                <button className="btn btn-primary" onClick={handleSave}>
                                    💾 保存模板
                                </button>
                            </div>
                        </div>
                    ) : selectedTemplate ? (
                        /* 预览模式 */
                        <div className="card">
                            <div className="card-header">
                                <div>
                                    <h3 className="card-title">{selectedTemplate.name}</h3>
                                    <p className="card-subtitle">{selectedTemplate.description}</p>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button className="btn btn-ghost btn-sm" onClick={handleCopyContent}>
                                        📋 复制
                                    </button>
                                    <button className="btn btn-secondary btn-sm" onClick={handleStartEdit}>
                                        ✏️ 编辑
                                    </button>
                                    {!defaultTemplates.find((t) => t.id === selectedTemplate.id) && (
                                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={handleDelete}>
                                            🗑 删除
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* 变量配置 */}
                            {selectedTemplate.variables.length > 0 && (
                                <div className="template-variables">
                                    <h4 className="variables-title">变量配置</h4>
                                    <div className="variables-grid">
                                        {selectedTemplate.variables.map((varName) => (
                                            <div key={varName} className="variable-item">
                                                <label className="form-label">
                                                    <code>{`{{${varName}}}`}</code>
                                                </label>
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    value={previewVariables[varName] || ''}
                                                    onChange={(e) =>
                                                        setPreviewVariables((prev) => ({
                                                            ...prev,
                                                            [varName]: e.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 实时预览 */}
                            <div className="template-preview">
                                <h4 className="preview-title">📱 消息预览</h4>
                                <div className="preview-phone">
                                    <div className="phone-header">
                                        <span>微信</span>
                                    </div>
                                    <div className="phone-content">
                                        <div className="message-bubble">
                                            <pre className="message-text">
                                                {renderPreview(selectedTemplate.content, previewVariables)}
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 原始内容 */}
                            <div className="template-source">
                                <h4 className="source-title">📝 原始模板</h4>
                                <pre className="source-code">{selectedTemplate.content}</pre>
                            </div>
                        </div>
                    ) : (
                        /* 未选择模板 */
                        <div className="card">
                            <div className="empty-state">
                                <div className="empty-state-icon">📝</div>
                                <div className="empty-state-title">选择一个模板</div>
                                <div className="empty-state-text">
                                    从左侧列表选择模板进行预览和编辑，或创建新模板
                                </div>
                                <button className="btn btn-primary" onClick={handleStartCreate}>
                                    ➕ 创建模板
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
