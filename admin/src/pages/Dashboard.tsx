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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);

            const [statsRes, tasksRes] = await Promise.all([
                statsApi.get(),
                reminderApi.list({ limit: 5 }),
            ]);

            if (statsRes.data) setStats(statsRes.data);
            if (tasksRes.data) setRecentTasks(tasksRes.data.items);
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载数据失败');
        } finally {
            setLoading(false);
        }
    };

    // 执行趋势数据 (需要后端支持每日聚合，暂时基于统计信息估算)
    // 如果后端增加了 trend API，可以在这里调用
    const trendData = stats ? [
        { day: '近7天', success: stats.week_triggers - (stats.failed_triggers || 0), failed: stats.failed_triggers || 0 },
    ] : [];

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
        </div>
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
