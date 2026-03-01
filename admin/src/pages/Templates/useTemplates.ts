import { useState, useCallback } from 'react';
import type { MessageTemplate, TemplateEditForm } from './types';
import { DEFAULT_VARIABLE_VALUES } from './types';
import { defaultTemplates } from './defaultTemplates';

function getInitialTemplates(): MessageTemplate[] {
    const savedTemplates = localStorage.getItem('message_templates');
    if (!savedTemplates) {
        return defaultTemplates;
    }

    try {
        const parsed = JSON.parse(savedTemplates);
        if (!Array.isArray(parsed)) {
            return defaultTemplates;
        }
        return [...defaultTemplates, ...parsed];
    } catch {
        return defaultTemplates;
    }
}

/**
 * 模板管理核心 Hook
 * 封装所有模板 CRUD 操作和状态管理
 */
export function useTemplates() {
    const [templates, setTemplates] = useState<MessageTemplate[]>(getInitialTemplates);
    const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({});
    const [editForm, setEditForm] = useState<TemplateEditForm>({
        name: '',
        description: '',
        content: '',
        category: 'custom',
    });

    // 保存模板到 localStorage
    const saveTemplates = useCallback((newTemplates: MessageTemplate[]) => {
        const customTemplates = newTemplates.filter(
            (t) => !defaultTemplates.find((dt) => dt.id === t.id)
        );
        localStorage.setItem('message_templates', JSON.stringify(customTemplates));
        setTemplates(newTemplates);
    }, []);

    // 筛选模板
    const filteredTemplates = templates.filter((template) => {
        const matchesCategory = filterCategory === 'all' || template.category === filterCategory;
        const matchesSearch =
            searchQuery === '' ||
            template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            template.description.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    // 选择模板
    const handleSelectTemplate = useCallback((template: MessageTemplate) => {
        setSelectedTemplate(template);
        setIsEditing(false);
        setIsCreating(false);

        const vars: Record<string, string> = {};
        template.variables.forEach((v) => {
            vars[v] = DEFAULT_VARIABLE_VALUES[v] || `{{${v}}}`;
        });
        setPreviewVariables(vars);
    }, []);

    // 开始编辑
    const handleStartEdit = useCallback(() => {
        if (selectedTemplate) {
            setEditForm({
                name: selectedTemplate.name,
                description: selectedTemplate.description,
                content: selectedTemplate.content,
                category: selectedTemplate.category,
            });
            setIsEditing(true);
        }
    }, [selectedTemplate]);

    // 开始创建
    const handleStartCreate = useCallback(() => {
        setEditForm({ name: '', description: '', content: '', category: 'custom' });
        setSelectedTemplate(null);
        setIsCreating(true);
        setIsEditing(false);
    }, []);

    // 保存模板
    const handleSave = useCallback(() => {
        if (!editForm.name.trim() || !editForm.content.trim()) {
            alert('请填写模板名称和内容');
            return;
        }

        const variableMatches = editForm.content.match(/\{\{(\w+)\}\}/g) || [];
        const variables = [...new Set(variableMatches.map((v) => v.replace(/[{}]/g, '')))];

        if (isCreating) {
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
            const updatedTemplates = templates.map((t) =>
                t.id === selectedTemplate.id
                    ? { ...t, name: editForm.name, description: editForm.description, content: editForm.content, category: editForm.category, variables, updatedAt: Date.now() }
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
    }, [editForm, isCreating, selectedTemplate, templates, saveTemplates]);

    // 删除模板
    const handleDelete = useCallback(() => {
        if (!selectedTemplate) return;
        if (defaultTemplates.find((t) => t.id === selectedTemplate.id)) {
            alert('默认模板不可删除');
            return;
        }
        if (!confirm(`确定要删除模板 "${selectedTemplate.name}" 吗？`)) return;

        const updatedTemplates = templates.filter((t) => t.id !== selectedTemplate.id);
        saveTemplates(updatedTemplates);
        setSelectedTemplate(null);
    }, [selectedTemplate, templates, saveTemplates]);

    // 复制模板内容
    const handleCopyContent = useCallback(() => {
        if (selectedTemplate) {
            navigator.clipboard.writeText(selectedTemplate.content);
            alert('模板内容已复制到剪贴板');
        }
    }, [selectedTemplate]);

    // 取消编辑
    const handleCancelEdit = useCallback(() => {
        setIsEditing(false);
        setIsCreating(false);
    }, []);

    // 渲染预览内容
    const renderPreview = useCallback((content: string, variables: Record<string, string>): string => {
        let result = content;
        Object.entries(variables).forEach(([key, value]) => {
            result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
        });
        return result;
    }, []);

    // 判断是否为默认模板
    const isDefaultTemplate = useCallback((template: MessageTemplate) => {
        return !!defaultTemplates.find((t) => t.id === template.id);
    }, []);

    return {
        // State
        templates,
        selectedTemplate,
        isEditing,
        isCreating,
        filterCategory,
        searchQuery,
        previewVariables,
        editForm,
        filteredTemplates,
        // Setters
        setFilterCategory,
        setSearchQuery,
        setPreviewVariables,
        setEditForm,
        // Actions
        handleSelectTemplate,
        handleStartEdit,
        handleStartCreate,
        handleSave,
        handleDelete,
        handleCopyContent,
        handleCancelEdit,
        renderPreview,
        isDefaultTemplate,
    };
}
