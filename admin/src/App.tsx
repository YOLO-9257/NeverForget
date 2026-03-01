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
import { NotificationCenter } from './pages/NotificationCenter';
import { AUTH_EXPIRED_EVENT } from './api';
import styles from './App.module.css';
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

  // 统一处理 401 会话过期
  useEffect(() => {
    const handleAuthExpired = () => {
      setIsLoggedIn(false);
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, []);

  const location = useLocation();
  const fromLocation = location.state?.from;
  const from = fromLocation
    ? `${fromLocation.pathname || '/'}${fromLocation.search || ''}`
    : '/';

  // 登录成功回调
  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  // 登出回调
  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('api_key');
    localStorage.removeItem('username');
    setIsLoggedIn(false);
  };

  // 加载中
  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={`spinner ${styles.loadingSpinner}`} />
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
        <Route path="notifications" element={<NotificationCenter />} />

        {/* 系统设置 */}
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* 404/其他 重定向 - 如果未登录会先被守卫拦截，如果已登录则去首页 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
