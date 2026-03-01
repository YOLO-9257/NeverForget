-- 为邮箱账户增加 AI 过滤阈值配置
-- Date: 2026-02-26
--
-- ai_filter_config 示例：
-- {"ads_keep_importance_threshold": 0.75}

ALTER TABLE email_accounts ADD COLUMN ai_filter_config TEXT;

