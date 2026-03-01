# 智能邮件处理与自动推送 - 详细实施计划书

> **文档版本**: 1.0.0  
> **创建日期**: 2026-02-07  
> **状态**: 待审批

---

## 📋 目录

1. [项目概述](#1-项目概述)
2. [需求分析](#2-需求分析)
3. [技术设计](#3-技术设计)
4. [文件清单](#4-文件清单)
5. [详细任务分解](#5-详细任务分解)
6. [数据库变更](#6-数据库变更)
7. [推送消息模板](#7-推送消息模板)
8. [风险评估](#8-风险评估)
9. [工作量估算](#9-工作量估算)

---

## 1. 项目概述

### 1.1 背景

当前 NeverForget 系统已具备邮件获取和推送能力，但存在以下问题：

1. **邮件内容格式混乱**: HTML 邮件未转为纯文本，推送内容可读性差
2. **标题不够智能**: 直接使用邮件原标题，可能过长或不够醒目
3. **缺少内容摘要**: 用户需要打开详情才能了解邮件大意
4. **推送格式单一**: 固定模板，缺少结构化信息展示

### 1.2 目标

实现"**定时获取邮件 → AI 智能分析 → 自动生成标题和摘要 → 格式化推送**"的完整自动化流程。

### 1.3 核心能力

| 能力 | 描述 |
|------|------|
| **HTML → 纯文本** | 将任意格式邮件（HTML/RTF/纯文本）统一转为可读的纯文本 |
| **乱码修复** | 自动检测并修复常见编码问题（GB2312/GBK/ISO-8859-1） |
| **AI 标题生成** | 基于邮件内容生成简洁、有吸引力的中文标题（15字以内） |
| **AI 内容摘要** | 生成 50-100 字的内容摘要，让用户快速了解邮件大意 |
| **关键信息提取** | 自动识别时间、地点、人物、截止日期、待办事项等 |
| **紧急程度判断** | AI 判断邮件紧急程度（紧急/普通/低优先级） |
| **格式化推送** | 将上述信息组装成结构化的推送消息 |

---

## 2. 需求分析

### 2.1 用户故事

> 作为一个用户，我希望系统能够：
> 1. 定时自动检查我的邮箱
> 2. 将新邮件的内容（无论是 HTML 还是纯文本）清理成易读的格式
> 3. 用 AI 帮我生成一个简短的标题和摘要
> 4. 提取关键信息（如会议时间、截止日期）
> 5. 按照统一的格式推送到我的微信，让我一眼就能看懂

### 2.2 功能需求

#### FR-01: HTML 转纯文本
- 支持解析标准 HTML 邮件
- 移除 `<style>`, `<script>`, `<head>` 等无关标签
- 保留段落结构和列表格式
- 处理 HTML 实体（`&nbsp;`, `&amp;` 等）

#### FR-02: 编码检测与修复
- 自动检测 UTF-8, GB2312, GBK, ISO-8859-1 等编码
- 修复常见的乱码问题（如 `å??` → 正确中文）

#### FR-03: AI 智能处理
- **标题生成**: 15 字以内，简洁明了，体现邮件核心
- **内容摘要**: 50-100 字，概括邮件主要内容
- **实体提取**: 时间、地点、人物、截止日期、待办事项
- **紧急程度**: urgent / normal / low

#### FR-04: 推送消息格式化
- 支持 Markdown 格式（微信模板消息兼容）
- 包含：AI 标题、紧急标签、摘要、关键信息、原文预览
- 总长度控制在 1500 字符以内（微信限制）

#### FR-05: 配置项
- 每个邮箱账户可独立开启/关闭 AI 处理
- 可选择推送模板风格

### 2.3 非功能需求

| 类型 | 要求 |
|------|------|
| **性能** | 单封邮件 AI 处理时间 < 5 秒 |
| **可靠性** | AI 失败时回退到原始内容推送 |
| **成本** | 尽量减少 AI API 调用次数，复用已有摘要 |

---

## 3. 技术设计

### 3.1 系统架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Cron Trigger (每分钟)                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      syncEmailAccount(accountId)                     │
│                        (imapPoller.ts 已有)                          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         fetchNewEmails()                             │
│                       返回 EmailSummary[]                            │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │       对每封邮件执行           │
                    ▼                               ▼
┌──────────────────────────┐       ┌──────────────────────────────────┐
│  1. htmlToText()         │       │  (如果是纯文本邮件则跳过)         │
│  - 检测是否为 HTML       │       └──────────────────────────────────┘
│  - 转换为纯文本          │
│  - 修复编码问题          │
└──────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     2. processEmailWithAI()  [新模块]                 │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  输入: { from, subject, content (已清理) }                      │  │
│  │                                                                 │  │
│  │  调用 LLM 一次性完成:                                           │  │
│  │  - 生成标题 (15字以内)                                          │  │
│  │  - 生成摘要 (50-100字)                                          │  │
│  │  - 提取实体 (时间/地点/人物/截止日期)                           │  │
│  │  - 提取待办事项                                                 │  │
│  │  - 判断紧急程度                                                 │  │
│  │                                                                 │  │
│  │  输出: SmartEmailResult                                         │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     3. formatPushMessage()  [新函数]                  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  输入: SmartEmailResult + 原始邮件信息                          │  │
│  │                                                                 │  │
│  │  按模板组装推送消息:                                            │  │
│  │  - 标题: [紧急程度标签] + AI生成标题                            │  │
│  │  - 正文: 摘要 + 关键信息 + 原文预览                             │  │
│  │                                                                 │  │
│  │  输出: { title: string, content: string }                       │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                           4. sendPush()                               │
│                          (pusher.ts 已有)                             │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 核心数据结构

```typescript
/**
 * AI 智能处理结果
 */
interface SmartEmailResult {
    /** AI 生成的标题 (15字以内) */
    generatedTitle: string;
    
    /** AI 生成的摘要 (50-100字) */
    summary: string;
    
    /** 提取的实体 */
    entities: {
        /** 时间相关 (会议时间、截止日期等) */
        times: string[];
        /** 地点 */
        locations: string[];
        /** 人物 */
        people: string[];
        /** 明确的截止日期 */
        deadline: string | null;
    };
    
    /** 待办事项列表 */
    actionItems: string[];
    
    /** 紧急程度: urgent | normal | low */
    urgency: 'urgent' | 'normal' | 'low';
    
    /** 处理是否成功 */
    success: boolean;
    
    /** 处理耗时 (ms) */
    processingTime: number;
}

/**
 * 格式化后的推送消息
 */
interface FormattedPushMessage {
    /** 推送标题 */
    title: string;
    
    /** 推送正文 (Markdown) */
    content: string;
}
```

### 3.3 AI Prompt 设计

```
你是一个邮件智能处理助手。请分析以下邮件，并以 JSON 格式返回分析结果。

【分析要求】
1. 生成标题 (generatedTitle): 15字以内，简洁明了，体现邮件核心意图
2. 生成摘要 (summary): 50-100字，概括邮件主要内容，让读者快速了解
3. 提取时间 (times): 邮件中提到的所有时间点（如"下周一下午3点"）
4. 提取地点 (locations): 邮件中提到的地点（如"3号会议室"）
5. 提取人物 (people): 除发件人外提到的相关人员
6. 截止日期 (deadline): 如有明确的截止日期，提取为 YYYY-MM-DD 格式
7. 待办事项 (actionItems): 邮件中要求收件人完成的任务列表
8. 紧急程度 (urgency): 根据内容判断 - urgent(紧急)/normal(普通)/low(低优先级)

【返回格式】
{
  "generatedTitle": "标题内容",
  "summary": "摘要内容",
  "entities": {
    "times": ["时间1", "时间2"],
    "locations": ["地点1"],
    "people": ["人物1"],
    "deadline": "2026-02-10"
  },
  "actionItems": ["待办1", "待办2"],
  "urgency": "normal"
}

【邮件信息】
发件人: {from}
原标题: {subject}
正文:
{content}
```

---

## 4. 文件清单

### 4.1 新增文件

| 文件路径 | 描述 | 预估代码行数 |
|----------|------|-------------|
| `src/utils/htmlToText.ts` | HTML 转纯文本工具模块 | ~150 行 |
| `src/services/emailAiProcessor.ts` | AI 智能邮件处理服务 | ~250 行 |
| `migrations/0021_smart_email_fields.sql` | 数据库字段扩展 | ~30 行 |

### 4.2 修改文件

| 文件路径 | 修改内容 | 影响范围 |
|----------|----------|----------|
| `src/services/emailService.ts` | 集成 AI 处理模块，修改 `forwardEmailToPush()` | 中 |
| `src/services/imapPoller.ts` | 在保存邮件前调用 `htmlToText()` | 小 |
| `src/types/index.ts` | 新增 `SmartEmailResult` 等类型定义 | 小 |

---

## 5. 详细任务分解

### Task 1: 创建 HTML 转纯文本工具模块

**文件**: `src/utils/htmlToText.ts`

**功能点**:
- [ ] `isHtmlContent(content: string): boolean` - 检测内容是否为 HTML
- [ ] `htmlToPlainText(html: string): string` - HTML 转纯文本
- [ ] `fixEncoding(content: string): string` - 修复编码问题
- [ ] `cleanEmailContent(content: string): string` - 统一入口函数

**核心逻辑**:
```typescript
// 1. 检测是否为 HTML
function isHtmlContent(content: string): boolean {
    return /<\/?[a-z][\s\S]*>/i.test(content);
}

// 2. HTML 转纯文本 (使用正则，无需外部依赖)
function htmlToPlainText(html: string): string {
    let text = html;
    // 移除 <head>, <style>, <script>
    text = text.replace(/<(head|style|script)[^>]*>[\s\S]*?<\/\1>/gi, '');
    // 处理换行标签
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<\/div>/gi, '\n');
    text = text.replace(/<\/li>/gi, '\n');
    // 移除所有 HTML 标签
    text = text.replace(/<[^>]+>/g, '');
    // 解码 HTML 实体
    text = decodeHtmlEntities(text);
    // 清理多余空白
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    return text;
}
```

**预计工时**: 1-2 小时

---

### Task 2: 创建 AI 智能邮件处理服务

**文件**: `src/services/emailAiProcessor.ts`

**功能点**:
- [ ] `processEmailWithAI(email, env, aiConfig): Promise<SmartEmailResult>` - AI 处理主函数
- [ ] `formatPushMessage(result, email): FormattedPushMessage` - 格式化推送消息
- [ ] `getUrgencyEmoji(urgency): string` - 紧急程度转 Emoji

**核心逻辑**:
```typescript
export async function processEmailWithAI(
    email: { from: string; subject: string; content: string },
    env: Env,
    aiConfig?: AiConfig
): Promise<SmartEmailResult> {
    const startTime = Date.now();
    
    try {
        const prompt = buildPrompt(email);
        const response = await callLlmInWorker([
            { role: 'user', content: prompt }
        ], { ... }, env);
        
        const result = parseAiResponse(response.text);
        return {
            ...result,
            success: true,
            processingTime: Date.now() - startTime
        };
    } catch (error) {
        // 失败时返回降级结果
        return {
            generatedTitle: email.subject.substring(0, 15),
            summary: email.content.substring(0, 100),
            entities: { times: [], locations: [], people: [], deadline: null },
            actionItems: [],
            urgency: 'normal',
            success: false,
            processingTime: Date.now() - startTime
        };
    }
}
```

**预计工时**: 2-3 小时

---

### Task 3: 修改邮件服务集成 AI 处理

**文件**: `src/services/emailService.ts`

**修改点**:
- [ ] 修改 `forwardEmailToPush()` 函数，在推送前调用 AI 处理
- [ ] 根据账户配置决定是否启用 AI 处理
- [ ] 使用新的推送消息格式

**修改逻辑**:
```typescript
// 在 forwardEmailToPush 中增加
export async function forwardEmailToPush(
    env: Env,
    settings: EmailSettings,
    email: EmailData,
    aiConfig?: AiConfig
): Promise<{ success: boolean; response?: string; error?: string }> {
    
    // 1. 清理邮件内容 (HTML → 纯文本)
    const cleanedContent = cleanEmailContent(email.content);
    
    // 2. AI 智能处理 (如果账户开启)
    let pushTitle = `📧 ${email.subject}`;
    let pushContent = buildDefaultContent(email, cleanedContent);
    
    if (settings.enable_ai_summary) {
        const aiResult = await processEmailWithAI(
            { from: email.from, subject: email.subject, content: cleanedContent },
            env,
            aiConfig
        );
        
        if (aiResult.success) {
            const formatted = formatPushMessage(aiResult, email, cleanedContent);
            pushTitle = formatted.title;
            pushContent = formatted.content;
        }
    }
    
    // 3. 发送推送
    return sendPush(pushServiceUrl, config, pushTitle, pushContent);
}
```

**预计工时**: 1-2 小时

---

### Task 4: 修改 IMAP 轮询服务

**文件**: `src/services/imapPoller.ts`

**修改点**:
- [ ] 在保存邮件到数据库前，调用 `cleanEmailContent()` 清理内容
- [ ] 将清理后的内容保存到 `fetched_emails.content` 字段

**修改位置**: `syncEmailAccount()` 函数，约第 420 行

**预计工时**: 0.5 小时

---

### Task 5: 数据库迁移

**文件**: `migrations/0021_smart_email_fields.sql`

**内容**:
```sql
-- 为 email_accounts 表添加 AI 处理开关
ALTER TABLE email_accounts ADD COLUMN enable_ai_summary INTEGER DEFAULT 1;

-- 为 fetched_emails 表添加 AI 处理结果缓存
ALTER TABLE fetched_emails ADD COLUMN ai_generated_title TEXT;
ALTER TABLE fetched_emails ADD COLUMN ai_urgency TEXT DEFAULT 'normal';

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_fetched_emails_ai_urgency ON fetched_emails(ai_urgency);
```

**预计工时**: 0.5 小时

---

### Task 6: 类型定义扩展

**文件**: `src/types/index.ts`

**新增内容**:
- [ ] `SmartEmailResult` 接口
- [ ] `FormattedPushMessage` 接口
- [ ] 扩展 `EmailAccount` 接口增加 `enable_ai_summary` 字段

**预计工时**: 0.5 小时

---

## 6. 数据库变更

### 6.1 email_accounts 表变更

| 字段名 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `enable_ai_summary` | INTEGER | 1 | 是否启用 AI 智能处理 (1=启用, 0=禁用) |

### 6.2 fetched_emails 表变更

| 字段名 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `ai_generated_title` | TEXT | NULL | AI 生成的标题 |
| `ai_urgency` | TEXT | 'normal' | AI 判断的紧急程度 |

> **注**: `ai_summary`, `ai_entities`, `ai_action_items` 等字段已在 `migrations/0020_complete_feature_set.sql` 中定义，无需重复添加。

---

## 7. 推送消息模板

### 7.1 标准模板 (Markdown)

```markdown
📧 **[🔴紧急] 关于项目进度汇报的会议邀请**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 **AI 摘要**
本邮件邀请您参加下周一的项目进度汇报会，需要准备本周工作总结和下周计划。会议将在3号会议室线下进行。

📌 **关键信息**
• ⏰ 时间: 2月10日 周一 下午3点
• 📍 地点: 3号会议室
• 👤 相关人员: 产品组全员
• 📅 截止: 2月10日前

✅ **待办事项**
• 准备本周工作总结
• 更新任务看板状态

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 **原文预览**
发件人: 李经理 <manager@company.com>
---
各位同事好，

请大家参加下周一（2月10日）下午3点在3号会议室举行的项目进度汇报会...

(原文预览约 300 字)
```

### 7.2 紧急程度标签

| 程度 | 标签 | 颜色 |
|------|------|------|
| urgent | 🔴 紧急 | 红色 |
| normal | (无标签) | - |
| low | 🔵 低优 | 蓝色 |

### 7.3 字符限制

| 项目 | 限制 |
|------|------|
| 标题 | 最多 64 字符 |
| 正文总长度 | 最多 1500 字符 (微信模板消息限制) |
| 原文预览 | 最多 300 字符 |

---

## 8. 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| AI API 调用失败 | 中 | 中 | 实现降级逻辑，使用原始内容推送 |
| AI 响应格式解析失败 | 中 | 低 | 使用 try-catch + 正则兜底 |
| HTML 解析不完整 | 低 | 中 | 多测试不同邮件客户端格式 |
| 推送内容超长被截断 | 低 | 低 | 严格控制字符长度 |
| AI 成本增加 | 中 | 中 | 缓存 AI 结果，避免重复处理 |

---

## 9. 工作量估算

| 任务 | 预估工时 | 优先级 |
|------|----------|--------|
| Task 1: htmlToText.ts | 1-2 小时 | P0 |
| Task 2: emailAiProcessor.ts | 2-3 小时 | P0 |
| Task 3: 修改 emailService.ts | 1-2 小时 | P0 |
| Task 4: 修改 imapPoller.ts | 0.5 小时 | P0 |
| Task 5: 数据库迁移 | 0.5 小时 | P0 |
| Task 6: 类型定义 | 0.5 小时 | P0 |
| **后端总计** | **6-8 小时** | - |
| (可选) 前端配置界面 | 2-3 小时 | P1 |

---

## 10. 执行确认

请确认以下事项后，我将开始执行：

- [ ] 同意整体技术方案
- [ ] 同意数据库变更
- [ ] 同意推送消息模板格式
- [ ] 确认执行顺序
- [ ] (可选) 是否先执行部分任务？

---

**确认后，请回复 "开始执行" 或指定需要优先执行的任务编号。**
