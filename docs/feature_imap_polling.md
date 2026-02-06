# 功能设计规划书：主动式邮件拉取 (IMAP Polling)

**版本**: v1.0
**日期**: 2026-02-03
**作者**: NeverForget Team (AI Assistant)

## 1. 项目概述 (Overview)

### 1.1 背景
当前 NeverForget 系统通过 **被动接收 (Cloudflare Email Workers)** 实现了邮件转发。然而，该方案依赖于用户在原邮箱设置“自动转发”规则。对于不支持自动转发的邮箱（如部分企业邮箱、教育邮箱）或用户希望集中管理多个旧邮箱的场景，系统显得力不从心。

### 1.2 目标
实现 **主动式邮件拉取 (Active IMAP Polling)** 功能。让 NeverForget 能够作为一个轻量级的邮件客户端，定期主动连接用户配置的外部 IMAP 服务器，检查新邮件并推送通知。

### 1.3 核心价值
*   **零侵入性**：无需在原邮箱进行任何设置。
*   **全平台支持**：支持所有标准 IMAP 协议的邮箱（Gmail, Linux.do, Outlook, 企业邮等）。
*   **集中管理**：在一个地方监控所有重要邮箱的动态。

---

## 2. 技术架构 (Architecture)

### 2.1 核心组件

1.  **调度器 (Scheduler)**: 利用 Cloudflare Workers 的 **Cron Triggers**，每 5-10 分钟触发一次全局扫描任务。
2.  **IMAP 客户端引擎 (Worker IMAP Client)**: 一个运行在 Edge Worker 上的轻量级 IMAP 协议实现，基于 `cloudflare:sockets` 或标准 TCP Socket API。
3.  **安全存储 (Secure Vault)**: 使用 D1 Database 存储配置，配合 **AES-GCM** 算法加密存储敏感凭据（密码）。
4.  **状态机 (State Manager)**: 记录每个用户的 `last_uid` 或 `last_check_time`，确保不漏抓、不重抓。

### 2.2 工作流程

```mermaid
graph TD
    Cron[⏰ Cron Trigger] -->|每10分钟| Handler[Scheduled Handler]
    Handler -->|1. 获取活跃用户| DB[(D1 Database)]
    Handler -->|2. 对每个用户| Task[执行拉取任务]
    
    Task -->|解密密码| Crypto[AES-GCM 解密]
    Task -->|3. TCP/TLS 连接| IMAP[外部 IMAP 服务器]
    
    IMAP -->|4. 认证 & 选择收件箱| Check{有新邮件?}
    
    Check -->|Yes| Fetch[获取摘要 (Subject/From)]
    Check -->|No| Disconnect[断开连接]
    
    Fetch -->|5. 推送通知| WxPush[微信推送]
    Fetch -->|6. 更新同步状态| DB
```

---

## 3. 详细实施方案 (Implementation Plan)

### 第一阶段：基础设施 (Infrastructure) ✅ 已完成
*   **数据库设计**:
    *   `user_email_settings` 表新增 IMAP 字段 (`host`, `port`, `user`, `password`, `tls`)。
    *   状态字段：`last_sync_at`, `sync_error`.
*   **安全层**:
    *   实现 `src/utils/crypto.ts`，提供 `encryptPassword` 和 `decryptPassword` 方法。
*   **前端 UI**:
    *   `EmailSettingsTab.tsx` 新增 IMAP 配置表单。
*   **后端 API**:
    *   `/api/settings` 支持保存和读取 IMAP 配置（密码脱敏）。

### 第二阶段：核心引擎 (Core Engine) ✅ 已完成
*   **IMAP 协议适配**:
    *   由于 Node.js 的 `net` 和 `tls` 模块在 Workers 中不可用，需实现一个 **Minimal IMAP Client**。
    *   仅实现核心指令：`LOGIN`, `SELECT`, `SEARCH UNSEEN`, `FETCH`, `LOGOUT`。
    *   利用 `connect()` API 建立 TLS 连接。
*   **邮件解析**:
    *   解析 MIME 结构，提取 `Subject`, `From` 和纯文本 `Body` 摘要。
    *   处理字符集编码 (UTF-8, GBK, Base64, Quoted-Printable)。

### 第三阶段：调度与逻辑 (Scheduling & Logic) ✅ 已完成
*   **Cron Handler (`src/handlers/scheduled.ts`)**:
    *   实现批量处理逻辑：一次 Cron 执行循环处理所有启用了 IMAP 的用户。
    *   **超时控制**：Worker 有执行时间限制（通常 30s CPU time），如果用户过多，需引入分片处理或队列机制（本次 v1.0 暂定顺序处理，限制单次拉取邮件数）。
*   **去重策略**:
    *   策略 A（简单）：只拉取 `UNSEEN`（未读）邮件，拉取后保持未读（`BODY.PEEK`）并本地记录 `last_checked_uid`。
    *   策略 B（推荐）：拉取 `UNSEEN`，推送成功后，不改变邮件状态（保持未读），但在数据库记录 `max_uid`，下次只 `SEARCH UID (max_uid+1):*`。

---

## 4. 关键技术难点与对策

### 4.1 Worker 环境下的 TCP 连接
*   **挑战**: 标准 NPM 包（如 `imap`, `node-imap`）无法运行。
*   **对策**: 使用 `cloudflare:sockets` 手写极简 IMAP 类，或者寻找支持 Edge 环境的库（如 `emailjs-imap-client` 的修改版）。由于只需极少功能，**手写一个 200 行以内的 IMAP 工具类** 是最可控的方案。

### 4.2 执行时间限制
*   **挑战**: IMAP 连接建立和交互耗时较长。
*   **对策**:
    1.  **并发限制**: 限制每次只拉取最新的 3-5 封未读邮件。
    2.  **快速失败**: 连接超时设为 5秒。
    3.  **频率控制**: Cron 频率设为 5 或 10 分钟，而非每分钟。

---

## 5. 开发任务清单

| ID | 任务项 | 说明 | 状态 |
| :--- | :--- | :--- | :--- |
| **5.1** | 数据库变更 | 添加 IMAP 相关字段 | ✅ 完成 |
| **5.2** | 加密工具 | AES-GCM 密码加密实现 | ✅ 完成 |
| **5.3** | **IMAP 核心库** | `src/services/ImapClient.ts` 实现连接与指令交互 | ✅ 完成 |
| **5.4** | 后端 API | 支持保存 IMAP 配置 | ✅ 完成 |
| **5.5** | 前端界面 | IMAP 配置面板 | ✅ 完成 |
| **5.6** | 解析器 | MIME 解析与编码处理 | ✅ 完成 |
| **5.7** | 调度器 | `scheduled` 事件处理逻辑与状态更新 | ✅ 完成 |
| **5.8** | 测试 | 针对 Linux.do 等常见邮箱的实测 | ⏳ 待开始 |

---

## 6. 用户使用流程

1.  用户进入「设置」->「邮件配置」。
2.  开启「主动拉取邮件」。
3.  输入 IMAP 服务器信息（如 `mail.linux.do`）、账号和密码。
4.  点击「保存」。
5.  系统后台每 10 分钟自动检查一次。
6.  一旦有新邮件，微信通过 WxPush 收到通知：
    > 📧 **新邮件 (IMAP)**
    > **来源**: Linux.do
    > **发件人**: admin@something.com
    > **主题**: 您的账号登录提醒

