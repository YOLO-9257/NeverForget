# NeverForget - 分布式低成本定时提醒系统

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare Workers](https://img.shields.io/badge/Platform-Cloudflare_Workers-orange.svg)](https://workers.cloudflare.com/)

基于 **Cloudflare Workers** 的免费定时提醒服务，配合 **go-wxpush** 实现微信消息推送。

## ✨ 特性

- 🆓 **完全免费** - 基于 Cloudflare 免费套餐，零成本运行
- ⏰ **定时提醒** - 支持一次性、每日、每周、每月等多种调度模式
- 🌍 **全球边缘** - 部署在 Cloudflare 全球边缘网络，低延迟
- 📱 **微信推送** - 通过 go-wxpush 发送微信模板消息
- 🔒 **安全可靠** - API Key 认证，敏感数据安全存储

## 🏗 架构

```
┌─────────────────────────────────────────────────────┐
│           Cloudflare Workers (本项目)               │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │  REST API   │  │ Cron Trigger│  │ D1 SQLite │  │
│  │  提醒管理    │  │  每分钟检查  │  │ 任务存储   │  │
│  └─────────────┘  └─────────────┘  └───────────┘  │
└─────────────────────────────────────────────────────┘
                         │
                         ▼ HTTP
┌─────────────────────────────────────────────────────┐
│              go-wxpush 推送服务                      │
│                   /wxsend                           │
└─────────────────────────────────────────────────────┘
```

## 🚀 部署指南

### 前置条件

1. [Cloudflare 账号](https://dash.cloudflare.com/sign-up)
2. 已部署的 go-wxpush 服务

### 步骤 1: 安装依赖

```bash
npm install
```

### 步骤 2: 登录 Cloudflare

```bash
npx wrangler login
```

### 步骤 3: 创建 D1 数据库

```bash
# 创建数据库
npx wrangler d1 create reminder-db

# 记下返回的 database_id，更新到 wrangler.toml 中
```

### 步骤 4: 更新配置

编辑 `wrangler.toml`，替换以下值：

```toml
[[d1_databases]]
binding = "DB"
database_name = "reminder-db"
database_id = "your-actual-database-id"  # 替换为实际 ID

[vars]
DEFAULT_PUSH_URL = "https://your-push-server.com/wxsend"  # 替换为你的推送服务地址
```

### 步骤 5: 初始化数据库

```bash
# 远程环境
npx wrangler d1 execute reminder-db --file=./migrations/0001_init.sql

# 或本地开发
npx wrangler d1 execute reminder-db --local --file=./migrations/0001_init.sql
```

### 步骤 6: 配置 API Key

```bash
# 设置 API Key（多个用逗号分隔）
npx wrangler secret put API_KEYS
# 输入: your-api-key-1,your-api-key-2
```

### 步骤 7: 部署

```bash
npx wrangler deploy
```

部署成功后会返回 Workers URL，如：`https://never-forget.your-account.workers.dev`

## 📖 API 文档

### 认证

所有 API 请求需要在 Header 中携带 API Key：

```
Authorization: Bearer your-api-key
```

### 创建提醒

```http
POST /api/reminders
Content-Type: application/json

{
  "title": "喝水提醒",
  "content": "该喝水啦！保持健康~",
  "schedule_type": "daily",
  "schedule_time": "09:00",
  "timezone": "Asia/Shanghai",
  "push_config": {
    "appid": "your-appid",
    "secret": "your-secret",
    "userid": "your-userid",
    "template_id": "your-template-id"
  }
}
```

### 使用详情页模板

`cf-reminder` 本身只提供基础的详情页显示。如果您在 `go-wxpush` 服务中配置了自定义模板，可以通过 `template_name` 字段来引用它：

```http
POST /api/reminders
Content-Type: application/json

{
  "title": "模板提醒",
  "content": "使用指定的模板展示",
  "schedule_type": "once",
  "schedule_date": "2026-01-26",
  "schedule_time": "10:00",
  "push_config": {
    "appid": "your-appid",
    "secret": "your-secret",
    "userid": "your-userid",
    "template_id": "your-template-id"
  },
  "template_name": "holiday"  // 对应 go-wxpush 中配置的模板名称
}
```

**说明**：
- 如果 `template_name` 为空，将使用 `go-wxpush` 的默认模板。
- 管理后台支持从 `go-wxpush` 自动加载可用的模板列表供选择。

### 调度类型说明

| 类型 | schedule_type | 必填参数 | 示例 |
|------|---------------|----------|------|
| 一次性 | once | schedule_date, schedule_time | 2026-01-25 09:00 |
| 每天 | daily | schedule_time | 每天 09:00 |
| 每周 | weekly | schedule_weekday (0-6), schedule_time | 每周一 09:00 |
| 每月 | monthly | schedule_day (1-31), schedule_time | 每月 1 号 10:00 |
| Cron | cron | schedule_cron | `0 9 * * 1-5` |

### 查询提醒列表

```http
GET /api/reminders?status=active&limit=20&offset=0
```

### 获取提醒详情

```http
GET /api/reminders/:id
```

### 更新提醒

```http
PUT /api/reminders/:id
Content-Type: application/json

{
  "title": "新标题",
  "status": "paused"
}
```

### 删除提醒

```http
DELETE /api/reminders/:id
```

### 获取执行日志

```http
GET /api/reminders/:id/logs?limit=20
```

### 获取统计信息

```http
GET /api/stats
```

## 🔧 本地开发

```bash
# 启动本地开发服务器
npm run dev

# 初始化本地数据库
npm run db:init:local
```

访问 http://localhost:8787 进行测试。

## 💰 成本估算

| 资源 | 免费额度 | 说明 |
|------|----------|------|
| Workers 请求 | 10万/天 | 远超个人使用 |
| D1 读取 | 500万/天 | 足够使用 |
| D1 写入 | 10万/天 | 足够使用 |
| D1 存储 | 5GB | 足够使用 |
| Cron Triggers | 无限制 | 免费 |

**结论**：在合理使用场景下，**完全免费**！

## 📝 License

MIT
