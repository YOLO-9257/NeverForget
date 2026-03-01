/**
 * 共享 Skeleton 组件
 * @author zhangws
 * 
 * 提供加载骨架屏效果。
 */

import React from 'react';
import styles from './Skeleton.module.css';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
    /** 宽度 */
    width?: string | number;
    /** 高度 */
    height?: string | number;
    /** 是否圆形 */
    circle?: boolean;
    /** 是否显示动画 */
    animate?: boolean;
    /** 子元素（用于 SkeletonText 等复合组件） */
    children?: React.ReactNode;
}

export const Skeleton: React.FC<SkeletonProps> = ({
    width,
    height,
    circle = false,
    animate = true,
    className = '',
    style,
    children,
    ...props
}) => {
    const skeletonClasses = [
        styles.skeleton,
        circle && styles.circle,
        animate && styles.animate,
        className,
    ].filter(Boolean).join(' ');

    const skeletonStyle: React.CSSProperties = {
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
    };

    if (children) {
        return (
            <div className={skeletonClasses} style={skeletonStyle} {...props}>
                {children}
            </div>
        );
    }

    return <div className={skeletonClasses} style={skeletonStyle} {...props} />;
};

/* 预设组件 */

export interface SkeletonTextProps {
    /** 行数 */
    lines?: number;
    /** 最后一行宽度百分比 */
    lastLineWidth?: string;
    /** 行间距 */
    gap?: string | number;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({
    lines = 3,
    lastLineWidth = '60%',
    gap = 8,
}) => {
    return (
        <div className={styles.textWrapper} style={{ gap: typeof gap === 'number' ? `${gap}px` : gap }}>
            {Array.from({ length: lines }).map((_, index) => (
                <Skeleton
                    key={index}
                    height={16}
                    width={index === lines - 1 ? lastLineWidth : '100%'}
                />
            ))}
        </div>
    );
};

export interface SkeletonAvatarProps {
    /** 尺寸 */
    size?: number;
}

export const SkeletonAvatar: React.FC<SkeletonAvatarProps> = ({ size = 40 }) => {
    return <Skeleton width={size} height={size} circle />;
};

export interface SkeletonCardProps {
    /** 是否显示头像 */
    avatar?: boolean;
    /** 文本行数 */
    lines?: number;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
    avatar = true,
    lines = 3,
}) => {
    return (
        <div className={styles.cardWrapper}>
            {avatar && (
                <div className={styles.cardHeader}>
                    <SkeletonAvatar size={48} />
                    <div className={styles.cardHeaderText}>
                        <Skeleton height={18} width="50%" />
                        <Skeleton height={14} width="30%" />
                    </div>
                </div>
            )}
            <SkeletonText lines={lines} />
        </div>
    );
};

export default Skeleton;
