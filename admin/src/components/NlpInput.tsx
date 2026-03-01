import { useState, useEffect, useCallback } from 'react';
import type { NlpParseResult } from '../utils/nlpParser';
import {
    parseNaturalLanguage,
    parseWithLlm,
    getScheduleDescription,
} from '../utils/nlpParser';
import { getAiProfiles } from '../utils/ai';
import type { AiProfile } from '../utils/ai';
import styles from './NlpInput.module.css';

/**
 * NLP 智能输入组件属性
 */
interface NlpInputProps {
    onApply: (result: NlpParseResult) => void;
    onClose?: () => void;
    initialValue?: string;
}

/**
 * NLP 智能输入组件
 * 支持自然语言输入，自动解析为调度规则
 */
export function NlpInput({ onApply, onClose, initialValue = '' }: NlpInputProps) {
    const [input, setInput] = useState(initialValue);
    const [result, setResult] = useState<NlpParseResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [useAi, setUseAi] = useState(false);
    const [aiProfiles, setAiProfiles] = useState<AiProfile[]>([]);

    // 加载 LLM 配置
    useEffect(() => {
        const profiles = getAiProfiles();
        setAiProfiles(profiles);
    }, []);

    // 防抖解析
    const debouncedParse = useCallback((text: string) => {
        if (!text.trim()) {
            setResult(null);
            return;
        }
        const localResult = parseNaturalLanguage(text);
        setResult(localResult);
    }, []);

    // 输入变化时触发解析
    useEffect(() => {
        const timer = setTimeout(() => {
            debouncedParse(input);
        }, 300);
        return () => clearTimeout(timer);
    }, [input, debouncedParse]);

    // 使用 AI 增强解析
    const handleAiParse = useCallback(async () => {
        if (!input.trim() || aiProfiles.length === 0) return;

        setIsLoading(true);
        try {
            const aiResult = await parseWithLlm(input);
            setResult(aiResult);
        } catch (error) {
            console.error('AI 解析失败:', error);
        } finally {
            setIsLoading(false);
        }
    }, [input, aiProfiles]);

    // 应用结果
    const handleApply = () => {
        if (result?.success) {
            onApply(result);
        }
    };

    // 示例短语
    const examples = [
        { text: '明天下午3点', desc: '一次性提醒' },
        { text: '每天早上9点', desc: '每日提醒' },
        { text: '每周五下午5点', desc: '每周提醒' },
        { text: '30分钟后', desc: '相对时间' },
        { text: 'tomorrow at 3pm', desc: '英文支持' },
    ];

    const hasAiConfig = aiProfiles.length > 0;

    return (
        <div className={styles.container}>
            {/* 输入区域 */}
            <div className={styles.header}>
                <div className={styles.icon}>🧠</div>
                <h3 className={styles.title}>智能输入</h3>
                {onClose && (
                    <button className={styles.closeBtn} onClick={onClose} title="关闭">
                        ✕
                    </button>
                )}
            </div>

            <div className={styles.inputWrapper}>
                <textarea
                    className={styles.textarea}
                    placeholder="用自然语言描述你的提醒时间，例如：&#10;- 明天下午3点提醒我开会&#10;- 每周五下午5点&#10;- 30分钟后&#10;- Remind me tomorrow at 5pm"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    rows={3}
                />

                {/* AI 增强开关 */}
                {hasAiConfig && (
                    <div className={styles.aiToggle}>
                        <label className={styles.toggleSwitch}>
                            <input
                                type="checkbox"
                                checked={useAi}
                                onChange={(e) => setUseAi(e.target.checked)}
                            />
                            <span className={styles.toggleSlider}></span>
                        </label>
                        <span className={styles.toggleLabel}>
                            AI 增强 {useAi && <span className={styles.aiBadge}>✨</span>}
                        </span>
                        {useAi && (
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={handleAiParse}
                                disabled={isLoading || !input.trim()}
                            >
                                {isLoading ? (
                                    <span className="spinner-sm" />
                                ) : (
                                    '🚀 AI 解析'
                                )}
                            </button>
                        )}
                    </div>
                )}

                {/* 没有配置 LLM 时的提示 */}
                {!hasAiConfig && (
                    <div className={styles.configHint}>
                        💡 在「设置 → AI 配置」中配置 LLM API 可启用 AI 增强解析
                    </div>
                )}
            </div>

            {/* 解析结果 */}
            {result && (
                <div className={`${styles.result} ${result.success ? styles.resultSuccess : styles.resultError}`}>
                    {result.success ? (
                        <>
                            <div className={styles.resultHeader}>
                                <span className={styles.resultIcon}>✅</span>
                                <span className={styles.resultTitle}>解析成功</span>
                                <span className={styles.confidence}>
                                    置信度: {Math.round(result.confidence * 100)}%
                                </span>
                            </div>
                            <div className={styles.resultBody}>
                                <div className={styles.resultItem}>
                                    <span className={styles.resultLabel}>调度类型</span>
                                    <span className={styles.resultValue}>
                                        {getScheduleTypeLabel(result.schedule_type)}
                                    </span>
                                </div>
                                {result.schedule_date && (
                                    <div className={styles.resultItem}>
                                        <span className={styles.resultLabel}>日期</span>
                                        <span className={styles.resultValue}>{result.schedule_date}</span>
                                    </div>
                                )}
                                {result.schedule_time && (
                                    <div className={styles.resultItem}>
                                        <span className={styles.resultLabel}>时间</span>
                                        <span className={styles.resultValue}>{result.schedule_time}</span>
                                    </div>
                                )}
                                {result.schedule_weekday !== undefined && (
                                    <div className={styles.resultItem}>
                                        <span className={styles.resultLabel}>星期</span>
                                        <span className={styles.resultValue}>
                                            {getWeekdayLabel(result.schedule_weekday)}
                                        </span>
                                    </div>
                                )}
                                {result.schedule_day !== undefined && (
                                    <div className={styles.resultItem}>
                                        <span className={styles.resultLabel}>日期</span>
                                        <span className={styles.resultValue}>每月 {result.schedule_day} 号</span>
                                    </div>
                                )}
                                {result.title && (
                                    <div className={styles.resultItem}>
                                        <span className={styles.resultLabel}>任务标题</span>
                                        <span className={styles.resultValue}>{result.title}</span>
                                    </div>
                                )}
                            </div>
                            <div className={styles.resultSummary}>
                                📅 {getScheduleDescription(result)}
                            </div>
                        </>
                    ) : (
                        <div className={styles.resultErrorText}>
                            <span className={styles.resultIcon}>⚠️</span>
                            <span>{result.errorMessage || '无法解析，请尝试更明确的表述'}</span>
                        </div>
                    )}
                </div>
            )}

            {/* 快捷示例 */}
            <div className={styles.examples}>
                <span className={styles.examplesLabel}>快捷示例：</span>
                <div className={styles.examplesList}>
                    {examples.map((example, index) => (
                        <button
                            key={index}
                            className={styles.exampleChip}
                            onClick={() => setInput(example.text)}
                            title={example.desc}
                        >
                            {example.text}
                        </button>
                    ))}
                </div>
            </div>

            {/* 操作按钮 */}
            <div className={styles.actions}>
                {onClose && (
                    <button className="btn btn-secondary" onClick={onClose}>
                        取消
                    </button>
                )}
                <button
                    className="btn btn-primary"
                    onClick={handleApply}
                    disabled={!result?.success}
                >
                    ✨ 应用解析结果
                </button>
            </div>
        </div>
    );
}

// 辅助函数
function getScheduleTypeLabel(type?: string): string {
    const labels: Record<string, string> = {
        once: '一次性',
        daily: '每天',
        weekly: '每周',
        monthly: '每月',
        cron: 'Cron 表达式',
    };
    return labels[type || ''] || type || '-';
}

function getWeekdayLabel(weekday: number): string {
    const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return labels[weekday] || '-';
}

export default NlpInput;
