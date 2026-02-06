import { useState, useEffect, useCallback } from 'react';
import type { NlpParseResult } from '../utils/nlpParser';
import {
    parseNaturalLanguage,
    parseWithLlm,
    getScheduleDescription,
} from '../utils/nlpParser';
import { getAiProfiles } from '../utils/ai';
import type { AiProfile } from '../utils/ai';
import './NlpInput.css';

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
 *
 * @author zhangws
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
        // 如果有配置，默认在输入较长时可能启用 AI，这里暂时保持手动开启
    }, []);

    // 防抖解析
    const debouncedParse = useCallback((text: string) => {
        if (!text.trim()) {
            setResult(null);
            return;
        }

        // 本地解析（实时）
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
            // 使用默认配置 (profileId 为 undefined)
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
        <div className="nlp-input-container">
            {/* 输入区域 */}
            <div className="nlp-input-header">
                <div className="nlp-input-icon">🧠</div>
                <h3 className="nlp-input-title">智能输入</h3>
                {onClose && (
                    <button className="nlp-close-btn" onClick={onClose} title="关闭">
                        ✕
                    </button>
                )}
            </div>

            <div className="nlp-input-wrapper">
                <textarea
                    className="nlp-textarea"
                    placeholder="用自然语言描述你的提醒时间，例如：&#10;- 明天下午3点提醒我开会&#10;- 每周五下午5点&#10;- 30分钟后&#10;- Remind me tomorrow at 5pm"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    rows={3}
                />

                {/* AI 增强开关 */}
                {hasAiConfig && (
                    <div className="nlp-ai-toggle">
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={useAi}
                                onChange={(e) => setUseAi(e.target.checked)}
                            />
                            <span className="toggle-slider"></span>
                        </label>
                        <span className="toggle-label">
                            AI 增强 {useAi && <span className="ai-badge">✨</span>}
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
                    <div className="nlp-config-hint">
                        💡 在「设置 → AI 配置」中配置 LLM API 可启用 AI 增强解析
                    </div>
                )}
            </div>

            {/* 解析结果 */}
            {result && (
                <div className={`nlp-result ${result.success ? 'success' : 'error'}`}>
                    {result.success ? (
                        <>
                            <div className="nlp-result-header">
                                <span className="nlp-result-icon">✅</span>
                                <span className="nlp-result-title">解析成功</span>
                                <span className="nlp-confidence">
                                    置信度: {Math.round(result.confidence * 100)}%
                                </span>
                            </div>
                            <div className="nlp-result-body">
                                <div className="nlp-result-item">
                                    <span className="nlp-result-label">调度类型</span>
                                    <span className="nlp-result-value">
                                        {getScheduleTypeLabel(result.schedule_type)}
                                    </span>
                                </div>
                                {result.schedule_date && (
                                    <div className="nlp-result-item">
                                        <span className="nlp-result-label">日期</span>
                                        <span className="nlp-result-value">{result.schedule_date}</span>
                                    </div>
                                )}
                                {result.schedule_time && (
                                    <div className="nlp-result-item">
                                        <span className="nlp-result-label">时间</span>
                                        <span className="nlp-result-value">{result.schedule_time}</span>
                                    </div>
                                )}
                                {result.schedule_weekday !== undefined && (
                                    <div className="nlp-result-item">
                                        <span className="nlp-result-label">星期</span>
                                        <span className="nlp-result-value">
                                            {getWeekdayLabel(result.schedule_weekday)}
                                        </span>
                                    </div>
                                )}
                                {result.schedule_day !== undefined && (
                                    <div className="nlp-result-item">
                                        <span className="nlp-result-label">日期</span>
                                        <span className="nlp-result-value">每月 {result.schedule_day} 号</span>
                                    </div>
                                )}
                                {result.title && (
                                    <div className="nlp-result-item">
                                        <span className="nlp-result-label">任务标题</span>
                                        <span className="nlp-result-value">{result.title}</span>
                                    </div>
                                )}
                            </div>
                            <div className="nlp-result-summary">
                                📅 {getScheduleDescription(result)}
                            </div>
                        </>
                    ) : (
                        <div className="nlp-result-error">
                            <span className="nlp-result-icon">⚠️</span>
                            <span>{result.errorMessage || '无法解析，请尝试更明确的表述'}</span>
                        </div>
                    )}
                </div>
            )}

            {/* 快捷示例 */}
            <div className="nlp-examples">
                <span className="nlp-examples-label">快捷示例：</span>
                <div className="nlp-examples-list">
                    {examples.map((example, index) => (
                        <button
                            key={index}
                            className="nlp-example-chip"
                            onClick={() => setInput(example.text)}
                            title={example.desc}
                        >
                            {example.text}
                        </button>
                    ))}
                </div>
            </div>

            {/* 操作按钮 */}
            <div className="nlp-actions">
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
