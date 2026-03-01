/**
 * 高级配置组件
 * @author zhangws
 */

import React from 'react';
import styles from './AdvancedConfigSection.module.css';

interface AdvancedConfigSectionProps {
    wxpushUrl: string;
    forwardRules: string;
    onWxpushUrlChange: (url: string) => void;
    onForwardRulesChange: (rules: string) => void;
}

export const AdvancedConfigSection: React.FC<AdvancedConfigSectionProps> = ({
    wxpushUrl,
    forwardRules,
    onWxpushUrlChange,
    onForwardRulesChange,
}) => {
    return (
        <details className={styles.details}>
            <summary className={styles.summary}>⚙️ 高级配置（可选）</summary>

            <div className={styles.content}>
                <div className={styles.formGroup}>
                    <label className={styles.label}>自定义 WxPush 服务地址</label>
                    <input
                        type="url"
                        className={styles.input}
                        placeholder="https://wxpusher.zjiecode.com"
                        value={wxpushUrl}
                        onChange={(e) => onWxpushUrlChange(e.target.value)}
                    />
                    <div className={styles.hint}>留空使用默认官方地址，或输入自建 WxPusher 服务地址</div>
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.label}>转发规则配置 (JSON)</label>
                    <textarea
                        className={styles.textarea}
                        rows={10}
                        placeholder={`{
  "block_senders": ["spam@example.com"],
  "allow_senders": ["boss@company.com"],
  "block_keywords": ["广告", "退订"],
  "match_keywords": ["重要"]
}`}
                        value={forwardRules}
                        onChange={(e) => onForwardRulesChange(e.target.value)}
                    />
                    <div className={styles.hint}>配置 JSON 格式的转发规则，支持黑白名单和关键词过滤。</div>
                </div>
            </div>
        </details>
    );
};

export default AdvancedConfigSection;
