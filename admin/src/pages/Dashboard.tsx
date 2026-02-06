import { useState, useEffect } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import { statsApi, reminderApi } from '../api';
import type { Stats, Reminder } from '../types';
import { generateContent, getAiProfiles } from '../utils/ai';

// AI 分析卡片组件
function AiAnalysisCard({ stats }: { stats: Stats | null }) {
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
        <div className="card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(var(--primary-rgb), 0.05) 100%)', border: '1px solid var(--border)' }}>
            <div className="card-header">
                <div>
                    <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                <div style={{ padding: '0 24px 24px', lineHeight: '1.6', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                    {analysis}
                    <div style={{ marginTop: '16px', textAlign: 'right' }}>
                        <button className="btn btn-ghost btn-xs" onClick={handleAnalyze}>
                            🔄 重新分析
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// 图表颜色
const COLORS = {
    primary: 'hsl(245, 80%, 60%)',
    accent: 'hsl(175, 80%, 45%)',
    success: 'hsl(150, 70%, 45%)',
    warning: 'hsl(40, 95%, 55%)',
    error: 'hsl(0, 75%, 55%)',
};

export function Dashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [recentTasks, setRecentTasks] = useState<Reminder[]>([]);
    const [emailTrend, setEmailTrend] = useState<any[]>([]); // New state
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
                statsApi.getEmailTrend().catch(() => ({ data: [] })) // Tolerantly handle fail
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

    // 执行趋势数据
    const trendData = stats?.daily_stats?.map(item => ({
        day: item.day.slice(5), // 格式化为 MM-DD
        success: item.success,
        failed: item.failed,
    })) || [];

    // 任务状态分布
    const statusData = stats
        ? [
            { name: '运行中', value: stats.active_reminders, color: COLORS.success },
            { name: '已暂停', value: stats.paused_reminders, color: COLORS.warning },
            { name: '已完成', value: stats.completed_reminders, color: COLORS.primary },
        ]
        : [];

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
                <button className="btn btn-primary" onClick={loadData}>
                    重试
                </button>
            </div>
        );
    }

    return (
        <div>
            {/* 页面标题 */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">仪表盘</h1>
                    <p className="page-subtitle">查看定时任务执行概况</p>
                </div>
                <button className="btn btn-primary" onClick={loadData}>
                    🔄 刷新数据
                </button>
            </div>

            {/* 统计卡片 */}
            <div className="stats-grid">
                <StatCard
                    icon="📋"
                    value={stats?.total_reminders || 0}
                    label="总任务数"
                    hue={245}
                />
                <StatCard
                    icon="✅"
                    value={stats?.active_reminders || 0}
                    label="运行中"
                    hue={150}
                />
                <StatCard
                    icon="📊"
                    value={stats?.total_triggers || 0}
                    label="总执行次数"
                    hue={200}
                />
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
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '32px' }}>
                {/* 执行趋势图 */}
                <div className="card">
                    <div className="card-header">
                        <div>
                            <h3 className="card-title">执行趋势</h3>
                            <p className="card-subtitle">最近 7 天任务执行情况</p>
                        </div>
                    </div>
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(230, 20%, 22%)" />
                                <XAxis
                                    dataKey="day"
                                    stroke="hsl(230, 15%, 45%)"
                                    fontSize={12}
                                />
                                <YAxis stroke="hsl(230, 15%, 45%)" fontSize={12} />
                                <Tooltip
                                    contentStyle={{
                                        background: 'hsl(230, 22%, 12%)',
                                        border: '1px solid hsl(230, 20%, 22%)',
                                        borderRadius: '8px',
                                    }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="success"
                                    stroke={COLORS.success}
                                    strokeWidth={2}
                                    dot={{ fill: COLORS.success, strokeWidth: 0, r: 4 }}
                                    name="成功"
                                />
                                <Line
                                    type="monotone"
                                    dataKey="failed"
                                    stroke={COLORS.error}
                                    strokeWidth={2}
                                    dot={{ fill: COLORS.error, strokeWidth: 0, r: 4 }}
                                    name="失败"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 任务状态分布 */}
                <div className="card">
                    <div className="card-header">
                        <div>
                            <h3 className="card-title">任务状态</h3>
                            <p className="card-subtitle">当前任务状态分布</p>
                        </div>
                    </div>
                    {/* ... Existing Pie Chart ... */}
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={4}
                                    dataKey="value"
                                >
                                    {statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        background: 'hsl(230, 22%, 12%)',
                                        border: '1px solid hsl(230, 20%, 22%)',
                                        borderRadius: '8px',
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        {/* 图例 */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '-20px' }}>
                            {statusData.map((item) => (
                                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div
                                        style={{
                                            width: '12px',
                                            height: '12px',
                                            borderRadius: '50%',
                                            background: item.color,
                                        }}
                                    />
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        {item.name} ({item.value})
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* 邮件转发趋势图 (新增) */}
            <div className="card" style={{ marginBottom: '32px' }}>
                <div className="card-header">
                    <div>
                        <h3 className="card-title">邮件转发活动</h3>
                        <p className="card-subtitle">近7日邮件获取与转发情况</p>
                    </div>
                </div>
                <div className="chart-container" style={{ height: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={emailTrend.map(t => ({ ...t, day: t.day.slice(5) }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(230, 20%, 22%)" />
                            <XAxis
                                dataKey="day"
                                stroke="hsl(230, 15%, 45%)"
                                fontSize={12}
                            />
                            <YAxis stroke="hsl(230, 15%, 45%)" fontSize={12} />
                            <Tooltip
                                contentStyle={{
                                    background: 'hsl(230, 22%, 12%)',
                                    border: '1px solid hsl(230, 20%, 22%)',
                                    borderRadius: '8px',
                                }}
                            />
                            <Line
                                type="monotone"
                                dataKey="synced"
                                stroke={COLORS.primary}
                                strokeWidth={2}
                                dot={{ fill: COLORS.primary, strokeWidth: 0, r: 4 }}
                                name="同步次数"
                            />
                            <Line
                                type="monotone"
                                dataKey="forwarded"
                                stroke="#FFBB28"
                                strokeWidth={2}
                                dot={{ fill: "#FFBB28", strokeWidth: 0, r: 4 }}
                                name="转发数"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 最近任务列表 */}
            <div className="card">
                <div className="card-header">
                    <div>
                        <h3 className="card-title">最近任务</h3>
                        <p className="card-subtitle">最近创建的定时提醒任务</p>
                    </div>
                    <a href="/tasks" className="btn btn-secondary btn-sm">
                        查看全部 →
                    </a>
                </div>
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>任务标题</th>
                                <th>类型</th>
                                <th>状态</th>
                                <th>下次执行</th>
                                <th>已执行</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentTasks.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', padding: '40px' }}>
                                        暂无任务数据
                                    </td>
                                </tr>
                            ) : (
                                recentTasks.map((task) => (
                                    <tr key={task.id}>
                                        <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                                            {task.title}
                                        </td>
                                        <td>{getScheduleTypeLabel(task.schedule_type)}</td>
                                        <td>
                                            <StatusBadge status={task.status} />
                                        </td>
                                        <td>{formatNextTrigger(task.next_trigger_at)}</td>
                                        <td>{task.trigger_count} 次</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div >
    );
}

// 统计卡片组件
interface StatCardProps {
    icon: string;
    value: number | string;
    label: string;
    hue?: number;
    trend?: 'up' | 'down';
}

function StatCard({ icon, value, label, hue = 245, trend }: StatCardProps) {
    return (
        <div
            className="stat-card"
            style={{
                '--stat-color': `hsl(${hue}, 80%, 60%)`,
                '--stat-hue': hue,
            } as React.CSSProperties}
        >
            <div className="stat-icon">{icon}</div>
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
            {trend && (
                <div className={`stat-trend ${trend}`}>
                    {trend === 'up' ? '↑ 良好' : '↓ 需关注'}
                </div>
            )}
        </div>
    );
}

// 状态徽章组件
function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { label: string; className: string }> = {
        active: { label: '运行中', className: 'badge-active' },
        paused: { label: '已暂停', className: 'badge-paused' },
        completed: { label: '已完成', className: 'badge-completed' },
        failed: { label: '已失败', className: 'badge-failed' },
    };

    const { label, className } = config[status] || { label: status, className: '' };

    return <span className={`badge ${className}`}>● {label}</span>;
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

// 格式化下次触发时间
function formatNextTrigger(timestamp: number | null): string {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 0) return '已过期';
    if (diffHours < 1) return '即将执行';
    if (diffHours < 24) return `${diffHours} 小时后`;

    return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
