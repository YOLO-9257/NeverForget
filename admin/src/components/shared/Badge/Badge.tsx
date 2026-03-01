/**
 * 共享 Badge 组件
 * @author zhangws
 * 
 * 提供统一的状态标签样式。
 */

import React from 'react';
import styles from './Badge.module.css';

export type BadgeVariant = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** 变体 */
    variant?: BadgeVariant;
    /** 尺寸 */
    size?: BadgeSize;
    /** 是否带圆点 */
    dot?: boolean;
    /** 是否为轮廓样式 */
    outline?: boolean;
    /** 是否显示脉冲动画 */
    pulse?: boolean;
    /** 左侧图标 */
    icon?: React.ReactNode;
    /** 子元素 */
    children?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
    variant = 'default',
    size = 'md',
    dot = false,
    outline = false,
    pulse = false,
    icon,
    className = '',
    children,
    ...props
}) => {
    const badgeClasses = [
        styles.badge,
        styles[variant],
        styles[size],
        outline && styles.outline,
        dot && styles.dot,
        pulse && styles.pulse,
        !children && styles.iconOnly,
        className,
    ].filter(Boolean).join(' ');

    return (
        <span className={badgeClasses} {...props}>
            {dot && <span className={styles.dotIndicator} aria-hidden="true" />}
            {icon && <span className={styles.icon}>{icon}</span>}
            {children && <span className={styles.content}>{children}</span>}
        </span>
    );
};

export default Badge;
