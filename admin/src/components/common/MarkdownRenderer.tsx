/**
 * Markdown 渲染组件
 * @author zhangws
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './MarkdownRenderer.module.css';

export interface MarkdownRendererProps {
    /** Markdown 内容 */
    content: string;
    /** 额外的 CSS 类名 */
    className?: string;
}

/**
 * 现代 Markdown 渲染器
 * 使用 react-markdown 和 remark-gfm 提供完整支持
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
    return (
        <div className={`${styles.markdown} ${className}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    // 确保链接在新标签页打开
                    a: ({ node, ...props }) => {
                        void node;
                        return <a target="_blank" rel="noopener noreferrer" {...props} />;
                    }
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
};

export default MarkdownRenderer;
