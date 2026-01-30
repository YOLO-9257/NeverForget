import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { TaskList } from './pages/TaskList';
import { TaskDetail } from './pages/TaskDetail';
import { CreateTask } from './pages/CreateTask';
import { Templates } from './pages/Templates';
import { Settings } from './pages/Settings';
import { Logs } from './pages/Logs';
import { Login } from './pages/Login';
import './index.css';

/**
 * CF-Reminder 管理后台应用入口
 * 
 * 路由结构：
 * - /login : 登录页
 * - / : 仪表盘
 * - /tasks : 任务列表
 * - /tasks/:id : 任务详情
 * - /create : 创建任务
 * - /templates : 消息模板管理
 * - /settings : 系统设置
 */
function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 检查登录状态
  useEffect(() => {
    const checkAuth = () => {
      const apiUrl = localStorage.getItem('api_url');
      const apiKey = localStorage.getItem('api_key');
      const demoMode = localStorage.getItem('demo_mode');

      // 有 API 配置或演示模式则视为已登录
      if ((apiUrl && apiKey) || demoMode === 'true') {
        setIsLoggedIn(true);
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  // 登录成功回调
  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  // 登出回调
  const handleLogout = () => {
    localStorage.removeItem('api_url');
    localStorage.removeItem('api_key');
    localStorage.removeItem('demo_mode');
    setIsLoggedIn(false);
  };

  // 加载中
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontSize: '16px',
      }}>
        <div className="spinner" style={{ marginRight: '12px' }} />
        正在加载...
      </div>
    );
  }

  // 未登录时显示登录页
  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout onLogout={handleLogout} />}>
          {/* 仪表盘 - 首页 */}
          <Route index element={<Dashboard />} />

          {/* 任务管理 */}
          <Route path="tasks" element={<TaskList />} />
          <Route path="tasks/:id" element={<TaskDetail />} />
          <Route path="tasks/:id/edit" element={<CreateTask />} />
          <Route path="create" element={<CreateTask />} />

          {/* 内容管理 */}
          <Route path="templates" element={<Templates />} />
          <Route path="logs" element={<Logs />} />

          {/* 系统设置 */}
          <Route path="settings" element={<Settings />} />

          {/* 404 重定向到首页 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
