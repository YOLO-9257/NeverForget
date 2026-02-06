import { useState, useEffect } from 'react';
import { configApi, type SavedConfig } from '../api';

interface ConfigManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    category: string;
    title: string;
    onSelect?: (value: string) => void;
}

export function ConfigManagerModal({ isOpen, onClose, category, title, onSelect }: ConfigManagerModalProps) {
    const [configs, setConfigs] = useState<SavedConfig[]>([]);
    const [loading, setLoading] = useState(false);
    const [newName, setNewName] = useState('');
    const [newValue, setNewValue] = useState('');
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadConfigs();
        }
    }, [isOpen, category]);

    const loadConfigs = async () => {
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
    };

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
        } catch (error) {
            alert('删除失败');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        }}>
            <div className="modal-content" style={{
                background: 'var(--bg-card)',
                borderRadius: '12px',
                padding: '24px',
                width: '100%',
                maxWidth: '500px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0 }}>管理 {title}</h3>
                    <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
                </div>

                {/* 添加新配置 */}
                <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>添加新{title}</h4>
                    <div className="form-group" style={{ marginBottom: '8px' }}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="名称 (如: 张三, 早安模板)"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: '8px' }}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder={`${title} 值`}
                            value={newValue}
                            onChange={e => setNewValue(e.target.value)}
                        />
                    </div>
                    <button
                        className="btn btn-primary btn-sm"
                        style={{ width: '100%' }}
                        onClick={handleAdd}
                        disabled={adding}
                    >
                        {adding ? '添加中...' : '添加'}
                    </button>
                </div>

                {/* 列表 */}
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '20px' }}>加载中...</div>
                    ) : configs.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>暂无保存的配置</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {configs.map(config => (
                                <div key={config.id} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '12px',
                                    background: 'var(--bg-page)',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)'
                                }}>
                                    <div style={{ overflow: 'hidden' }}>
                                        <div style={{ fontWeight: 600 }}>{config.name}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                            {config.value}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
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
                                            className="btn btn-ghost btn-xs"
                                            style={{ color: 'var(--error)' }}
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
