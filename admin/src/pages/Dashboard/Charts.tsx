import React from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { CHART_COLORS, TOOLTIP_STYLE, AXIS_COLOR, GRID_COLOR } from './utils';
import styles from './Dashboard.module.css';

interface TrendChartProps {
    data: Array<{ day: string; success: number; failed: number }>;
}

/** 执行趋势折线图 */
export const TrendChart: React.FC<TrendChartProps> = ({ data }) => (
    <div className="card">
        <div className="card-header">
            <div>
                <h3 className="card-title">执行趋势</h3>
                <p className="card-subtitle">最近 7 天任务执行情况</p>
            </div>
        </div>
        <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                    <XAxis dataKey="day" stroke={AXIS_COLOR} fontSize={12} />
                    <YAxis stroke={AXIS_COLOR} fontSize={12} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Line type="monotone" dataKey="success" stroke={CHART_COLORS.success}
                        strokeWidth={2} dot={{ fill: CHART_COLORS.success, strokeWidth: 0, r: 4 }} name="成功" />
                    <Line type="monotone" dataKey="failed" stroke={CHART_COLORS.error}
                        strokeWidth={2} dot={{ fill: CHART_COLORS.error, strokeWidth: 0, r: 4 }} name="失败" />
                </LineChart>
            </ResponsiveContainer>
        </div>
    </div>
);

interface StatusChartProps {
    data: Array<{ name: string; value: number; color: string }>;
}

/** 任务状态饼图 */
export const StatusChart: React.FC<StatusChartProps> = ({ data }) => (
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
                    <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                        paddingAngle={4} dataKey="value">
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
            </ResponsiveContainer>
            <div className={styles.legend}>
                {data.map((item) => (
                    <div key={item.name} className={styles.legendItem}>
                        <div className={styles.legendDot} style={{ background: item.color }} />
                        <span className={styles.legendLabel}>{item.name} ({item.value})</span>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

interface EmailTrendChartProps {
    data: Array<{ day: string; synced: number; forwarded: number }>;
}

/** 邮件转发趋势图 */
export const EmailTrendChart: React.FC<EmailTrendChartProps> = ({ data }) => (
    <div className={styles.emailChart}>
        <div className="card-header">
            <div>
                <h3 className="card-title">邮件转发活动</h3>
                <p className="card-subtitle">近7日邮件获取与转发情况</p>
            </div>
        </div>
        <div className={`chart-container ${styles.emailChartContainer}`}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.map(t => ({ ...t, day: t.day?.slice?.(5) || t.day }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                    <XAxis dataKey="day" stroke={AXIS_COLOR} fontSize={12} />
                    <YAxis stroke={AXIS_COLOR} fontSize={12} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Line type="monotone" dataKey="synced" stroke={CHART_COLORS.primary}
                        strokeWidth={2} dot={{ fill: CHART_COLORS.primary, strokeWidth: 0, r: 4 }} name="同步次数" />
                    <Line type="monotone" dataKey="forwarded" stroke="#FFBB28"
                        strokeWidth={2} dot={{ fill: "#FFBB28", strokeWidth: 0, r: 4 }} name="转发数" />
                </LineChart>
            </ResponsiveContainer>
        </div>
    </div>
);
