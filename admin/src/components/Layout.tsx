import { NavLink, Outlet } from 'react-router-dom';

interface LayoutProps {
    onLogout?: () => void;
}

/**
 * 管理后台布局组件
 * 包含侧边栏导航和主内容区域
 */
export function Layout({ onLogout }: LayoutProps) {
    const handleLogout = () => {
        if (confirm('确定要退出登录吗？')) {
            onLogout?.();
        }
    };

    return (
        <div className="app-container">
            {/* 侧边栏 */}
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <div className="sidebar-logo-icon">⏰</div>
                        <span className="sidebar-logo-text">CF-Reminder</span>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <div className="nav-section">
                        <div className="nav-section-title">概览</div>
                        <NavLink
                            to="/"
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            end
                        >
                            <span className="nav-item-icon">📊</span>
                            <span>仪表盘</span>
                        </NavLink>
                        <NavLink
                            to="/butler"
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        >
                            <span className="nav-item-icon">🤖</span>
                            <span>智能管家</span>
                        </NavLink>
                    </div>


                    <div className="nav-section">
                        <div className="nav-section-title">任务管理</div>
                        <NavLink
                            to="/tasks"
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        >
                            <span className="nav-item-icon">📋</span>
                            <span>任务列表</span>
                        </NavLink>
                        <NavLink
                            to="/email"
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        >
                            <span className="nav-item-icon">📧</span>
                            <span>邮箱中心</span>
                        </NavLink>
                        <NavLink
                            to="/create"
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        >
                            <span className="nav-item-icon">➕</span>
                            <span>创建任务</span>
                        </NavLink>
                    </div>

                    <div className="nav-section">
                        <div className="nav-section-title">内容管理</div>
                        <NavLink
                            to="/templates"
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        >
                            <span className="nav-item-icon">📝</span>
                            <span>消息模板</span>
                        </NavLink>
                        <NavLink
                            to="/logs"
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        >
                            <span className="nav-item-icon">📊</span>
                            <span>执行日志</span>
                        </NavLink>
                    </div>

                    <div className="nav-section">
                        <div className="nav-section-title">系统</div>
                        <NavLink
                            to="/settings"
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        >
                            <span className="nav-item-icon">⚙️</span>
                            <span>系统设置</span>
                        </NavLink>
                    </div>
                </nav>

                {/* 侧边栏底部信息 */}
                <div className="sidebar-footer">
                    <div className="sidebar-footer-content">
                        <span className="sidebar-version">v1.0.0</span>
                        <button
                            onClick={handleLogout}
                            className="sidebar-link"
                            style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 0,
                                font: 'inherit',
                            }}
                        >
                            🚪 退出登录
                        </button>
                    </div>
                </div>
            </aside>

            {/* 主内容区域 */}
            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
}
