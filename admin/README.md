# NeverForget Admin

`admin` 是 NeverForget 的管理后台，基于 React + TypeScript + Vite。

## 页面与功能

### 概览
- 仪表盘（统计、趋势、最近任务）
- 智能管家（AI 对话 + 历史记忆）

### 任务管理
- 任务列表（筛选、搜索、排序）
- 任务详情（执行记录、状态）
- 创建/编辑任务（多步向导）

### 邮箱中心
- 外部邮箱账户（IMAP 配置、启停、立即同步）
- 邮件列表与详情查看
- 黑名单与过滤规则
- 转发服务配置与测试推送

### 内容与通知
- 消息模板管理
- 执行日志中心
- 通知中心（推送追踪、失败重试）

### 系统设置
- API 地址/认证配置
- 默认推送配置
- AI 模型池（本地与云端配置）
- 数据导入导出与系统信息

## 路由

```text
/login            登录/初始化
/                 仪表盘
/butler           智能管家
/tasks            任务列表
/tasks/:id        任务详情
/tasks/:id/edit   编辑任务
/create            创建任务
/email            邮箱中心
/templates        模板管理
/logs             执行日志
/notifications    通知中心
/settings         系统设置
```

## 快速开始

### 1. 安装依赖

```bash
cd admin
npm install
```

### 2. 本地开发

```bash
npm run dev
```

默认访问：`http://localhost:5173`

### 3. 构建

```bash
npm run build
```

### 4. 预览

```bash
npm run preview
```

## 配置说明

前端按以下优先级获取后端地址：

1. `localStorage.api_url`
2. `VITE_API_URL`

鉴权方式：
- 首选 JWT：`localStorage.auth_token`
- 兼容旧版：`localStorage.api_key` / `VITE_API_KEY`

可选 `.env`：

```env
VITE_API_URL=https://your-worker.workers.dev
VITE_API_KEY=your-legacy-api-key
```

## 登录与初始化流程

1. 输入 API 地址。
2. 页面调用 `/api/auth/init-status` 判断系统是否初始化。
3. 未初始化时，进入初始化模式，提交 `/api/auth/setup`。
4. 初始化后自动登录，或已初始化直接 `/api/auth/login`。
5. Token 写入 `localStorage.auth_token`。

## 与后端联调建议

- 后端启动：仓库根目录执行 `npm run dev`。
- 前端启动：`cd admin && npm run dev`。
- 首次联调先确认后端已完成数据库迁移与 `JWT_SECRET` 配置。

## 目录概览

```text
admin/src/
├─ api/                    # API 请求封装
├─ components/             # 通用组件与业务组件
├─ pages/                  # 页面级组件
├─ styles/                 # 样式变量
├─ types/                  # 前端类型定义
├─ App.tsx                 # 路由入口
└─ main.tsx                # 渲染入口
```

## License

MIT
