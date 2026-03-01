/**
 * 关于选项卡
 * @author zhangws
 */

import React from 'react';
import styles from './AboutTab.module.css';

interface AboutTabProps {
    onExportSettings: () => void;
    onImportSettings: () => void;
    onClearData: () => void;
}

export const AboutTab: React.FC<AboutTabProps> = ({ onExportSettings, onImportSettings, onClearData }) => {
    return (
        <div className={styles.section}>
            {/* 系统信息 */}
            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>系统信息</h3>
                </div>

                <div className={styles.aboutInfo}>
                    <div className={styles.logoArea}>
                        <div className={styles.logoIcon}>⏰</div>
                        <div className={styles.logoText}>
                            <h2>NeverForget</h2>
                            <p>分布式低成本定时提醒系统</p>
                        </div>
                    </div>

                    <div className={styles.details}>
                        <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>版本</span>
                            <span className={styles.detailValue}>v1.2.0</span>
                        </div>
                        <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>技术栈</span>
                            <span className={styles.detailValue}>Cloudflare Workers + D1 + React</span>
                        </div>
                        <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>推送服务</span>
                            <span className={styles.detailValue}>go-wxpush</span>
                        </div>
                        <div className={styles.detailRow}>
                            <span className={styles.detailLabel}>开源协议</span>
                            <span className={styles.detailValue}>MIT License</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 数据管理 */}
            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <div>
                        <h3 className={styles.cardTitle}>数据管理</h3>
                        <p className={styles.cardSubtitle}>导入、导出或清除本地设置数据</p>
                    </div>
                </div>

                <div className={styles.dataActions}>
                    <button className={styles.btnSecondary} onClick={onExportSettings}>
                        📤 导出设置
                    </button>
                    <button className={styles.btnSecondary} onClick={onImportSettings}>
                        📥 导入设置
                    </button>
                    <button className={styles.btnDanger} onClick={onClearData}>
                        🗑 清除所有数据
                    </button>
                </div>

                <div className={styles.hint}>导出的设置包括 API 配置、推送配置、通知设置和 AI 模型配置</div>
            </div>

            {/* 帮助链接 */}
            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>帮助与支持</h3>
                </div>

                <div className={styles.helpLinks}>
                    <a href="#" className={styles.helpLink}>
                        <span className={styles.helpLinkIcon}>📖</span>
                        <span className={styles.helpLinkText}>
                            <span className={styles.helpLinkTitle}>部署文档</span>
                            <span className={styles.helpLinkDesc}>查看完整的部署和配置指南</span>
                        </span>
                    </a>
                    <a href="#" className={styles.helpLink}>
                        <span className={styles.helpLinkIcon}>🐛</span>
                        <span className={styles.helpLinkText}>
                            <span className={styles.helpLinkTitle}>问题反馈</span>
                            <span className={styles.helpLinkDesc}>在 GitHub 上提交 Issue</span>
                        </span>
                    </a>
                    <a href="#" className={styles.helpLink}>
                        <span className={styles.helpLinkIcon}>💬</span>
                        <span className={styles.helpLinkText}>
                            <span className={styles.helpLinkTitle}>讨论区</span>
                            <span className={styles.helpLinkDesc}>加入社区讨论</span>
                        </span>
                    </a>
                </div>
            </div>
        </div>
    );
};

export default AboutTab;
