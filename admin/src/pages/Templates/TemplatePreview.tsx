import React from 'react';
import type { MessageTemplate } from './types';
import styles from './Templates.module.css';

interface TemplatePreviewProps {
    template: MessageTemplate;
    previewVariables: Record<string, string>;
    isDefault: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onCopy: () => void;
    onVariableChange: (varName: string, value: string) => void;
    renderPreview: (content: string, variables: Record<string, string>) => string;
}

/**
 * 模板预览组件
 * 展示模板详情、变量配置和实时预览
 */
export const TemplatePreview: React.FC<TemplatePreviewProps> = ({
    template,
    previewVariables,
    isDefault,
    onEdit,
    onDelete,
    onCopy,
    onVariableChange,
    renderPreview,
}) => {
    return (
        <div className={styles.detailCard}>
            {/* 头部 */}
            <div className={styles.detailHeader}>
                <div>
                    <h3 className={styles.detailTitle}>{template.name}</h3>
                    <p className={styles.detailSubtitle}>{template.description}</p>
                </div>
                <div className={styles.detailActions}>
                    <button className="btn btn-ghost btn-sm" onClick={onCopy}>
                        📋 复制
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={onEdit}>
                        ✏️ 编辑
                    </button>
                    {!isDefault && (
                        <button
                            className={`btn btn-ghost btn-sm ${styles.deleteBtn}`}
                            onClick={onDelete}
                        >
                            🗑 删除
                        </button>
                    )}
                </div>
            </div>

            {/* 变量配置 */}
            {template.variables.length > 0 && (
                <div className={styles.variablesSection}>
                    <h4 className={styles.sectionTitle}>变量配置</h4>
                    <div className={styles.variablesGrid}>
                        {template.variables.map((varName) => (
                            <div key={varName} className={styles.variableItem}>
                                <label className={styles.formLabel}>
                                    <code className={styles.varCode}>{`{{${varName}}}`}</code>
                                </label>
                                <input
                                    type="text"
                                    className={styles.formInput}
                                    value={previewVariables[varName] || ''}
                                    onChange={(e) => onVariableChange(varName, e.target.value)}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 实时预览 */}
            <div className={styles.previewSection}>
                <h4 className={styles.sectionTitle}>📱 消息预览</h4>
                <div className={styles.previewPhone}>
                    <div className={styles.phoneHeader}>
                        <span>微信</span>
                    </div>
                    <div className={styles.phoneContent}>
                        <div className={styles.messageBubble}>
                            <pre className={styles.messageText}>
                                {renderPreview(template.content, previewVariables)}
                            </pre>
                        </div>
                    </div>
                </div>
            </div>

            {/* 原始内容 */}
            <div className={styles.sourceSection}>
                <h4 className={styles.sectionTitle}>📝 原始模板</h4>
                <pre className={styles.sourceCode}>{template.content}</pre>
            </div>
        </div>
    );
};
