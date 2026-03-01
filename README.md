# NeverForget

NeverForget 是一个基于 Cloudflare Workers 的提醒与邮件自动化系统。

它不仅支持传统定时提醒，还包含邮箱同步、邮件 AI 摘要、工作流规则、多渠道通知追踪，以及 React 管理后台。

## 当前功能范围

### 后端（Workers）
- 定时提醒 CRUD（一次性 / 每日 / 每周 / 每月 / Cron）
- Cron 每分钟调度执行
- 提醒确认回调（`ack`）与手动触发
- 全局执行日志与统计（含三层日志模型）
- 邮箱账户管理（IMAP）与手动/自动同步
- Email Routing 入站邮件接收与转发
- 邮件黑名单与过滤规则
- 邮件 AI 解析、摘要、待办提取、从邮件创建提醒
- AI 对话管家（带上下文记忆）
- 多渠道通知与推送追踪（重试、健康检查）
- 邮件工作流规则（条件 + 动作 + 执行记录）

### 前端（admin）
- 登录/初始化（首个管理员账户创建）
- 仪表盘、任务管理、任务创建向导
- 邮箱中心（外部邮箱、转发服务）
- 智能管家、通知中心、执行日志
- 模板管理、系统设置（API/推送/AI 模型池）

## 技术栈

- 后端：Cloudflare Workers + D1 + TypeScript
- 前端：React 19 + TypeScript + Vite
- 调度：Workers Cron Trigger（`* * * * *`）
- 邮件：Cloudflare Email Routing + IMAP 拉取

## 目录结构

```text
.
├─ src/                # Workers 后端
├─ migrations/         # D1 迁移脚本（0001 ~ 0026）
├─ admin/              # React 管理后台
├─ docs/               # 设计与 API 说明
├─ tests/              # 单元测试
├─ wrangler.toml.example # 提交到仓库的配置模板
├─ wrangler.toml         # 本地真实配置（已忽略）
└─ package.json
```

## 快速开始

### 1. 安装依赖

```bash
npm install
cd admin && npm install
```

### 2. 配置 Cloudflare 与 D1

```bash
npx wrangler login
npx wrangler d1 create reminder-db
```

先从模板复制本地配置文件：

```bash
cp wrangler.toml.example wrangler.toml
```

PowerShell 可用：

```powershell
Copy-Item .\wrangler.toml.example .\wrangler.toml
```

将返回的 `database_id` 写入本地 `wrangler.toml` 的 `[[d1_databases]]`。

### 3. 配置 `wrangler.toml` 变量

必须检查并按实际环境修改：

- `WORKER_BASE_URL`
- `PUSH_SERVICE_URL`
- `TIMEZONE`
- `EMAIL_DOMAIN`（如启用入站邮件）

### 4. 执行数据库迁移

完整功能依赖 `migrations/` 全量 SQL。

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

### 5. 配置 Secrets（推荐）

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put ENCRYPTION_KEY
npx wrangler secret put API_KEYS
# 如启用全局 AI
npx wrangler secret put AI_API_KEY
```

说明：
- `JWT_SECRET`：管理员登录签发 Token 的密钥。
- `ENCRYPTION_KEY`：IMAP 密码加密存储密钥。
- `API_KEYS`：旧版兼容认证（可选）。
- `AI_API_KEY`：AI 摘要/管家默认密钥（可选）。

### 6. 本地开发

后端：

```bash
npm run dev
```

前端：

```bash
cd admin
npm run dev
```

默认地址：
- Workers: `http://localhost:8787`
- Admin: `http://localhost:5173`

### 7. 部署

```bash
npm run deploy
```

前端可构建后部署到 Cloudflare Pages：

```bash
cd admin
npm run build
npx wrangler pages deploy dist --project-name=neverforget-admin
```

## 认证与初始化

首次使用建议流程：

1. `GET /api/auth/init-status` 检查是否已初始化。
2. 若未初始化，调用 `POST /api/auth/setup` 创建首个管理员。
3. 调用 `POST /api/auth/login` 获取 JWT。
4. 业务 API 使用 `Authorization: Bearer <token>`。

兼容模式：仍支持 `API_KEYS` 作为 Bearer Token。

## 核心 API 分组

- 健康检查：`GET /`、`GET /health`
- 认证：`/api/auth/*`
- 提醒：`/api/reminders*`
- 统计与日志：`/api/stats`、`/api/logs`
- 邮箱与邮件：`/api/email/*`
- AI：`/api/ai/chat`、`/api/email/*summary*`
- 通知：`/api/notification/*`、`/api/push/tracking*`
- 工作流：`/api/workflow/rules*`

详细接口见 [docs/API_REFERENCE.md](docs/API_REFERENCE.md)。

## 测试与检查

```bash
npm run test
npm run typecheck
```

## 相关文档

- 部署指南：[`DEPLOY_GUIDE.md`](DEPLOY_GUIDE.md)
- API 文档：[`docs/API_REFERENCE.md`](docs/API_REFERENCE.md)
- 后台说明：[`admin/README.md`](admin/README.md)

## License

MIT
