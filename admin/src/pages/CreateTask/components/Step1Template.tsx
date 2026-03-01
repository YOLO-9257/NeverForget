/**
 * 步骤 1：选择模板
 * @author zhangws
 */

import React from 'react';
import { NlpInput } from '../../../components/NlpInput';
import type { NlpParseResult } from '../../../utils/nlpParser';
import type { TaskTemplate, UserMessageTemplate } from '../types';
import { presetTemplates } from '../types';
import styles from './Step1Template.module.css';

interface Step1TemplateProps {
    showNlpInput: boolean;
    userTemplates: UserMessageTemplate[];
    onNlpApply: (result: NlpParseResult) => void;
    onSelectTemplate: (template: TaskTemplate) => void;
    onShowNlpInput: (show: boolean) => void;
    onSelectUserTemplate: (template: UserMessageTemplate) => void;
}

// 获取调度类型标签
const getScheduleTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
        once: '一次性',
        daily: '每天',
        weekly: '每周',
        monthly: '每月',
        cron: 'Cron',
    };
    return labels[type] || type;
};

export const Step1Template: React.FC<Step1TemplateProps> = ({
    showNlpInput,
    userTemplates,
    onNlpApply,
    onSelectTemplate,
    onShowNlpInput,
    onSelectUserTemplate,
}) => {
    return (
        <>
            {/* 智能输入入口 */}
            {!showNlpInput ? (
                <div className={styles.nlpEntry} onClick={() => onShowNlpInput(true)}>
                    <div className={styles.nlpIcon}>🧠</div>
                    <div className={styles.nlpContent}>
                        <h3 className={styles.nlpTitle}>✨ 智能输入</h3>
                        <p className={styles.nlpDesc}>
                            用自然语言描述，如 "明天下午3点提醒我开会" 或 "every Friday at 5pm"
                        </p>
                    </div>
                    <div className={styles.nlpArrow}>→</div>
                </div>
            ) : (
                <div className={styles.nlpInputWrapper}>
                    <NlpInput onApply={onNlpApply} onClose={() => onShowNlpInput(false)} />
                </div>
            )}

            {/* 分割线 */}
            {!showNlpInput && (
                <div className={styles.divider}>
                    <div className={styles.dividerLine} />
                    <span>或选择模板</span>
                    <div className={styles.dividerLine} />
                </div>
            )}

            {/* 预设模板网格 */}
            {!showNlpInput && (
                <div className={styles.templateGrid}>
                    {presetTemplates.map((template) => (
                        <div
                            key={template.id}
                            className={styles.templateCard}
                            style={{ '--template-color': template.color } as React.CSSProperties}
                            onClick={() => onSelectTemplate(template)}
                        >
                            <div className={styles.templateIcon}>{template.icon}</div>
                            <div className={styles.templateName}>{template.name}</div>
                            <div className={styles.templateDesc}>
                                {template.id === 'custom'
                                    ? '从头开始创建自定义提醒任务'
                                    : `预设：${getScheduleTypeLabel(template.schedule_type)} ${template.schedule_time}`}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 用户自定义模板 */}
            {!showNlpInput && userTemplates.length > 0 && (
                <>
                    <h3 className={styles.sectionTitle}>📝 我的模板（来自消息模板页面）</h3>
                    <div className={styles.templateGrid}>
                        {userTemplates.map((template) => (
                            <div
                                key={template.id}
                                className={styles.templateCard}
                                style={{ '--template-color': 'hsl(180, 60%, 50%)' } as React.CSSProperties}
                                onClick={() => onSelectUserTemplate(template)}
                            >
                                <div className={styles.templateIcon}>📋</div>
                                <div className={styles.templateName}>{template.name}</div>
                                <div className={styles.templateDesc}>{template.description || '自定义模板'}</div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </>
    );
};

export default Step1Template;
