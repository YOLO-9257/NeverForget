import { useState, useEffect } from 'react';
import { statsApi, reminderApi } from '../../api';
import type { Stats, Reminder } from '../../types';
import { buildTrendData, buildStatusData } from './utils';
import { StatCard } from './StatCard';
import { AiAnalysisCard } from './AiAnalysisCard';
import { TrendChart, StatusChart, EmailTrendChart } from './Charts';
import { RecentTasks } from './RecentTasks';
import styles from './Dashboard.module.css';

interface EmailTrendItem {
    day: string;
    forwarded: number;
    synced: number;
}

/**
 * 仪表盘页面
 * 展示任务执行概况、图表和最近任务
 */
export function Dashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [recentTasks, setRecentTasks] = useState<Reminder[]>([]);
    const [emailTrend, setEmailTrend] = useState<EmailTrendItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);

            const [statsRes, tasksRes, emailRes] = await Promise.all([
                statsApi.get(),
                reminderApi.list({ limit: 5 }),
                statsApi.getEmailTrend().catch(() => ({ data: [] })),
            ]);

            if (statsRes.data) setStats(statsRes.data);
            if (tasksRes.data) setRecentTasks(tasksRes.data.items);
            if (emailRes && emailRes.data) setEmailTrend(emailRes.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载数据失败');
        } finally {
            setLoading(false);
        }
    };

    const trendData = buildTrendData(stats);
    const statusData = buildStatusData(stats);

    if (loading) {
        return (
            <div className="loading">
                <div className="spinner" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">❌</div>
                <div className="empty-state-title">加载失败</div>
                <div className="empty-state-text">{error}</div>
                <button className="btn btn-primary" onClick={loadData}>重试</button>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            {/* 页面标题 */}
            <div className={styles.header}>
                <div className={styles.headerInfo}>
                    <h1>仪表盘</h1>
                    <p>查看定时任务执行概况</p>
                </div>
                <button className="btn btn-primary" onClick={loadData}>
                    🔄 刷新数据
                </button>
            </div>

            {/* 统计卡片 */}
            <div className="stats-grid">
                <StatCard icon="📋" value={stats?.total_reminders || 0} label="总任务数" hue={245} />
                <StatCard icon="✅" value={stats?.active_reminders || 0} label="运行中" hue={150} />
                <StatCard icon="📊" value={stats?.total_triggers || 0} label="总执行次数" hue={200} />
                <StatCard
                    icon="🎯"
                    value={`${((stats?.success_rate || 0) * 100).toFixed(1)}%`}
                    label="成功率"
                    hue={175}
                    trend={stats?.success_rate && stats.success_rate >= 0.95 ? 'up' : undefined}
                />
            </div>

            {/* AI 趋势分析 */}
            <AiAnalysisCard stats={stats} />

            {/* 图表区域 */}
            <div className={styles.chartsGrid}>
                <TrendChart data={trendData} />
                <StatusChart data={statusData} />
            </div>

            {/* 邮件转发趋势 */}
            <EmailTrendChart data={emailTrend} />

            {/* 最近任务 */}
            <RecentTasks tasks={recentTasks} />
        </div>
    );
}
