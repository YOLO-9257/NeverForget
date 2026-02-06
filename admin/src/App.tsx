import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout, AuthGuard } from './components';
import { Dashboard } from './pages/Dashboard';
import { TaskList } from './pages/TaskList';
import { TaskDetail } from './pages/TaskDetail';
import { CreateTask } from './pages/CreateTask';
import { Templates } from './pages/Templates';
import { Settings } from './pages/Settings';
import { Logs } from './pages/Logs';
import { Login } from './pages/Login';
import { AiButler } from './pages/AiButler';
import { EmailHub } from './pages/EmailHub';
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
      const apiKey = localStorage.getItem('api_key'); // 兼容旧版
      const authToken = localStorage.getItem('auth_token');

      // 必须有 Token 或旧版 Key 且有 API URL 才视为已登录
      if (apiUrl && (authToken || apiKey)) {
        setIsLoggedIn(true);
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  // 登录成功回调
  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  // 登出回调
  const handleLogout = () => {
    localStorage.removeItem('api_url');
    localStorage.removeItem('api_key');
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


  // 即使未登录，也渲染 Router，但通过守卫控制访问
  return (
    <Routes>
      {/* 登录页 */}
      <Route
        path="/login"
        element={
          isLoggedIn ? <Navigate to={from} replace /> : <Login onLogin={handleLogin} />
        }
      />

      {/* 受保护的路由区域 */}
      <Route element={
        <AuthGuard isLoggedIn={isLoggedIn}>
          <Layout onLogout={handleLogout} />
        </AuthGuard>
      }>

        {/* 仪表盘 - 首页 */}
        <Route index element={<Dashboard />} />

        {/* 智能管家 */}
        <Route path="butler" element={<AiButler />} />


        {/* 任务管理 */}
        <Route path="tasks" element={<TaskList />} />
        <Route path="tasks/:id" element={<TaskDetail />} />
        <Route path="tasks/:id/edit" element={<CreateTask />} />
        <Route path="create" element={<CreateTask />} />

        {/* 邮箱中心 */}
        <Route path="email" element={<EmailHub />} />

        {/* 内容管理 */}
        <Route path="templates" element={<Templates />} />
        <Route path="logs" element={<Logs />} />

        {/* 系统设置 */}
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* 404/其他 重定向 - 如果未登录会先被守卫拦截，如果已登录则去首页 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
