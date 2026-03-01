/**
 * 共享 Tabs 组件
 * @author zhangws
 * 
 * 提供统一的标签页切换组件。
 */

import React, { createContext, useContext, useState, type ReactNode } from 'react';
import styles from './Tabs.module.css';

export type TabsVariant = 'default' | 'pills' | 'underline';

interface TabsContextValue {
    activeTab: string;
    setActiveTab: (value: string) => void;
    variant: TabsVariant;
}

const TabsContext = createContext<TabsContextValue | null>(null);

const useTabsContext = () => {
    const context = useContext(TabsContext);
    if (!context) {
        throw new Error('Tabs 子组件必须在 Tabs 内部使用');
    }
    return context;
};

export interface TabsProps {
    /** 默认激活的标签 */
    defaultValue?: string;
    /** 受控激活值 */
    value?: string;
    /** 切换回调 */
    onValueChange?: (value: string) => void;
    /** 变体样式 */
    variant?: TabsVariant;
    /** 子元素 */
    children: ReactNode;
    /** 自定义类名 */
    className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
    defaultValue = '',
    value,
    onValueChange,
    variant = 'default',
    children,
    className = '',
}) => {
    const [internalValue, setInternalValue] = useState(defaultValue);
    const activeTab = value ?? internalValue;

    const setActiveTab = (newValue: string) => {
        if (value === undefined) {
            setInternalValue(newValue);
        }
        onValueChange?.(newValue);
    };

    return (
        <TabsContext.Provider value={{ activeTab, setActiveTab, variant }}>
            <div className={`${styles.tabs} ${className}`}>
                {children}
            </div>
        </TabsContext.Provider>
    );
};

export interface TabsListProps {
    children: ReactNode;
    className?: string;
}

export const TabsList: React.FC<TabsListProps> = ({ children, className = '' }) => {
    const { variant } = useTabsContext();

    const listClasses = [
        styles.tabsList,
        styles[`tabsList${variant.charAt(0).toUpperCase() + variant.slice(1)}`],
        className,
    ].filter(Boolean).join(' ');

    return (
        <div className={listClasses} role="tablist">
            {children}
        </div>
    );
};

export interface TabsTriggerProps {
    value: string;
    disabled?: boolean;
    children: ReactNode;
    className?: string;
}

export const TabsTrigger: React.FC<TabsTriggerProps> = ({
    value,
    disabled = false,
    children,
    className = '',
}) => {
    const { activeTab, setActiveTab, variant } = useTabsContext();
    const isActive = activeTab === value;

    const triggerClasses = [
        styles.tabsTrigger,
        styles[`tabsTrigger${variant.charAt(0).toUpperCase() + variant.slice(1)}`],
        isActive && styles.active,
        disabled && styles.disabled,
        className,
    ].filter(Boolean).join(' ');

    return (
        <button
            type="button"
            role="tab"
            className={triggerClasses}
            onClick={() => !disabled && setActiveTab(value)}
            disabled={disabled}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
        >
            {children}
        </button>
    );
};

export interface TabsContentProps {
    value: string;
    children: ReactNode;
    className?: string;
}

export const TabsContent: React.FC<TabsContentProps> = ({
    value,
    children,
    className = '',
}) => {
    const { activeTab } = useTabsContext();

    if (activeTab !== value) return null;

    return (
        <div
            role="tabpanel"
            className={`${styles.tabsContent} ${className}`}
            tabIndex={0}
        >
            {children}
        </div>
    );
};

export default Tabs;
