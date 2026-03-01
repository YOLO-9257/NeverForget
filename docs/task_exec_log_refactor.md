# 执行日志三层架构重构 - 任务追踪

> **方案文档**: `docs/execution_log_refactor_plan.md`
> **启动日期**: 2026-02-13

---

## 阶段 1：新增写入层（双写，不破坏现网）

### ✅ 全部完成

| # | 任务 | 文件 | 状态 |
|:--|:-----|:-----|:-----|
| 1 | 创建三层表结构迁移文件 | `migrations/0024_exec_log_refactor.sql` | ✅ 完成 |
| 2 | 创建三层写入核心模块 | `src/services/execLogger.ts` | ✅ 完成 |
| 3 | 创建日志清理服务 | `src/services/logCleaner.ts` | ✅ 完成 |
| 4 | scheduler.ts 6 处追加双写 | `src/services/scheduler.ts` | ✅ 完成 |
| 5 | 后端类型定义新增 | `src/types/index.ts` | ✅ 完成 |
| 6 | 前端类型定义新增 | `admin/src/types/index.ts` | ✅ 完成 |
| 7 | 前端 Logs 页面展示 detail_reason | `admin/src/pages/Logs.tsx` | ✅ 完成 |
| 8 | TypeScript 编译验证 | - | ✅ 通过 |

---

## 阶段 2：改造查询层（读新表）

### ✅ 全部完成

| # | 任务 | 文件 | 状态 |
|:--|:-----|:-----|:-----|
| 9 | getStats() 改读 snapshot + rollup（含 fallback） | `src/index.ts` | ✅ 完成 |
| 10 | getEmailTrend() 改读 rollup（含 fallback） | `src/handlers/statsHandler.ts` | ✅ 完成 |
| 11 | getAllLogs() 改读 task_exec_detail（含 fallback） | `src/index.ts` | ✅ 完成 |
| 12 | TypeScript 编译二次验证 | - | ✅ 通过 |

---

## 阶段 3：下线旧逻辑（双写稳定 ≥ 2 周后）

### ⬜ 待执行（非本次范围）

| # | 任务 | 状态 |
|:--|:-----|:-----|
| 13 | 移除 trigger_logs INSERT（6 处） | ⬜ 待定 |
| 14 | 移除旧 trigger_logs 查询（fallback 分支） | ⬜ 待定 |
| 15 | 旧表归档 RENAME | ⬜ 待定 |

---

## 部署前检查清单

- [x] 0024 迁移 SQL 语法正确
- [x] execLogger.ts 编译无错误
- [x] logCleaner.ts 编译无错误
- [x] scheduler.ts 双写代码编译通过
- [x] getStats() fallback 逻辑正确
- [x] getEmailTrend() fallback 逻辑正确
- [x] getAllLogs() fallback 逻辑正确
- [x] 本地执行 `npm run db:migrate:exec-log:all:local` 成功（2026-02-14）
- [x] 远程执行 `npm run db:migrate:exec-log:all` 成功（2026-02-14）
- [x] 部署后 snapshot/rollup/detail 表有数据写入（2026-02-14：8 / 14 / 11）
- [ ] 前端日志页 detail_reason 标签正常显示

---

## 验收条件

- [ ] 双写运行 ≥ 2 周
- [ ] 新旧统计数据偏差 < 1%
- [ ] detail 行数约为同期 trigger_logs 的 5%~15%
- [ ] 统计页/日志页响应 < 200ms
