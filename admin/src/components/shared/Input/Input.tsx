/**
 * 共享 Input 组件
 * @author zhangws
 * 
 * 提供统一的表单输入框样式，支持多种类型和验证状态。
 */

import React, { forwardRef, useId } from 'react';
import styles from './Input.module.css';

export type InputSize = 'sm' | 'md' | 'lg';
export type InputState = 'default' | 'error' | 'success';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
    /** 输入框尺寸 */
    size?: InputSize;
    /** 验证状态 */
    state?: InputState;
    /** 标签 */
    label?: string;
    /** 帮助文本 */
    helperText?: string;
    /** 错误信息 */
    errorText?: string;
    /** 左侧图标或内容 */
    leftAddon?: React.ReactNode;
    /** 右侧图标或内容 */
    rightAddon?: React.ReactNode;
    /** 是否全宽 */
    fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
    size = 'md',
    state = 'default',
    label,
    helperText,
    errorText,
    leftAddon,
    rightAddon,
    fullWidth = false,
    className = '',
    disabled,
    id,
    ...props
}, ref) => {
    const generatedId = useId();
    const inputId = id || `input-${generatedId}`;
    const hasError = state === 'error' || !!errorText;
    const displayHelperText = errorText || helperText;

    const wrapperClasses = [
        styles.wrapper,
        fullWidth && styles.fullWidth,
    ].filter(Boolean).join(' ');

    const inputWrapperClasses = [
        styles.inputWrapper,
        styles[size],
        hasError && styles.error,
        state === 'success' && styles.success,
        disabled && styles.disabled,
    ].filter(Boolean).join(' ');

    return (
        <div className={wrapperClasses}>
            {label && (
                <label htmlFor={inputId} className={styles.label}>
                    {label}
                </label>
            )}

            <div className={inputWrapperClasses}>
                {leftAddon && (
                    <span className={styles.addon}>{leftAddon}</span>
                )}

                <input
                    ref={ref}
                    id={inputId}
                    className={`${styles.input} ${className}`}
                    disabled={disabled}
                    aria-invalid={hasError}
                    aria-describedby={displayHelperText ? `${inputId}-helper` : undefined}
                    {...props}
                />

                {rightAddon && (
                    <span className={styles.addon}>{rightAddon}</span>
                )}
            </div>

            {displayHelperText && (
                <span
                    id={`${inputId}-helper`}
                    className={`${styles.helperText} ${hasError ? styles.errorText : ''}`}
                >
                    {displayHelperText}
                </span>
            )}
        </div>
    );
});

Input.displayName = 'Input';

export default Input;
