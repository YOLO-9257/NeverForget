import { useState, useEffect, useCallback } from 'react';
import { configApi, type SavedConfig } from '../api';
import styles from './ConfigManagerModal.module.css';

interface ConfigManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    category: string;
    title: string;
    onSelect?: (value: string) => void;
    onUpdate?: () => void;  // 配置更新后的回调
}

export function ConfigManagerModal({ isOpen, onClose, category, title, onSelect }: ConfigManagerModalProps) {
    const [configs, setConfigs] = useState<SavedConfig[]>([]);
    const [loading, setLoading] = useState(false);
    const [newName, setNewName] = useState('');
    const [newValue, setNewValue] = useState('');
    const [adding, setAdding] = useState(false);

    const loadConfigs = useCallback(async () => {
        try {
            setLoading(true);
            const res = await configApi.list(category);
            if (res.data) {
                setConfigs(res.data);
            }
        } catch (error) {
            console.error('加载配置失败:', error);
        } finally {
            setLoading(false);
        }
    }, [category]);

    useEffect(() => {
        if (isOpen) {
            loadConfigs();
        }
    }, [isOpen, loadConfigs]);

    const handleAdd = async () => {
        if (!newName.trim() || !newValue.trim()) return;
        try {
            setAdding(true);
            const res = await configApi.create({
                category,
                name: newName,
                value: newValue
            });
            if (res.data) {
                setConfigs(prev => [res.data!, ...prev]);
                setNewName('');
                setNewValue('');
            }
        } catch (error) {
            alert('添加失败: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            setAdding(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('确定要删除这项配置吗？')) return;
        try {
            await configApi.delete(id);
            setConfigs(prev => prev.filter(c => c.id !== id));
        } catch {
            alert('删除失败');
        }
    };

    if (!isOpen) return null;

    return (
        <div className={`modal-overlay ${styles.overlay}`}>
            <div className={`modal-content ${styles.modal}`}>
                <div className={styles.header}>
                    <h3 className={styles.title}>管理 {title}</h3>
                    <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
                </div>

                {/* 添加新配置 */}
                <div className={styles.addSection}>
                    <h4 className={styles.addTitle}>添加新{title}</h4>
                    <div className={`form-group ${styles.formGroup}`}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="名称 (如: 张三, 早安模板)"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                        />
                    </div>
                    <div className={`form-group ${styles.formGroup}`}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder={`${title} 值`}
                            value={newValue}
                            onChange={e => setNewValue(e.target.value)}
                        />
                    </div>
                    <button
                        className={`btn btn-primary btn-sm ${styles.addButton}`}
                        onClick={handleAdd}
                        disabled={adding}
                    >
                        {adding ? '添加中...' : '添加'}
                    </button>
                </div>

                {/* 列表 */}
                <div className={styles.listContainer}>
                    {loading ? (
                        <div className={styles.loadingText}>加载中...</div>
                    ) : configs.length === 0 ? (
                        <div className={styles.emptyText}>暂无保存的配置</div>
                    ) : (
                        <div className={styles.configList}>
                            {configs.map(config => (
                                <div key={config.id} className={styles.configItem}>
                                    <div className={styles.configInfo}>
                                        <div className={styles.configName}>{config.name}</div>
                                        <div className={styles.configValue}>{config.value}</div>
                                    </div>
                                    <div className={styles.configActions}>
                                        {onSelect && (
                                            <button
                                                className="btn btn-secondary btn-xs"
                                                onClick={() => {
                                                    onSelect(config.value);
                                                    onClose();
                                                }}
                                            >
                                                选择
                                            </button>
                                        )}
                                        <button
                                            className={`btn btn-ghost btn-xs ${styles.deleteBtn}`}
                                            onClick={() => handleDelete(config.id)}
                                        >
                                            删除
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
