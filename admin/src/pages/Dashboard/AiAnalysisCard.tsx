import { useState } from 'react';
import type { Stats } from '../../types';
import { generateContent, getAiProfiles } from '../../utils/ai';
import styles from './Dashboard.module.css';

/**
 * AI 智能分析卡片
 * 基于历史数据生成执行建议
 */
export function AiAnalysisCard({ stats }: { stats: Stats | null }) {
    const [analysis, setAnalysis] = useState<string | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [profiles] = useState(() => getAiProfiles());

    if (!stats || profiles.length === 0) return null;

    const handleAnalyze = async () => {
        setAnalyzing(true);
        try {
            const prompt = `你是 NeverForget 系统的数据分析师。请分析以下任务执行数据，给出 3 条简短的洞察或建议（中文）：
总任务: ${stats.total_reminders}, 运行中: ${stats.active_reminders}, 成功率: ${((stats.success_rate || 0) * 100).toFixed(1)}%
每日执行趋势: ${JSON.stringify(stats.daily_stats?.slice(-7) || [])}
`;
            const result = await generateContent(prompt);
            setAnalysis(result);
        } catch (e) {
            console.error(e);
            setAnalysis('分析失败，请稍后重试。');
        } finally {
            setAnalyzing(false);
        }
    };

    return (
        <div className={styles.aiCard}>
            <div className="card-header">
                <div>
                    <h3 className={`card-title ${styles.aiCardTitle}`}>
                        🧠 AI 智能分析
                        {analyzing && <span className="spinner-sm" />}
                    </h3>
                    <p className="card-subtitle">基于历史数据提供执行建议</p>
                </div>
                {!analysis && (
                    <button className="btn btn-secondary btn-sm" onClick={handleAnalyze} disabled={analyzing}>
                        ✨ 生成报告
                    </button>
                )}
            </div>

            {analysis && (
                <div className={styles.aiContent}>
                    {analysis}
                    <div className={styles.aiActions}>
                        <button className="btn btn-ghost btn-sm" onClick={handleAnalyze}>
                            🔄 重新分析
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
