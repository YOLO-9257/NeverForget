import React from 'react';
import type { MessageTemplate, TemplateEditForm } from './types';
import styles from './Templates.module.css';

interface TemplateEditorProps {
    editForm: TemplateEditForm;
    isCreating: boolean;
    onFormChange: (form: TemplateEditForm) => void;
    onSave: () => void;
    onCancel: () => void;
}

/**
 * 模板编辑器组件
 * 负责创建和编辑模板的表单
 */
export const TemplateEditor: React.FC<TemplateEditorProps> = ({
    editForm,
    isCreating,
    onFormChange,
    onSave,
    onCancel,
}) => {
    const updateField = <K extends keyof TemplateEditForm>(key: K, value: TemplateEditForm[K]) => {
        onFormChange({ ...editForm, [key]: value });
    };

    return (
        <div className={styles.detailCard}>
            <div className={styles.detailHeader}>
                <h3 className={styles.detailTitle}>
                    {isCreating ? '创建新模板' : '编辑模板'}
                </h3>
                <button className="btn btn-ghost btn-sm" onClick={onCancel}>
                    取消
                </button>
            </div>

            <div className={styles.editorForm}>
                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>模板名称 *</label>
                    <input
                        type="text"
                        className={styles.formInput}
                        placeholder="例如：会议通知模板"
                        value={editForm.name}
                        onChange={(e) => updateField('name', e.target.value)}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>模板描述</label>
                    <input
                        type="text"
                        className={styles.formInput}
                        placeholder="简要描述模板用途"
                        value={editForm.description}
                        onChange={(e) => updateField('description', e.target.value)}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>分类</label>
                    <select
                        className={styles.formSelect}
                        value={editForm.category}
                        onChange={(e) => updateField('category', e.target.value as MessageTemplate['category'])}
                    >
                        <option value="reminder">提醒</option>
                        <option value="notification">通知</option>
                        <option value="greeting">祝福</option>
                        <option value="custom">自定义</option>
                    </select>
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                        模板内容 *
                        <span className={styles.formHint}>
                            使用 {"{{变量名}}"} 定义变量
                        </span>
                    </label>
                    <textarea
                        className={styles.formTextarea}
                        placeholder="输入模板内容，使用 {{变量名}} 定义可替换的变量..."
                        value={editForm.content}
                        onChange={(e) => updateField('content', e.target.value)}
                    />
                </div>

                <div className={styles.formActions}>
                    <button className="btn btn-primary" onClick={onSave}>
                        💾 保存模板
                    </button>
                </div>
            </div>
        </div>
    );
};
