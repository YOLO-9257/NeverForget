/**
 * 共享 Modal 组件
 * @author zhangws
 * 
 * 提供统一的模态框基础组件，支持无障碍访问和键盘导航。
 */

import React, { useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ModalProps {
    /** 是否显示模态框 */
    isOpen: boolean;
    /** 关闭回调 */
    onClose: () => void;
    /** 模态框尺寸 */
    size?: ModalSize;
    /** 标题 */
    title?: React.ReactNode;
    /** 是否显示关闭按钮 */
    showCloseButton?: boolean;
    /** 点击遮罩层是否关闭 */
    closeOnOverlayClick?: boolean;
    /** 按 ESC 是否关闭 */
    closeOnEscape?: boolean;
    /** 子元素 */
    children: React.ReactNode;
    /** 底部内容 */
    footer?: React.ReactNode;
    /** 自定义类名 */
    className?: string;
}

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    size = 'md',
    title,
    showCloseButton = true,
    closeOnOverlayClick = true,
    closeOnEscape = true,
    children,
    footer,
    className = '',
}) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const previousActiveElement = useRef<HTMLElement | null>(null);

    // 处理 ESC 键关闭
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape' && closeOnEscape) {
            onClose();
        }
    }, [closeOnEscape, onClose]);

    // 处理遮罩点击
    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget && closeOnOverlayClick) {
            onClose();
        }
    };

    // 焦点管理和键盘事件
    useEffect(() => {
        if (isOpen) {
            previousActiveElement.current = document.activeElement as HTMLElement;
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';

            // 聚焦到模态框
            setTimeout(() => {
                modalRef.current?.focus();
            }, 0);

            return () => {
                document.removeEventListener('keydown', handleKeyDown);
                document.body.style.overflow = '';
                previousActiveElement.current?.focus();
            };
        }
    }, [isOpen, handleKeyDown]);

    if (!isOpen) return null;

    const modalContent = (
        <div
            className={styles.overlay}
            onClick={handleOverlayClick}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'modal-title' : undefined}
        >
            <div
                ref={modalRef}
                className={`${styles.modal} ${styles[size]} ${className}`}
                tabIndex={-1}
            >
                {(title || showCloseButton) && (
                    <div className={styles.header}>
                        {title && (
                            <h2 id="modal-title" className={styles.title}>
                                {title}
                            </h2>
                        )}
                        {showCloseButton && (
                            <button
                                type="button"
                                className={styles.closeButton}
                                onClick={onClose}
                                aria-label="关闭"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                        )}
                    </div>
                )}

                <div className={styles.content}>
                    {children}
                </div>

                {footer && (
                    <div className={styles.footer}>
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default Modal;
