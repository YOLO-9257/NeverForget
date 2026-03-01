/**
 * 任务创建/编辑页面
 * 支持创建各种类型的定时提醒任务
 * @author zhangws
 */

import { Link } from 'react-router-dom';
import { ConfigManagerModal } from '../../components/ConfigManagerModal';
import { useCreateTask } from './hooks/useCreateTask';
import { StepIndicator, Step1Template, Step2Config, Step3Push } from './components';
import type { UserMessageTemplate } from './types';
import styles from './CreateTask.module.css';

const STEPS = [
    { number: 1, label: '选择模板' },
    { number: 2, label: '任务配置' },
    { number: 3, label: '推送配置' },
];

export function CreateTask() {
    const {
        // 状态
        loading,
        error,
        step,
        showNlpInput,
        wxpushTemplates,
        loadingTemplates,
        userTemplates,
        inputMode,
        savedUserIds,
        savedTemplateIds,
        savedPushConfigs,
        manageModal,
        polishing,
        hasAi,
        formData,
        isEditMode,

        // 设置器
        setError,
        setStep,
        setShowNlpInput,
        setInputMode,
        setManageModal,
        setFormData,

        // 操作函数
        loadSavedConfigs,
        loadWxPushTemplates,
        handleSelectTemplate,
        handleNlpApply,
        updateFormData,
        handleSubmit,
        handlePolish,
    } = useCreateTask();

    // 选择用户自定义模板的处理
    const handleSelectUserTemplate = (template: UserMessageTemplate) => {
        let content = template.content;
        template.variables.forEach((v) => {
            const defaultVal = v === 'time' ? new Date().toLocaleString('zh-CN') : `{{${v}}}`;
            content = content.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), defaultVal);
        });
        setFormData((prev) => ({
            ...prev,
            title: template.name,
            content: content,
        }));
        setStep(2);
    };

    // 应用保存的推送配置
    const handleApplySavedConfig = (config: { value: string }) => {
        try {
            const val = JSON.parse(config.value);
            setFormData((prev) => ({
                ...prev,
                appid: val.appid || prev.appid,
                secret: val.secret || prev.secret,
                userid: val.userid || prev.userid,
                template_id: val.template_id || prev.template_id,
            }));
        } catch (e) {
            console.error('解析配置失败', e);
        }
    };

    return (
        <div className={styles.container}>
            {/* 页面标题 */}
            <div className={styles.header}>
                <div className={styles.headerContent}>
                    <Link to="/tasks" className={styles.backBtn} title="返回">
                        ←
                    </Link>
                    <div>
                        <h1 className={styles.title}>{isEditMode ? '编辑任务' : '创建任务'}</h1>
                        <p className={styles.subtitle}>
                            {step === 1 && '第 1 步：选择任务模板'}
                            {step === 2 && '第 2 步：配置任务详情'}
                            {step === 3 && '第 3 步：配置推送信息'}
                        </p>
                    </div>
                </div>
            </div>

            {/* 步骤指示器 */}
            <StepIndicator steps={STEPS} currentStep={step} />

            {/* 错误提示 */}
            {error && (
                <div className={styles.alert}>
                    <span>❌</span>
                    <span>{error}</span>
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            {/* 步骤 1：选择模板 */}
            {step === 1 && (
                <Step1Template
                    showNlpInput={showNlpInput}
                    userTemplates={userTemplates}
                    onNlpApply={handleNlpApply}
                    onSelectTemplate={handleSelectTemplate}
                    onShowNlpInput={setShowNlpInput}
                    onSelectUserTemplate={handleSelectUserTemplate}
                />
            )}

            {/* 步骤 2：任务配置 */}
            {step === 2 && (
                <Step2Config
                    formData={formData}
                    hasAi={hasAi}
                    polishing={polishing}
                    onUpdateFormData={updateFormData}
                    onPolish={handlePolish}
                    onPrev={() => setStep(1)}
                    onNext={() => setStep(3)}
                />
            )}

            {/* 步骤 3：推送配置 */}
            {step === 3 && (
                <Step3Push
                    formData={formData}
                    loading={loading}
                    loadingTemplates={loadingTemplates}
                    isEditMode={isEditMode}
                    wxpushTemplates={wxpushTemplates}
                    savedUserIds={savedUserIds}
                    savedTemplateIds={savedTemplateIds}
                    savedPushConfigs={savedPushConfigs}
                    inputMode={inputMode}
                    onUpdateFormData={updateFormData}
                    onLoadWxPushTemplates={loadWxPushTemplates}
                    onOpenManageModal={(category, title) => setManageModal({ open: true, category, title })}
                    onToggleInputMode={() => setInputMode((prev) => (prev === 'select' ? 'input' : 'select'))}
                    onPrev={() => setStep(2)}
                    onSubmit={handleSubmit}
                    onApplySavedConfig={handleApplySavedConfig}
                />
            )}

            {/* 配置管理模态框 */}
            {manageModal.open && (
                <ConfigManagerModal
                    isOpen={manageModal.open}
                    onClose={() => setManageModal({ open: false, category: '', title: '' })}
                    category={manageModal.category}
                    title={manageModal.title}
                    onUpdate={() => loadSavedConfigs(manageModal.category)}
                />
            )}
        </div>
    );
}

export default CreateTask;
