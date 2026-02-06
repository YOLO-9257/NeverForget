# 主动式邮件拉取 (IMAP Polling) 实现说明

**版本**: v1.0  
**日期**: 2026-02-03  
**作者**: zhangws

## 1. 功能概述

此次实现了 **主动式邮件拉取 (Active IMAP Polling)** 功能，使 NeverForget 能够定期主动连接用户配置的外部 IMAP 服务器，检查新邮件并推送通知。

### 核心价值

- **零侵入性**：无需在原邮箱进行任何设置
- **全平台支持**：支持所有标准 IMAP 协议的邮箱（Gmail, Linux.do, Outlook, 企业邮等）
- **集中管理**：在一个地方监控所有重要邮箱的动态

## 2. 新增文件

### 2.1 IMAP 客户端 (`src/services/ImapClient.ts`)

轻量级 IMAP 客户端，专为 Cloudflare Workers 环境设计。

**核心特性**：
- 使用 `cloudflare:sockets` API 建立 TCP/TLS 连接
- 支持核心 IMAP 命令：`LOGIN`, `SELECT`, `SEARCH`, `FETCH`, `LOGOUT`
- 内置 MIME 头部解码（Base64, Quoted-Printable）
- 支持多种字符集（UTF-8, GBK 等）

**主要导出**：
```typescript
// IMAP 客户端类
export class ImapClient {
    constructor(config: ImapConfig);
    async connect(): Promise<void>;
    async login(): Promise<void>;
    async selectInbox(): Promise<{ exists: number; recent: number }>;
    async searchUnseen(sinceUid?: number): Promise<number[]>;
    async fetchSummaries(uids: number[], maxCount?: number): Promise<EmailSummary[]>;
    async logout(): Promise<void>;
}

// 便捷函数：一站式拉取新邮件
export async function fetchNewEmails(
    config: ImapConfig,
    sinceUid?: number,
    maxCount?: number
): Promise<{ emails: EmailSummary[]; maxUid: number; error?: string }>;
```

### 2.2 IMAP 轮询服务 (`src/services/imapPoller.ts`)

负责定期检查配置了 IMAP 的用户邮箱，拉取新邮件并推送通知。

**核心特性**：
- 遍历所有启用 IMAP 的用户配置
- 自动解密 IMAP 密码
- 拉取未读邮件并通过 WxPush 推送
- 记录邮件转发日志
- 维护同步状态和最大 UID

**主要导出**：
```typescript
export async function runImapPolling(env: Env): Promise<PollResult[]>;
```

## 3. 修改的文件

### 3.1 调度服务 (`src/services/scheduler.ts`)

在 Cron 任务处理中集成了 IMAP 轮询逻辑：

- 每分钟检查提醒任务（原有逻辑）
- **每 10 分钟**检查分钟数是否能被 10 整除）触发 IMAP 邮件轮询
- 两个任务并行执行，互不干扰

```typescript
// 关键逻辑
if (currentMinute % 10 === 0) {
    console.log('[Scheduler] 触发 IMAP 邮件轮询...');
    tasks.push(runImapPollingTask(env));
}
```

## 4. 工作流程

```
Cron Trigger (每分钟)
    │
    ├─> 执行到期的提醒任务
    │
    └─> [每10分钟] IMAP 轮询
            │
            ├─> 查询所有启用 IMAP 的用户
            │
            └─> 对每个用户：
                    │
                    ├─> 解密 IMAP 密码
                    │
                    ├─> 连接 IMAP 服务器
                    │
                    ├─> 搜索未读邮件
                    │
                    ├─> 获取邮件摘要
                    │
                    ├─> 通过 WxPush 推送通知
                    │
                    └─> 更新同步状态和最大 UID
```

## 5. 数据存储

IMAP 相关配置存储在 `user_email_settings` 表中：

| 字段 | 说明 |
| --- | --- |
| `enable_imap` | 是否启用主动拉取 (0/1) |
| `imap_host` | IMAP 服务器地址 |
| `imap_port` | IMAP 端口 (默认 993) |
| `imap_user` | IMAP 用户名 |
| `imap_password` | IMAP 密码 (AES-GCM 加密) |
| `imap_tls` | 是否使用 TLS (1=Yes) |
| `last_sync_at` | 最后同步时间戳 |
| `sync_status` | 同步状态 (idle/syncing/error) |
| `sync_error` | 最后一次同步错误信息 |

**新邮件去重策略**：
- 通过 `forward_rules` 字段中的 `last_uid` 记录上次同步的最大 UID
- 下次只拉取大于 `last_uid` 的未读邮件

## 6. 使用说明

### 6.1 前端配置

1. 进入「设置」→「邮件配置」
2. 开启「主动拉取邮件」
3. 填写 IMAP 配置：
   - **服务器地址**：如 `imap.gmail.com`, `mail.linux.do`
   - **端口**：默认 993
   - **用户名**：邮箱账号
   - **密码**：邮箱密码或应用专用密码
   - **启用 TLS**：建议开启
4. 点击「保存」

### 6.2 常见 IMAP 配置

| 邮箱服务 | 服务器地址 | 端口 | TLS |
| --- | --- | --- | --- |
| Gmail | imap.gmail.com | 993 | ✓ |
| Outlook | outlook.office365.com | 993 | ✓ |
| QQ 邮箱 | imap.qq.com | 993 | ✓ |
| 163 邮箱 | imap.163.com | 993 | ✓ |
| Linux.do | mail.linux.do | 993 | ✓ |

> **注意**：部分邮箱（如 Gmail、QQ）需要使用「应用专用密码」而非账号密码。

## 7. 部署注意事项

1. **环境变量**：确保 `ENCRYPTION_KEY` 已设置，用于加密存储 IMAP 密码
2. **Cron 触发器**：`wrangler.toml` 中已配置每分钟触发
3. **执行时间**：Worker 有 30 秒 CPU 时间限制，每次最多处理 50 个用户，每个用户最多拉取 5 封邮件

## 8. 后续优化计划

- [ ] 添加专门的 `last_uid` 字段，替代 `forward_rules` 中的临时存储
- [ ] 支持自定义轮询频率
- [ ] 添加 IMAP 连接测试 API
- [ ] 支持更多 IMAP 命令（如标记已读）
- [ ] 优化大量用户场景下的分片处理
