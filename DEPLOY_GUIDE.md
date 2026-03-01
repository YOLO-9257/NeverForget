# NeverForget 部署指南

本文档用于将 NeverForget 部署到 Cloudflare Workers（后端）与 Cloudflare Pages（前端）。

## 架构

- Workers：API、Cron 调度、Email Worker
- D1：任务、日志、账号与配置数据
- Pages（可选）：管理后台 `admin`
- 外部服务：推送服务（`PUSH_SERVICE_URL`）

## 前置条件

- Cloudflare 账号
- Node.js 18+
- npm 9+
- 已可访问的推送服务（HTTPS 域名）

## 一、部署后端（Workers）

### 1. 安装依赖

```bash
npm install
```

### 2. 登录并创建 D1

```bash
npx wrangler login
npx wrangler d1 create reminder-db
```

把返回的 `database_id` 写到 `wrangler.toml`。

### 3. 检查 `wrangler.toml`

至少确认：
- `name`
- `[[d1_databases]]` 中的 `database_id`
- `WORKER_BASE_URL`
- `PUSH_SERVICE_URL`
- `TIMEZONE`
- `EMAIL_DOMAIN`（启用邮件接收时）

### 4. 执行迁移

完整功能依赖 `migrations/*.sql` 全部执行。

PowerShell（远程）：

```powershell
Get-ChildItem ./migrations/*.sql |
  Sort-Object Name |
  ForEach-Object { npx wrangler d1 execute reminder-db --remote --file=$_.FullName }
```

PowerShell（本地）：

```powershell
Get-ChildItem ./migrations/*.sql |
  Sort-Object Name |
  ForEach-Object { npx wrangler d1 execute reminder-db --local --file=$_.FullName }
```

### 5. 配置 Secrets

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put ENCRYPTION_KEY
npx wrangler secret put API_KEYS
# 可选
npx wrangler secret put AI_API_KEY
```

建议：
- `JWT_SECRET` 必配。
- `ENCRYPTION_KEY` 建议必配（用于 IMAP 密码加密）。
- `API_KEYS` 仅做兼容鉴权。

### 6. 部署

```bash
npm run deploy
```

## 二、部署前端（Pages，可选）

### 1. 构建

```bash
cd admin
npm install
npm run build
```

### 2. 发布到 Pages

```bash
npx wrangler pages deploy dist --project-name=neverforget-admin
```

### 3. Pages 环境变量（推荐）

在 Pages 项目中配置：
- `VITE_API_URL=https://你的-workers-地址`
- `VITE_API_KEY=...`（仅旧版兼容，可不配）

## 三、验证部署

### 1. 后端健康检查

```bash
curl https://your-worker.workers.dev/health
```

### 2. 初始化与登录

1. `GET /api/auth/init-status`
2. 若未初始化：`POST /api/auth/setup`
3. `POST /api/auth/login` 获取 JWT
4. 用 `Authorization: Bearer <token>` 调用业务接口

### 3. 核心接口验证

```bash
curl -H "Authorization: Bearer <token>" \
  https://your-worker.workers.dev/api/reminders
```

## 四、邮件接收（可选）

启用 Cloudflare Email Routing 并将 Catch-all 或指定地址路由到该 Worker。

完成后可使用：
- `user@<EMAIL_DOMAIN>` 作为系统接收邮箱
- Worker `email()` 入口自动处理来信

## 五、常见问题

### 1) 401 未授权
- 检查是否已完成 `/api/auth/setup`。
- 检查 `JWT_SECRET` 是否已配置且前后端环境一致。

### 2) 推送失败 `Unable to fetch`
- `PUSH_SERVICE_URL` 必须是 HTTPS + 域名。
- 不要使用 HTTP 或裸 IP。

### 3) 功能缺失/表不存在
- 说明迁移未完整执行。
- 请确认 `migrations/*.sql` 已按顺序全量执行。

### 4) 前端无法连后端
- 检查 `localStorage.api_url` 或 `VITE_API_URL`。
- 确认 Workers 地址可访问。

## 六、常用命令

后端：

```bash
npm run dev
npm run deploy
npm run test
npm run typecheck
```

前端：

```bash
cd admin
npm run dev
npm run build
npm run preview
```
