/**
 * 步骤 2：任务配置
 * @author zhangws
 */

import React from 'react';
import type { CreateTaskFormData } from '../types';
import styles from './Step2Config.module.css';

interface Step2ConfigProps {
    formData: CreateTaskFormData;
    hasAi: boolean;
    polishing: boolean;
    onUpdateFormData: (field: keyof CreateTaskFormData, value: string | number | boolean) => void;
    onPolish: () => void;
    onPrev: () => void;
    onNext: () => void;
}

export const Step2Config: React.FC<Step2ConfigProps> = ({
    formData,
    hasAi,
    polishing,
    onUpdateFormData,
    onPolish,
    onPrev,
    onNext,
}) => {
    return (
        <div className={styles.card}>
            <div className={styles.formGrid}>
                {/* 基本信息 */}
                <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>📋 基本信息</h3>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>任务标题 *</label>
                        <input
                            type="text"
                            className={styles.input}
                            placeholder="例如：每日喝水提醒"
                            value={formData.title}
                            onChange={(e) => onUpdateFormData('title', e.target.value)}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <div className={styles.labelRow}>
                            <label className={styles.label}>提醒内容 *</label>
                            {hasAi && (
                                <button
                                    className={styles.aiButton}
                                    onClick={onPolish}
                                    disabled={polishing || (!formData.title && !formData.content)}
                                    title="使用 AI 优化标题和内容"
                                >
                                    {polishing ? <span className={styles.spinner} /> : '✨'}
                                    AI 润色
                                </button>
                            )}
                        </div>
                        <textarea
                            className={styles.textarea}
                            placeholder="输入要推送的消息内容..."
                            value={formData.content}
                            onChange={(e) => onUpdateFormData('content', e.target.value)}
                        />
                    </div>
                </div>

                {/* 调度配置 */}
                <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>⏰ 调度配置</h3>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>调度类型</label>
                        <select
                            className={styles.select}
                            value={formData.schedule_type}
                            onChange={(e) => onUpdateFormData('schedule_type', e.target.value)}
                        >
                            <option value="once">一次性</option>
                            <option value="daily">每天</option>
                            <option value="weekly">每周</option>
                            <option value="monthly">每月</option>
                            <option value="cron">Cron 表达式</option>
                        </select>
                    </div>

                    {/* 一次性：选择日期 */}
                    {formData.schedule_type === 'once' && (
                        <div className={styles.formGroup}>
                            <label className={styles.label}>执行日期</label>
                            <input
                                type="date"
                                className={styles.input}
                                value={formData.schedule_date}
                                onChange={(e) => onUpdateFormData('schedule_date', e.target.value)}
                            />
                        </div>
                    )}

                    {/* 每周：选择星期 */}
                    {formData.schedule_type === 'weekly' && (
                        <div className={styles.formGroup}>
                            <label className={styles.label}>执行星期</label>
                            <select
                                className={styles.select}
                                value={formData.schedule_weekday}
                                onChange={(e) => onUpdateFormData('schedule_weekday', parseInt(e.target.value))}
                            >
                                <option value={0}>周日</option>
                                <option value={1}>周一</option>
                                <option value={2}>周二</option>
                                <option value={3}>周三</option>
                                <option value={4}>周四</option>
                                <option value={5}>周五</option>
                                <option value={6}>周六</option>
                            </select>
                        </div>
                    )}

                    {/* 每月：选择日期 */}
                    {formData.schedule_type === 'monthly' && (
                        <div className={styles.formGroup}>
                            <label className={styles.label}>执行日期</label>
                            <select
                                className={styles.select}
                                value={formData.schedule_day}
                                onChange={(e) => onUpdateFormData('schedule_day', parseInt(e.target.value))}
                            >
                                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                                    <option key={day} value={day}>
                                        每月 {day} 日
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Cron 表达式 */}
                    {formData.schedule_type === 'cron' && (
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Cron 表达式</label>
                            <input
                                type="text"
                                className={styles.input}
                                placeholder="例如：0 9 * * 1-5（工作日 9:00）"
                                value={formData.schedule_cron}
                                onChange={(e) => onUpdateFormData('schedule_cron', e.target.value)}
                            />
                            <div className={styles.hint}>
                                格式：分钟 小时 日 月 星期。示例：<code>0 9 * * 1-5</code> = 工作日每天 9:00
                            </div>
                        </div>
                    )}

                    {/* 执行时间（非 Cron 模式） */}
                    {formData.schedule_type !== 'cron' && (
                        <div className={styles.formGroup}>
                            <label className={styles.label}>执行时间</label>
                            <input
                                type="time"
                                className={styles.input}
                                value={formData.schedule_time}
                                onChange={(e) => onUpdateFormData('schedule_time', e.target.value)}
                            />
                        </div>
                    )}

                    <div className={styles.formGroup}>
                        <label className={styles.label}>时区</label>
                        <select
                            className={styles.select}
                            value={formData.timezone}
                            onChange={(e) => onUpdateFormData('timezone', e.target.value)}
                        >
                            <option value="Asia/Shanghai">Asia/Shanghai (UTC+8)</option>
                            <option value="Asia/Tokyo">Asia/Tokyo (UTC+9)</option>
                            <option value="America/New_York">America/New_York (UTC-5)</option>
                            <option value="Europe/London">Europe/London (UTC+0)</option>
                            <option value="UTC">UTC</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* 强提醒设置 */}
            <div className={styles.urgentSection}>
                <label className={styles.urgentLabel}>
                    <input
                        type="checkbox"
                        checked={formData.ack_required || false}
                        onChange={(e) => onUpdateFormData('ack_required', e.target.checked)}
                        className={styles.checkbox}
                    />
                    开启强提醒 (催命模式) 🔥
                </label>
                <div className={styles.urgentHint}>
                    开启后，若未点击推送消息中的"收到"按钮，系统将每隔 <strong>30分钟</strong> 持续轰炸，直到确认收到为止。
                </div>

                {formData.ack_required && (
                    <div className={styles.retryConfig}>
                        <label className={styles.retryLabel}>重试间隔（分钟）</label>
                        <div className={styles.retryRow}>
                            <input
                                type="number"
                                min="1"
                                max="1440"
                                className={styles.retryInput}
                                value={formData.retry_interval}
                                onChange={(e) =>
                                    onUpdateFormData(
                                        'retry_interval',
                                        Math.max(1, Math.min(1440, parseInt(e.target.value) || 30))
                                    )
                                }
                            />
                            <span className={styles.retryText}>
                                每隔 <strong>{formData.retry_interval}</strong> 分钟提醒一次
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* 操作按钮 */}
            <div className={styles.actions}>
                <button className={styles.btnSecondary} onClick={onPrev}>
                    ← 上一步
                </button>
                <button className={styles.btnPrimary} onClick={onNext}>
                    下一步 →
                </button>
            </div>
        </div>
    );
};

export default Step2Config;
