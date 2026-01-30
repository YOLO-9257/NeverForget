# NeverForget Admin - 管理后台

基于 **React 19 + TypeScript + Vite** 构建的现代化管理界面，提供可视化的任务管理和系统配置功能。

## ✨ 功能特性

### 📊 仪表盘 (Dashboard)
- 实时统计概览（总任务数、运行中、成功率等）
- 执行趋势图表（最近 7 天）
- 任务状态分布饼图
- 最近任务列表

### 📋 任务管理
- **任务列表**：查看、筛选、搜索所有定时任务
- **任务详情**：查看任务配置和执行日志
- **任务创建**：三步向导式创建任务
  - 选择预设模板（喝水提醒、会议提醒等）
  - 配置调度规则（一次性、每日、每周、每月、Cron）
  - 设置推送参数（微信公众号配置）

### 📝 消息模板
- 预设模板库（通用提醒、喝水提醒、会议提醒等）
- 自定义模板创建和编辑
- 变量系统支持（`{{title}}`、`{{content}}` 等）
- 实时预览效果
- 模板分类管理

### ⚙️ 系统设置
- API 连接配置（Workers URL、API Key）
- 默认推送配置（AppID、Secret、模板 ID）
- 通知设置
- 数据导入/导出
- 系统信息查看

## 🚀 快速开始

### 1. 安装依赖

```bash
cd cf-reminder/admin
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173

### 3. 构建生产版本

```bash
npm run build
```

构建产物位于 `dist` 目录。

## 📁 项目结构

```
admin/
├── src/
│   ├── api/           # API 封装
│   │   └── index.ts   # 统一 API 调用方法
│   ├── components/    # 公共组件
│   │   └── Layout.tsx # 布局组件（侧边栏 + 主内容区）
│   ├── pages/         # 页面组件
│   │   ├── Dashboard.tsx    # 仪表盘
│   │   ├── TaskList.tsx     # 任务列表
│   │   ├── TaskDetail.tsx   # 任务详情
│   │   ├── CreateTask.tsx   # 创建任务
│   │   ├── Templates.tsx    # 消息模板管理
│   │   └── Settings.tsx     # 系统设置
│   ├── types/         # TypeScript 类型定义
│   │   └── index.ts
│   ├── App.tsx        # 应用入口 + 路由
│   ├── main.tsx       # 渲染入口
│   └── index.css      # 全局样式
├── public/            # 静态资源
├── index.html         # HTML 模板
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 🎨 设计系统

### 配色方案

| 变量 | 值 | 用途 |
|------|-----|------|
| `--primary` | `hsl(245, 80%, 60%)` | 主色调 - 紫色 |
| `--accent` | `hsl(175, 80%, 45%)` | 强调色 - 青色 |
| `--success` | `hsl(150, 70%, 45%)` | 成功状态 |
| `--warning` | `hsl(40, 95%, 55%)` | 警告状态 |
| `--error` | `hsl(0, 75%, 55%)` | 错误状态 |

### 主要组件

- **统计卡片** (`.stat-card`)：展示关键指标
- **数据表格** (`.table`)：任务列表展示
- **表单元素** (`.form-input`, `.form-select`)：用户输入
- **状态徽章** (`.badge`)：状态标识
- **模态框** (`.modal`)：弹窗对话

## 🔧 配置说明

### 环境变量

在项目根目录创建 `.env` 文件：

```env
# API 地址（可选，默认使用相对路径）
VITE_API_URL=https://cf-reminder.your-account.workers.dev

# API 密钥（可选，也可在设置页面配置）
VITE_API_KEY=your-api-key
```

### API 配置

管理后台通过以下方式获取 API 配置（优先级从高到低）：

1. `localStorage.api_key` - 用户在设置页面配置
2. 环境变量 `VITE_API_KEY`
3. 空字符串（需要手动配置）

## 📱 响应式设计

- **桌面端**（>1024px）：完整侧边栏 + 双栏布局
- **平板端**（768-1024px）：收缩侧边栏 + 单栏布局
- **移动端**（<768px）：隐藏侧边栏 + 自适应布局

## 🛠 技术栈

- **框架**: React 19
- **语言**: TypeScript 5.x
- **构建工具**: Vite 7.x
- **路由**: React Router DOM 7.x
- **图表**: Recharts 3.x
- **日期处理**: date-fns 4.x
- **样式**: 原生 CSS + CSS 变量

## 📝 开发指南

### 添加新页面

1. 在 `src/pages/` 创建新组件
2. 在 `src/App.tsx` 添加路由
3. 在 `src/components/Layout.tsx` 添加导航项

### 添加新 API

1. 在 `src/api/index.ts` 添加 API 方法
2. 在 `src/types/index.ts` 添加类型定义

### 样式开发

所有样式定义在 `src/index.css`，按模块组织：
- CSS 变量定义
- 全局重置
- 布局容器
- 组件样式
- 响应式适配

## 📄 License

MIT
