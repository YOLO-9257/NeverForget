/**
 * 邮件转发服务配置面板
 * @author zhangws
 *
 * 提供邮件监听与 WxPush 转发的配置界面
 */

import { useEmailForwarding } from './hooks/useEmailForwarding';
import {
    EmailAddressSection,
    PushConfigSection,
    AdvancedConfigSection,
    ForwardingStats,
} from './components';
import styles from './EmailForwardingPanel.module.css';

export function EmailForwardingPanel() {
    const {
        loading,
        saving,
        testing,
        status,
        statusMessage,
        settings,
        setSettings,
        wxpushToken,
        setWxpushToken,
        wxpushUrl,
        setWxpushUrl,
        forwardRules,
        setForwardRules,
        pushConfig,
        setPushConfig,
        templateName,
        setTemplateName,
        useDefaultConfig,
        setUseDefaultConfig,
        savedPushConfigs,
        matchedConfigId,
        applyPushConfig,
        logs,
        logsTotal,
        showLogs,
        setShowLogs,
        handleSave,
        handleTest,
    } = useEmailForwarding();

    if (loading) {
        return (
            <div className={styles.card}>
                <div className={styles.loading}>
                    <span className={styles.spinner} />
                    <p>加载中...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.panel}>
            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <div>
                        <h3 className={styles.cardTitle}>📧 邮件转发配置</h3>
                        <p className={styles.cardSubtitle}>
                            配置邮件监听与 WxPush 转发，将发送到您专属邮箱的邮件自动推送到微信
                        </p>
                    </div>
                </div>

                <EmailAddressSection
                    emailAddress={settings.email_address}
                    enabled={settings.enabled}
                    onEnabledChange={(enabled) => setSettings((prev) => ({ ...prev, enabled }))}
                />

                <PushConfigSection
                    useDefaultConfig={useDefaultConfig}
                    pushConfig={pushConfig}
                    wxpushToken={wxpushToken}
                    templateName={templateName}
                    savedPushConfigs={savedPushConfigs}
                    matchedConfigId={matchedConfigId}
                    onUseDefaultChange={setUseDefaultConfig}
                    onPushConfigChange={setPushConfig}
                    onWxpushTokenChange={setWxpushToken}
                    onTemplateNameChange={setTemplateName}
                    onApplyConfig={applyPushConfig}
                    existingWxpushToken={settings.wxpush_token}
                />

                <AdvancedConfigSection
                    wxpushUrl={wxpushUrl}
                    forwardRules={forwardRules}
                    onWxpushUrlChange={setWxpushUrl}
                    onForwardRulesChange={setForwardRules}
                />

                {/* 状态提示 */}
                {status !== 'idle' && (
                    <div className={`${styles.alert} ${status === 'success' ? styles.alertSuccess : styles.alertError}`}>
                        {status === 'success' ? '✅ ' : '❌ '}
                        {statusMessage}
                    </div>
                )}

                {/* 操作按钮 */}
                <div className={styles.actions}>
                    <button
                        className={styles.btnSecondary}
                        onClick={handleTest}
                        disabled={testing || (useDefaultConfig ? !settings.wxpush_token && !wxpushToken : !pushConfig.userid)}
                    >
                        {testing ? (
                            <>
                                <span className={styles.spinnerSm} />
                                测试中...
                            </>
                        ) : (
                            '🔔 发送测试推送'
                        )}
                    </button>
                    <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
                        {saving ? (
                            <>
                                <span className={styles.spinnerSm} />
                                保存中...
                            </>
                        ) : (
                            '💾 保存配置'
                        )}
                    </button>
                </div>
            </div>

            <ForwardingStats
                totalForwarded={settings.total_forwarded}
                lastForwardedAt={settings.last_forwarded_at}
                logs={logs}
                logsTotal={logsTotal}
                showLogs={showLogs}
                onShowLogsChange={setShowLogs}
            />
        </div>
    );
}

export default EmailForwardingPanel;
