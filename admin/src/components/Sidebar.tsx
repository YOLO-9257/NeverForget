import { NavLink } from 'react-router-dom';

// 导航菜单项
const menuItems = [
    {
        section: '概览',
        items: [
            { path: '/', icon: '📊', label: '仪表盘' },
        ],
    },
    {
        section: '任务管理',
        items: [
            { path: '/tasks', icon: '📋', label: '任务列表' },
            { path: '/create', icon: '➕', label: '创建任务' },
            { path: '/templates', icon: '📝', label: '任务模板' },
        ],
    },
    {
        section: '设置',
        items: [
            { path: '/settings', icon: '⚙️', label: '系统设置' },
        ],
    },
];

export function Sidebar() {
    return (
        <aside className="sidebar">
            {/* Logo */}
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon">⏰</div>
                    <span className="sidebar-logo-text">CF-Reminder</span>
                </div>
            </div>

            {/* 导航菜单 */}
            <nav className="sidebar-nav">
                {menuItems.map((section) => (
                    <div key={section.section} className="nav-section">
                        <div className="nav-section-title">{section.section}</div>
                        {section.items.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={({ isActive }) =>
                                    `nav-item ${isActive ? 'active' : ''}`
                                }
                            >
                                <span className="nav-item-icon">{item.icon}</span>
                                <span>{item.label}</span>
                            </NavLink>
                        ))}
                    </div>
                ))}
            </nav>

            {/* 底部信息 */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    版本 1.0.0
                </div>
            </div>
        </aside>
    );
}
