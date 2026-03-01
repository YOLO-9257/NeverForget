/**
 * 共享 Select 组件
 * @author zhangws
 * 
 * 提供统一的下拉选择器样式。
 */

import React, { forwardRef, useId } from 'react';
import styles from './Select.module.css';

export type SelectSize = 'sm' | 'md' | 'lg';

export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
    /** 下拉选项 */
    options: SelectOption[];
    /** 选择器尺寸 */
    size?: SelectSize;
    /** 标签 */
    label?: string;
    /** 帮助文本 */
    helperText?: string;
    /** 错误信息 */
    errorText?: string;
    /** 占位符 */
    placeholder?: string;
    /** 是否全宽 */
    fullWidth?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({
    options,
    size = 'md',
    label,
    helperText,
    errorText,
    placeholder,
    fullWidth = false,
    className = '',
    disabled,
    id,
    ...props
}, ref) => {
    const generatedId = useId();
    const selectId = id || `select-${generatedId}`;
    const hasError = !!errorText;
    const displayHelperText = errorText || helperText;

    const wrapperClasses = [
        styles.wrapper,
        fullWidth && styles.fullWidth,
    ].filter(Boolean).join(' ');

    const selectWrapperClasses = [
        styles.selectWrapper,
        styles[size],
        hasError && styles.error,
        disabled && styles.disabled,
    ].filter(Boolean).join(' ');

    return (
        <div className={wrapperClasses}>
            {label && (
                <label htmlFor={selectId} className={styles.label}>
                    {label}
                </label>
            )}

            <div className={selectWrapperClasses}>
                <select
                    ref={ref}
                    id={selectId}
                    className={`${styles.select} ${className}`}
                    disabled={disabled}
                    aria-invalid={hasError}
                    aria-describedby={displayHelperText ? `${selectId}-helper` : undefined}
                    {...props}
                >
                    {placeholder && (
                        <option value="" disabled>
                            {placeholder}
                        </option>
                    )}
                    {options.map((option) => (
                        <option
                            key={option.value}
                            value={option.value}
                            disabled={option.disabled}
                        >
                            {option.label}
                        </option>
                    ))}
                </select>

                <span className={styles.arrow} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </span>
            </div>

            {displayHelperText && (
                <span
                    id={`${selectId}-helper`}
                    className={`${styles.helperText} ${hasError ? styles.errorText : ''}`}
                >
                    {displayHelperText}
                </span>
            )}
        </div>
    );
});

Select.displayName = 'Select';

export default Select;
