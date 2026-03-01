import React from 'react';
import styles from './Dashboard.module.css';

interface StatCardProps {
    icon: string;
    value: number | string;
    label: string;
    hue?: number;
    trend?: 'up' | 'down';
}

/**
 * 统计卡片组件
 * 展示单个统计指标
 */
export const StatCard: React.FC<StatCardProps> = ({ icon, value, label, hue = 245, trend }) => {
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
                <div className={`${styles.trend} ${styles[trend]}`}>
                    {trend === 'up' ? '↑ 良好' : '↓ 需关注'}
                </div>
            )}
        </div>
    );
};
