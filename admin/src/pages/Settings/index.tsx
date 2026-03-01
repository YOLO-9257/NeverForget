/**
 * 系统设置页面
 * 管理 API 配置、推送服务设置、AI 配置等
 * @author zhangws
 */

import { ConfigManagerModal } from '../../components/ConfigManagerModal';
import { getAiProfiles, saveAiProfiles } from '../../utils/ai';
import { useSettings } from './hooks/useSettings';
import { ApiConfigTab, PushConfigTab, AiConfigTab, AboutTab } from './components';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/shared';
import type { SettingsTab } from './types';
import styles from './Settings.module.css';

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'api', label: 'API 配置', icon: '🔗' },
    { id: 'push', label: '推送设置', icon: '📱' },
    { id: 'ai', label: 'AI 模型池', icon: '🧠' },
    { id: 'about', label: '关于', icon: 'ℹ️' },
];

export function Settings() {
    const {
        activeTab,
        setActiveTab,
        apiUrl,
        setApiUrl,
        apiKey,
        setApiKey,
        testingConnection,
        connectionStatus,
        handleTestConnection,
        handleSaveApiConfig,
        defaultPushConfig,
        setDefaultPushConfig,
        handleSavePushConfig,
        handleSavePushConfigToCloud,
        notifications,
        setNotifications,
        handleSaveNotifications,
        aiProfiles,
        editingProfile,
        setEditingProfile,
        testingLlm,
        llmStatus,
        handleAddProfile,
        handleEditProfile,
        handleDeleteProfile,
        handleSaveProfile,
        handleCancelEdit,
        handleTestProfile,
        handleSaveProfileToCloud,
        manageModal,
        setManageModal,
        handleExportSettings,
        handleImportSettings,
        handleClearData,
    } = useSettings();

    // 处理配置库选择
    const handleConfigSelect = (value: string) => {
        try {
            const val = JSON.parse(value);
            if (manageModal.category === 'push_config') {
                setDefaultPushConfig(val);
                localStorage.setItem('default_push_config', value);
                alert('已应用并保存推送配置');
            }
            if (manageModal.category === 'ai_profile') {
                const profiles = getAiProfiles();
                if (val.id) {
                    if (profiles.find((p) => p.id === val.id)) {
                        if (confirm('模型池中已存在相同 ID 的模型，是否覆盖？')) {
                            const newProfiles = profiles.map((p) => (p.id === val.id ? val : p));
                            saveAiProfiles(newProfiles);
                            window.location.reload(); // 刷新以更新状态
                        }
                    } else {
                        const newProfiles = [...profiles, val];
                        saveAiProfiles(newProfiles);
                        window.location.reload();
                    }
                }
            }
        } catch (e) {
            alert('应用失败：' + e);
        }
    };

    return (
        <div className={styles.container}>
            {/* 页面标题 */}
            <div className={styles.header}>
                <h1 className={styles.title}>系统设置</h1>
                <p className={styles.subtitle}>管理 API 连接、推送配置和系统选项</p>
            </div>

            <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as SettingsTab)} variant="pills">
                <TabsList className={styles.tabsList}>
                    {TABS.map((tab) => (
                        <TabsTrigger key={tab.id} value={tab.id}>
                            {tab.icon} {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <div className={styles.contentWrapper}>
                    {/* API 配置 */}
                    <TabsContent value="api">
                        <ApiConfigTab
                            apiUrl={apiUrl}
                            apiKey={apiKey}
                            testingConnection={testingConnection}
                            connectionStatus={connectionStatus}
                            onApiUrlChange={setApiUrl}
                            onApiKeyChange={setApiKey}
                            onTestConnection={handleTestConnection}
                            onSaveConfig={handleSaveApiConfig}
                        />
                    </TabsContent>

                    {/* 推送设置 */}
                    <TabsContent value="push">
                        <PushConfigTab
                            defaultPushConfig={defaultPushConfig}
                            notifications={notifications}
                            onPushConfigChange={setDefaultPushConfig}
                            onNotificationsChange={setNotifications}
                            onSavePushConfig={handleSavePushConfig}
                            onSaveNotifications={handleSaveNotifications}
                            onOpenManageModal={() => setManageModal({ open: true, category: 'push_config', title: '推送配置库' })}
                            onSaveToCloud={handleSavePushConfigToCloud}
                        />
                    </TabsContent>

                    {/* AI 模型池 */}
                    <TabsContent value="ai">
                        <AiConfigTab
                            aiProfiles={aiProfiles}
                            editingProfile={editingProfile}
                            testingLlm={testingLlm}
                            llmStatus={llmStatus}
                            onAddProfile={handleAddProfile}
                            onEditProfile={handleEditProfile}
                            onDeleteProfile={handleDeleteProfile}
                            onSaveProfile={handleSaveProfile}
                            onCancelEdit={handleCancelEdit}
                            onTestProfile={handleTestProfile}
                            onSaveToCloud={handleSaveProfileToCloud}
                            onOpenManageModal={() => setManageModal({ open: true, category: 'ai_profile', title: 'AI 模型库' })}
                            onProfileChange={setEditingProfile}
                        />
                    </TabsContent>

                    {/* 关于 */}
                    <TabsContent value="about">
                        <AboutTab
                            onExportSettings={handleExportSettings}
                            onImportSettings={handleImportSettings}
                            onClearData={handleClearData}
                        />
                    </TabsContent>
                </div>
            </Tabs>

            {/* 配置管理弹窗 */}
            {manageModal.open && (
                <ConfigManagerModal
                    isOpen={manageModal.open}
                    onClose={() => setManageModal({ ...manageModal, open: false })}
                    category={manageModal.category}
                    title={manageModal.title}
                    onSelect={handleConfigSelect}
                />
            )}
        </div>
    );
}

export default Settings;
