import React from 'react';
import type { MessageTemplate } from './types';
import { CATEGORY_LABELS, CATEGORY_COLORS } from './types';
import { Tabs, TabsList, TabsTrigger } from '../../components/shared';
import styles from './Templates.module.css';

interface TemplateListProps {
    templates: MessageTemplate[];
    selectedId: string | null;
    searchQuery: string;
    filterCategory: string;
    onSelect: (template: MessageTemplate) => void;
    onSearchChange: (query: string) => void;
    onFilterChange: (category: string) => void;
}

const CATEGORIES = ['all', 'reminder', 'notification', 'greeting', 'custom'];

/**
 * 模板列表组件
 * 包含搜索、筛选和模板列表展示
 */
export const TemplateList: React.FC<TemplateListProps> = ({
    templates,
    selectedId,
    searchQuery,
    filterCategory,
    onSelect,
    onSearchChange,
    onFilterChange,
}) => {
    return (
        <div className={styles.sidebar}>
            {/* 搜索和筛选 */}
            <div className={styles.filters}>
                <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="🔍 搜索模板..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                />
                <Tabs value={filterCategory} onValueChange={onFilterChange} className={styles.tabs} variant="pills">
                    <TabsList>
                        {CATEGORIES.map((cat) => (
                            <TabsTrigger key={cat} value={cat}>
                                {cat === 'all' ? '全部' : CATEGORY_LABELS[cat]}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            {/* 模板列表 */}
            <div className={styles.list}>
                {templates.length === 0 ? (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>📝</div>
                        <div className={styles.emptyTitle}>暂无模板</div>
                        <div className={styles.emptyText}>
                            {searchQuery ? '没有找到匹配的模板' : '开始创建您的第一个模板'}
                        </div>
                    </div>
                ) : (
                    templates.map((template) => (
                        <div
                            key={template.id}
                            className={`${styles.listItem} ${selectedId === template.id ? styles.listItemActive : ''}`}
                            onClick={() => onSelect(template)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onSelect(template);
                                }
                            }}
                            aria-label={`选择模板: ${template.name}`}
                        >
                            <div
                                className={styles.listIndicator}
                                style={{ background: CATEGORY_COLORS[template.category] }}
                            />
                            <div className={styles.listContent}>
                                <div className={styles.listName}>{template.name}</div>
                                <div className={styles.listDesc}>{template.description}</div>
                                <div className={styles.listMeta}>
                                    <span
                                        className={styles.categoryBadge}
                                        style={{
                                            background: `${CATEGORY_COLORS[template.category]}20`,
                                            color: CATEGORY_COLORS[template.category],
                                        }}
                                    >
                                        {CATEGORY_LABELS[template.category]}
                                    </span>
                                    <span className={styles.varCount}>{template.variables.length} 个变量</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
