# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
