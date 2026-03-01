/**
 * 共享 Card 组件
 * @author zhangws
 * 
 * 提供统一的卡片容器样式，支持悬停效果和可点击状态。
 */

import React from 'react';
import styles from './Card.module.css';

export type CardVariant = 'default' | 'elevated' | 'outlined' | 'glass';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    /** 卡片变体 */
    variant?: CardVariant;
    /** 是否可点击（添加悬停效果） */
    clickable?: boolean;
    /** 是否添加内边距 */
    padded?: boolean;
    /** 是否显示悬停发光效果 */
    glow?: boolean;
    /** 子元素 */
    children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
    variant = 'default',
    clickable = false,
    padded = true,
    glow = false,
    className = '',
    children,
    ...props
}) => {
    const cardClasses = [
        styles.card,
        styles[variant],
        clickable && styles.clickable,
        padded && styles.padded,
        glow && styles.glow,
        className,
    ].filter(Boolean).join(' ');

    return (
        <div
            className={cardClasses}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            {...props}
        >
            {children}
        </div>
    );
};

/* 子组件 */
export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ className = '', children, ...props }) => (
    <div className={`${styles.header} ${className}`} {...props}>
        {children}
    </div>
);

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
    as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    children: React.ReactNode;
}

export const CardTitle: React.FC<CardTitleProps> = ({ as: Tag = 'h3', className = '', children, ...props }) => (
    <Tag className={`${styles.title} ${className}`} {...props}>
        {children}
    </Tag>
);

export interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
    children: React.ReactNode;
}

export const CardDescription: React.FC<CardDescriptionProps> = ({ className = '', children, ...props }) => (
    <p className={`${styles.description} ${className}`} {...props}>
        {children}
    </p>
);

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

export const CardContent: React.FC<CardContentProps> = ({ className = '', children, ...props }) => (
    <div className={`${styles.content} ${className}`} {...props}>
        {children}
    </div>
);

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

export const CardFooter: React.FC<CardFooterProps> = ({ className = '', children, ...props }) => (
    <div className={`${styles.footer} ${className}`} {...props}>
        {children}
    </div>
);

export default Card;
