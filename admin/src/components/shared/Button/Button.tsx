/**
 * 共享 Button 组件
 * @author zhangws
 * 
 * 提供统一的按钮样式，支持多种变体和尺寸。
 */

import React from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** 按钮变体 */
    variant?: ButtonVariant;
    /** 按钮尺寸 */
    size?: ButtonSize;
    /** 是否显示加载状态 */
    loading?: boolean;
    /** 左侧图标 */
    leftIcon?: React.ReactNode;
    /** 右侧图标 */
    rightIcon?: React.ReactNode;
    /** 是否全宽 */
    fullWidth?: boolean;
    /** 子元素 */
    children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    disabled,
    className = '',
    children,
    ...props
}) => {
    const buttonClasses = [
        styles.button,
        styles[variant],
        styles[size],
        fullWidth && styles.fullWidth,
        loading && styles.loading,
        className,
    ].filter(Boolean).join(' ');

    return (
        <button
            className={buttonClasses}
            disabled={disabled || loading}
            aria-busy={loading}
            {...props}
        >
            {loading && (
                <span className={styles.spinner} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" className={styles.spinnerIcon}>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                    </svg>
                </span>
            )}
            {!loading && leftIcon && <span className={styles.leftIcon}>{leftIcon}</span>}
            <span className={styles.content}>{children}</span>
            {!loading && rightIcon && <span className={styles.rightIcon}>{rightIcon}</span>}
        </button>
    );
};

export default Button;
