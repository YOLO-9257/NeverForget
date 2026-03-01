import { useTemplates } from './useTemplates';
import { TemplateList } from './TemplateList';
import { TemplateEditor } from './TemplateEditor';
import { TemplatePreview } from './TemplatePreview';
import styles from './Templates.module.css';

/**
 * 消息模板管理页面
 * 支持创建、编辑、预览和管理消息模板
 */
export function Templates() {
    const {
        selectedTemplate,
        isEditing,
        isCreating,
        filterCategory,
        searchQuery,
        previewVariables,
        editForm,
        filteredTemplates,
        setFilterCategory,
        setSearchQuery,
        setPreviewVariables,
        setEditForm,
        handleSelectTemplate,
        handleStartEdit,
        handleStartCreate,
        handleSave,
        handleDelete,
        handleCopyContent,
        handleCancelEdit,
        renderPreview,
        isDefaultTemplate,
    } = useTemplates();

    return (
        <div className={styles.page}>
            {/* 页面标题 */}
            <div className={styles.header}>
                <div className={styles.headerInfo}>
                    <h1>消息模板</h1>
                    <p>管理和自定义推送消息的 HTML 模板</p>
                </div>
                <div className={styles.headerActions}>
                    <button
                        className="btn btn-secondary"
                        onClick={() => {
                            const savedConfig = localStorage.getItem('default_push_config');
                            let adminUrl = 'http://localhost:5566/admin';
                            if (savedConfig) {
                                try {
                                    const config = JSON.parse(savedConfig);
                                    if (config.push_service_url) {
                                        try {
                                            const urlObj = new URL(config.push_service_url);
                                            adminUrl = `${urlObj.origin}/admin`;
                                        } catch {
                                            adminUrl = config.push_service_url.replace(/\/$/, '') + '/admin';
                                        }
                                    }
                                } catch (e) {
                                    console.warn('Failed to parse push config', e);
                                }
                            }
                            window.open(adminUrl, '_blank');
                        }}
                        title="打开 go-wxpush 模板管理后台"
                    >
                        🌐 管理远程模板
                    </button>
                    <button className="btn btn-primary" onClick={handleStartCreate}>
                        ➕ 创建模板
                    </button>
                </div>
            </div>

            {/* 主内容区域 */}
            <div className={styles.layout}>
                {/* 左侧：模板列表 */}
                <TemplateList
                    templates={filteredTemplates}
                    selectedId={selectedTemplate?.id ?? null}
                    searchQuery={searchQuery}
                    filterCategory={filterCategory}
                    onSelect={handleSelectTemplate}
                    onSearchChange={setSearchQuery}
                    onFilterChange={setFilterCategory}
                />

                {/* 右侧：模板详情/编辑 */}
                <div>
                    {isCreating || isEditing ? (
                        <TemplateEditor
                            editForm={editForm}
                            isCreating={isCreating}
                            onFormChange={setEditForm}
                            onSave={handleSave}
                            onCancel={handleCancelEdit}
                        />
                    ) : selectedTemplate ? (
                        <TemplatePreview
                            template={selectedTemplate}
                            previewVariables={previewVariables}
                            isDefault={isDefaultTemplate(selectedTemplate)}
                            onEdit={handleStartEdit}
                            onDelete={handleDelete}
                            onCopy={handleCopyContent}
                            onVariableChange={(varName, value) =>
                                setPreviewVariables((prev) => ({ ...prev, [varName]: value }))
                            }
                            renderPreview={renderPreview}
                        />
                    ) : (
                        <div className={styles.detailCard}>
                            <div className={styles.emptyState}>
                                <div className={styles.emptyIcon}>📝</div>
                                <div className={styles.emptyTitle}>选择一个模板</div>
                                <div className={styles.emptyText}>
                                    从左侧列表选择模板进行预览和编辑，或创建新模板
                                </div>
                                <button className="btn btn-primary" onClick={handleStartCreate}>
                                    ➕ 创建模板
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
