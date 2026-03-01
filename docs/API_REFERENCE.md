# NeverForget API 参考

本文档对应当前 `src/index.ts` 路由实现。

## 基本约定

- Base URL：你的 Workers 地址，例如 `https://xxx.workers.dev`
- 响应结构：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

- 鉴权 Header：

```http
Authorization: Bearer <jwt-or-legacy-api-key>
```

## 免鉴权接口

### 健康检查
- `GET /`
- `GET /health`

### 公共页面/推送
- `GET /detail`：内置详情页
- `ANY /wxpush`：兼容 go-wxpush 的公共推送入口

### 提醒确认回调
- `POST /api/reminders/:id/ack`

### 认证
- `POST /api/auth/login`
- `POST /api/auth/setup`
- `GET /api/auth/init-status`

## 鉴权后接口

### 1. 提醒任务

- `GET /api/reminders`
  - 查询参数：`status`、`type`、`keyword`、`sort_by`、`sort_order`、`limit`、`offset`
- `POST /api/reminders`
- `GET /api/reminders/:id`
- `PUT /api/reminders/:id`
- `DELETE /api/reminders/:id`
- `POST /api/reminders/:id/trigger`：手动触发
- `GET /api/reminders/:id/logs`：任务执行日志

### 2. 统计与全局日志

- `GET /api/stats`
- `GET /api/logs`
  - 查询参数：`status`、`type`、`limit`、`offset`

### 3. 通用配置库

- `GET /api/configs?category=...`
- `POST /api/configs`
- `DELETE /api/configs/:id`

### 4. AI 管家

- `POST /api/ai/chat`
- `GET /api/ai/chat`

### 5. 邮件转发设置（旧入口）

- `GET /api/email-settings`
- `PUT /api/email-settings`
- `GET /api/email-settings/logs`
- `POST /api/email-settings/test`

### 6. 邮箱账户与邮件内容

#### 邮箱账户
- `GET /api/email/accounts`
- `POST /api/email/accounts`
- `GET /api/email/accounts/:id`
- `PUT /api/email/accounts/:id`
- `DELETE /api/email/accounts/:id`
- `POST /api/email/accounts/:id/sync`：立即同步
- `POST /api/email/test`：测试 IMAP 连接

#### 邮件内容
- `GET /api/email/accounts/:accountId/messages`
- `GET /api/email/messages/:messageId`
- `POST /api/email/messages/:messageId/push`
- `PUT /api/email/messages/:messageId/content`

#### 邮件趋势
- `GET /api/stats/email-trend`

### 7. 邮件安全与规则

#### 黑名单
- `GET /api/email/blacklist`
- `POST /api/email/blacklist`
- `DELETE /api/email/blacklist/:id`

#### 过滤规则
- `GET /api/email/rules`
- `POST /api/email/rules`
- `DELETE /api/email/rules/:id`

#### AI 解析
- `POST /api/email/ai/parse`

### 8. 邮件分类与 AI 摘要

#### 分类
- `GET /api/email/categories`
- `POST /api/email/categories`
- `PUT /api/email/categories/:id`
- `DELETE /api/email/categories/:id`
- `POST /api/email/categories/batch-classify`
- `GET /api/email/categories/stats`

#### 摘要与提取
- `POST /api/email/messages/summary`
- `POST /api/email/messages/summary/batch`
- `POST /api/email/messages/reminder`：从邮件创建提醒
- `GET /api/email/ai/queue-status`
- `POST /api/email/ai/retry-failed`

### 9. 多渠道通知

#### 通知渠道
- `GET /api/notification/channels`
- `POST /api/notification/channels`
- `PUT /api/notification/channels/:id`
- `DELETE /api/notification/channels/:id`
- `POST /api/notification/channels/:id/test`
- `POST /api/notification/channels/:id/send-test`
- `GET /api/notification/channels/:id/health`

#### 推送追踪
- `GET /api/push/tracking`
  - 查询参数：`status`、`channel_id`、`message_type`、`keyword`、`limit`、`offset`
- `POST /api/push/tracking/:id/retry`

### 10. 同步监控

- `GET /api/email/sync/dashboard`
- `GET /api/email/sync/logs`
- `GET /api/email/sync/statistics`

### 11. 工作流规则

- `GET /api/workflow/rules`
- `POST /api/workflow/rules`
- `PUT /api/workflow/rules/:id`
- `DELETE /api/workflow/rules/:id`
- `POST /api/workflow/rules/:id/test`
- `GET /api/workflow/rules/:id/executions`

## 典型认证流程

1. `GET /api/auth/init-status`
2. 未初始化：`POST /api/auth/setup`
3. `POST /api/auth/login` 获取 `token`
4. 后续请求携带 `Authorization: Bearer <token>`

## 备注

- `API_KEYS` 仍可作为兼容鉴权方式。
- `/api/reminders/:id/ack` 设计为外链点击回调，因此无需鉴权。
- 任务调度与日志写入由 Workers `scheduled` 事件自动触发。

