# CF-Reminder 部署指南

> 本文档详细说明如何将 CF-Reminder 项目部署到 Cloudflare 的 **Workers**（后端 API）和 **Pages**（前端管理后台）。

## 📋 目录

- [架构概述](#架构概述)
- [前置条件](#前置条件)
- [第一部分：部署后端 (Cloudflare Workers)](#第一部分部署后端-cloudflare-workers)
- [第二部分：部署前端 (Cloudflare Pages)](#第二部分部署前端-cloudflare-pages)
- [第三部分：验证部署](#第三部分验证部署)
- [常见问题](#常见问题)
- [附录：命令速查表](#附录命令速查表)

---

## 架构概述

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare 基础设施                          │
│                                                                 │
│  ┌───────────────────────┐    ┌───────────────────────────┐    │
│  │   Cloudflare Pages    │    │   Cloudflare Workers      │    │
│  │   (前端管理后台)       │───▶│   (后端 API + 定时任务)    │    │
│  │   reminder-admin      │    │   cf-reminder             │    │
│  └───────────────────────┘    └───────────────────────────┘    │
│                                         │                       │
│                               ┌─────────▼─────────┐             │
│                               │   Cloudflare D1   │             │
│                               │   (SQLite 数据库)  │             │
│                               │   reminder-db     │             │
│                               └───────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼ HTTP(S)
                              ┌─────────────────────┐
                              │   go-wxpush 服务    │
                              │   (微信推送后端)     │
                              └─────────────────────┘
```

**项目结构说明**：

| 目录 | 部署目标 | 说明 |
|------|----------|------|
| `cf-reminder/` | Cloudflare Workers | 后端 API 服务 + Cron 定时触发器 |
| `cf-reminder/admin/` | Cloudflare Pages | React 前端管理界面 |

---

## 前置条件

在开始部署之前，请确保您已满足以下条件：

### 1. 账号要求
- [x] **Cloudflare 账号**：[点击注册](https://dash.cloudflare.com/sign-up)（免费套餐即可）
- [x] **已部署的 go-wxpush 服务**：用于实际发送微信消息

### 2. 开发环境
- [x] **Node.js** >= 18.x（推荐 LTS 版本）
- [x] **npm** >= 9.x
- [x] **Git**（可选，用于版本管理）

### 3. 验证环境

```bash
# 检查 Node.js 版本
node -v
# 输出示例：v20.10.0

# 检查 npm 版本
npm -v
# 输出示例：10.2.3
```

---

## 第一部分：部署后端 (Cloudflare Workers)

后端服务负责：
- 提供 REST API 接口
- 每分钟执行 Cron 触发器检查待执行的任务
- 调用 go-wxpush 发送微信消息

### 步骤 1.1：进入项目目录

```bash
cd cf-reminder
```

### 步骤 1.2：安装依赖

```bash
npm install
```

### 步骤 1.3：登录 Cloudflare

```bash
npx wrangler login
```

> 执行后浏览器会自动弹出 Cloudflare 授权页面，点击 **Allow** 授权即可。

### 步骤 1.4：创建 D1 数据库

> ⚠️ **注意**：如果您之前已经创建过数据库，请跳过此步骤。

```bash
npx wrangler d1 create reminder-db
```

执行成功后，终端会输出类似以下内容：

```
✅ Successfully created DB 'reminder-db' in region APAC
Created your new D1 database.

[[d1_databases]]
binding = "DB"
database_name = "reminder-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # <-- 记录这个 ID
```

### 步骤 1.5：更新配置文件

编辑 `wrangler.toml` 文件，将 `database_id` 替换为您刚才获得的 ID：

```toml
name = "cf-reminder"
main = "src/index.ts"
compatibility_date = "2024-01-17"

# 定时触发器：每分钟执行一次
[triggers]
crons = ["* * * * *"]

# D1 数据库绑定
[[d1_databases]]
binding = "DB"
database_name = "reminder-db"
database_id = "您的数据库ID"  # <-- 替换这里

# 环境变量
[vars]
WORKER_BASE_URL = "https://cf-reminder.您的域名.workers.dev"
PUSH_SERVICE_URL = "https://您的go-wxpush服务地址"
TIMEZONE = "Asia/Shanghai"

[dev]
port = 8787
local_protocol = "http"
```

**关键配置说明**：

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `database_id` | D1 数据库的唯一标识符 | `9ad6af77-0296-4e6c-b872-dd1a6d060b14` |
| `PUSH_SERVICE_URL` | go-wxpush 服务地址（**必须 HTTPS**） | `https://push.yolo.ccwu.cc` |
| `WORKER_BASE_URL` | Worker 自身的 URL（用于生成链接） | `https://cf-reminder.xxx.workers.dev` |

### 步骤 1.6：初始化数据库表结构

```bash
# 执行初始化 SQL 脚本
npm run db:init

# 如果有额外的迁移脚本，也一并执行（可选）
npm run db:migrate:custom-html
```

> 💡 **提示**：执行时可能会提示确认，输入 `y` 即可。

### 步骤 1.7：配置 API 密钥（安全认证）

为了保护 API 接口，需要设置 API Key：

```bash
npx wrangler secret put API_KEYS
```

执行后会提示输入密钥值，您可以输入一个或多个密钥（用逗号分隔）：

```
Enter a secret value: your-secure-api-key-here
```

> 💡 **建议**：使用强密码生成器创建一个复杂的密钥，例如 `sk-cf-abc123xyz789`

### 步骤 1.8：部署 Worker

```bash
npm run deploy
# 或者
npx wrangler deploy
```

**部署成功后的输出**：

```
Uploaded cf-reminder (1.23 sec)
Deployed cf-reminder triggers (0.25 sec)
  https://cf-reminder.您的账户.workers.dev
Current Version ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

> 📝 **重要**：请记录这个 URL（例如 `https://cf-reminder.xxx.workers.dev`），下一步部署前端时需要使用。

---

## 第二部分：部署前端 (Cloudflare Pages)

前端管理后台提供：
- 可视化任务管理界面
- 仪表盘统计
- 消息模板管理
- 系统设置

### 步骤 2.1：进入前端目录

```bash
cd admin
```

### 步骤 2.2：安装依赖

```bash
npm install
```

### 步骤 2.3：配置环境变量（可选）

您可以在构建前创建 `.env` 文件来预设 API 地址：

```bash
# 创建 .env 文件
echo VITE_API_URL=https://cf-reminder.您的账户.workers.dev > .env
```

或者手动创建 `.env` 文件：

```env
# API 地址（必填）
VITE_API_URL=https://cf-reminder.您的账户.workers.dev

# API 密钥（可选，也可在管理后台的设置页面配置）
# VITE_API_KEY=your-api-key
```

> 💡 **替代方案**：如果不在这里配置，也可以在部署后通过管理后台的「设置」页面进行配置。

### 步骤 2.4：构建项目

```bash
npm run build
```

构建成功后会在 `dist/` 目录生成静态文件。

### 步骤 2.5：部署到 Cloudflare Pages

```bash
npx wrangler pages deploy dist --project-name=reminder-admin
```

**首次部署提示**：

```
? The project "reminder-admin" doesn't exist. Create project? (y/n)
```

输入 `y` 确认创建。

**部署成功后的输出**：

```
✨ Deployment complete!
Take a look at your site: https://reminder-admin.pages.dev
```

### 步骤 2.6：配置 Pages 环境变量（推荐）

为了让环境变量持久生效，建议在 Cloudflare Dashboard 中配置：

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages**
3. 找到并点击 `reminder-admin` 项目
4. 点击 **Settings (设置)** > **Environment variables (环境变量)**
5. 点击 **Add variable** 添加：
   - **Variable name**: `VITE_API_URL`
   - **Value**: 您的 Worker URL（例如 `https://cf-reminder.xxx.workers.dev`）
6. 点击 **Save**
7. 返回 **Deployments** 页面，点击最新部署右侧的 **...** > **Retry deployment** 重新构建

---

## 第三部分：验证部署

### 3.1 验证后端 API

使用 `curl` 或浏览器测试 API：

```bash
# 测试健康检查端点
curl https://cf-reminder.您的账户.workers.dev/api/health

# 测试认证（需要 API Key）
curl -H "Authorization: Bearer your-api-key" \
     https://cf-reminder.您的账户.workers.dev/api/reminders
```

**预期响应**：

```json
{
  "status": "ok",
  "timestamp": "2026-01-27T06:00:00.000Z"
}
```

### 3.2 验证前端管理后台

1. 打开浏览器，访问 Pages URL（例如 `https://reminder-admin.pages.dev`）
2. 如果出现登录/配置页面，输入：
   - **API URL**: 您的 Worker 地址
   - **API Key**: 步骤 1.7 中设置的密钥
3. 进入仪表盘，查看是否正常加载

### 3.3 创建测试任务

1. 在管理后台点击「创建任务」
2. 选择一个模板（如喝水提醒）
3. 设置为「一次性」并选择 2 分钟后的时间
4. 填写推送配置（微信公众号的 AppID、Secret 等）
5. 提交任务
6. 等待触发时间，检查是否收到微信推送

---

## 常见问题

### Q1: 部署时提示 "Error: Database not found"

**原因**：`wrangler.toml` 中的 `database_id` 不正确。

**解决方案**：
```bash
# 查看已创建的数据库列表
npx wrangler d1 list

# 复制正确的 ID 到 wrangler.toml
```

### Q2: 前端无法连接后端 API

**原因**：CORS 跨域问题或 API URL 配置错误。

**解决方案**：
1. 检查 `.env` 或环境变量中的 `VITE_API_URL` 是否正确
2. 确保 Worker 已正确处理 CORS（项目代码已内置支持）

### Q3: 推送失败 - "Error: Unable to fetch"

**原因**：Cloudflare Workers 无法访问 HTTP 协议的 IP 地址。

**解决方案**：
- `PUSH_SERVICE_URL` 必须使用 **HTTPS + 域名** 格式
- 错误示例：`http://123.456.789.0:8080/wxsend`
- 正确示例：`https://push.yourdomain.com`

### Q4: 如何更新已部署的服务？

**后端更新**：
```bash
cd cf-reminder
npm run deploy
```

**前端更新**：
```bash
cd cf-reminder/admin
npm run build
npx wrangler pages deploy dist --project-name=reminder-admin
```

### Q5: 如何查看 Worker 日志？

```bash
# 实时查看日志
npx wrangler tail

# 或在 Cloudflare Dashboard 查看
# Workers & Pages > cf-reminder > Logs
```

---

## 附录：命令速查表

### 后端 (Workers) 命令

| 命令 | 说明 |
|------|------|
| `npm install` | 安装依赖 |
| `npx wrangler login` | 登录 Cloudflare |
| `npx wrangler d1 create reminder-db` | 创建 D1 数据库 |
| `npm run db:init` | 初始化数据库表结构 |
| `npm run db:migrate:custom-html` | 执行迁移脚本 |
| `npx wrangler secret put API_KEYS` | 设置 API 密钥 |
| `npm run deploy` | 部署 Worker |
| `npm run dev` | 启动本地开发服务器 |
| `npx wrangler tail` | 查看实时日志 |

### 前端 (Pages) 命令

| 命令 | 说明 |
|------|------|
| `npm install` | 安装依赖 |
| `npm run dev` | 启动本地开发服务器（端口 5173） |
| `npm run build` | 构建生产版本 |
| `npx wrangler pages deploy dist --project-name=reminder-admin` | 部署到 Pages |

---

## 📝 更新日志

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v1.0 | 2026-01-27 | 初始版本 |

---

> 📧 如果您在部署过程中遇到问题，请检查 Cloudflare Dashboard 中的日志，或提交 Issue。
