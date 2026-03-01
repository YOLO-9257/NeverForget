/**
 * 转发统计和日志组件
 * @author zhangws
 */

import React from 'react';
import type { EmailForwardLog } from '../types';
import styles from './ForwardingStats.module.css';

interface ForwardingStatsProps {
    totalForwarded: number;
    lastForwardedAt: string | null;
    logs: EmailForwardLog[];
    logsTotal: number;
    showLogs: boolean;
    onShowLogsChange: (show: boolean) => void;
}

export const ForwardingStats: React.FC<ForwardingStatsProps> = ({
    totalForwarded,
    lastForwardedAt,
    logs,
    logsTotal,
    showLogs,
    onShowLogsChange,
}) => {
    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '暂无记录';
        return new Date(dateStr).toLocaleString('zh-CN');
    };

    return (
        <div className={styles.card}>
            <div className={styles.header}>
                <h3 className={styles.title}>📊 转发统计</h3>
            </div>

            <div className={styles.stats}>
                <div className={styles.statRow}>
                    <span className={styles.statLabel}>已转发邮件</span>
                    <span className={styles.statValue}>{totalForwarded} 封</span>
                </div>
                <div className={styles.statRow}>
                    <span className={styles.statLabel}>最后转发时间</span>
                    <span className={styles.statValue}>{formatDate(lastForwardedAt)}</span>
                </div>
            </div>

            {/* 转发日志 */}
            <details
                className={styles.logsSection}
                open={showLogs}
                onToggle={(e) => onShowLogsChange((e.target as HTMLDetailsElement).open)}
            >
                <summary className={styles.logsSummary}>
                    📜 查看转发日志（最近 {logsTotal} 条）
                </summary>

                {logs.length > 0 ? (
                    <div className={styles.logsTable}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>时间</th>
                                    <th>发件人</th>
                                    <th>主题</th>
                                    <th>状态</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => (
                                    <tr key={log.id}>
                                        <td className={styles.noWrap}>{formatDate(log.received_at)}</td>
                                        <td className={styles.ellipsis}>{log.from_address}</td>
                                        <td className={styles.ellipsisWide}>{log.subject || '(无主题)'}</td>
                                        <td>
                                            <span
                                                className={`${styles.badge} ${log.status === 'success' ? styles.badgeSuccess : styles.badgeError}`}
                                            >
                                                {log.status === 'success' ? '✓ 成功' : '✗ 失败'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className={styles.emptyLogs}>暂无转发记录</p>
                )}
            </details>
        </div>
    );
};

export default ForwardingStats;
