# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-03-01

### Added
- 新增邮箱账户维度 AI 配置解析与过滤能力，支持更细粒度的账户策略。
- 新增执行日志与 AI 动作日志能力（包含对应迁移与测试）。
- 管理后台新增通知中心页面，补充邮件中心相关模块样式与组件化实现。
- 新增 API 参考文档与执行日志重构相关文档。

### Changed
- 管理后台进行大规模 UI 重构：页面拆分为模块化目录结构，引入共享组件与 CSS Module。
- 重构邮箱转发/规则/黑名单与外部账户管理交互，统一鉴权与错误处理路径。
- 重构 AI 工具执行器结构，按领域拆分执行逻辑并补充类型定义。
- 后端同步调整邮箱、提醒、调度与统计链路，适配新的执行日志与 AI 处理流程。

### Fixed
- 修复执行快照回填相关迁移问题（`0025_fix_exec_snapshot_backfill.sql`）。
- 修复邮箱账户推送配置与 AI 配置在边界场景下的不一致问题。
- 修复部分登录态与接口调用场景下的前后端兼容问题。

## [1.1.0] - 2026-01-30

### Added
- 管理后台支持从 `go-wxpush` 自动加载详情页模板列表。
- 增加“强提醒”模式，支持自定义重试间隔。
- 增强任务管理功能，支持任务搜索和多状态筛选。

### Changed
- 重构推送逻辑，将详情页渲染职责完全移交给 `go-wxpush`。
- 更新 `template_name` 机制，替代原有的 `custom_html` Base64 方案。
- 优化管理后台 UI，提升响应式体验。
- 合并并清理数据库迁移文件，统一为全量初始化脚本。

### Fixed
- 修复编辑任务时 AppSecret 丢失的问题。
- 修复部分设备上详情页布局错乱的问题。

## [1.0.0] - 2026-01-17

### Added
- 初始版本发布。
- 支持基于 Cloudflare Workers 和 D1 的基本定时提醒功能。
- 支持微信消息推送（对接 go-wxpush）。
- REST API 接口。
- 基础管理后台。
