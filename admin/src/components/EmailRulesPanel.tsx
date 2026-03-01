import { useState, useEffect, useCallback } from 'react';
import styles from './EmailRulesPanel.module.css';

type RuleField = 'from' | 'subject' | 'content';
type RuleOperator = 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'not_contains';
type RuleActionType = 'block' | 'mark_spam' | 'skip_push' | 'ai_review';

interface RuleCondition {
    field: RuleField;
    operator: RuleOperator;
    value: string;
}

interface RuleAction {
    type: RuleActionType;
    value?: string;
}

interface Rule {
    id: number;
    name: string;
    account_id: string | null;
    conditions: RuleCondition[];
    action: RuleAction;
    is_enabled: number;
    priority: number;
    created_at: number;
}

interface RuleFormState {
    name: string;
    conditions: RuleCondition[];
    action: RuleAction;
    priority: number;
}

const DEFAULT_FORM: RuleFormState = {
    name: '',
    conditions: [{ field: 'subject', operator: 'contains', value: '' }],
    action: { type: 'mark_spam', value: '' },
    priority: 0,
};

export function EmailRulesPanel() {
    const [rules, setRules] = useState<Rule[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    const [form, setForm] = useState<RuleFormState>(DEFAULT_FORM);

    const token = localStorage.getItem('auth_token');
    const apiUrl = localStorage.getItem('api_url') || '';

    const fetchRules = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${apiUrl}/api/email/rules`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.code === 0) setRules(json.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [apiUrl, token]);

    useEffect(() => { void fetchRules(); }, [fetchRules]);

    const handleSave = async () => {
        if (!form.name || !form.conditions[0].value) {
            alert('请填写完整规则信息');
            return;
        }

        try {
            const res = await fetch(`${apiUrl}/api/email/rules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(form)
            });
            const json = await res.json();
            if (json.code === 0) {
                setShowModal(false);
                await fetchRules();
                setForm(DEFAULT_FORM);
            } else {
                alert(json.message);
            }
        } catch (e) { alert(String(e)); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('确定要删除此规则吗？')) return;
        try {
            const res = await fetch(`${apiUrl}/api/email/rules/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) await fetchRules();
        } catch (e) { alert(String(e)); }
    };

    return (
        <div>
            <div className={styles.header}>
                <div>
                    <h3 className="card-title">🛡️ 过滤规则</h3>
                    <p className="card-subtitle">自定义规则以自动处理接收到的邮件</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    添加规则
                </button>
            </div>

            {loading ? (
                <div className="loading"><div className="spinner" /></div>
            ) : (
                <div className={`card ${styles.tableCard}`}>
                    <table className={styles.table}>
                        <thead className={styles.tableHead}>
                            <tr className={styles.tableHeadRow}>
                                <th className={styles.th}>规则名称</th>
                                <th className={styles.th}>条件</th>
                                <th className={styles.th}>动作</th>
                                <th className={styles.th}>状态</th>
                                <th className={`${styles.th} ${styles.thActions}`}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rules.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className={styles.emptyRow}>暂无规则</td>
                                </tr>
                            ) : rules.map(rule => (
                                <tr key={rule.id}>
                                    <td className={`${styles.td} ${styles.tdName}`}>{rule.name}</td>
                                    <td className={styles.td}>
                                        {rule.conditions.map((c, i) => (
                                            <span key={i} className={`badge badge-secondary ${styles.conditionBadge}`}>
                                                {c.field === 'from' ? '发件人' : c.field === 'subject' ? '主题' : '内容'}{' '}
                                                {c.operator === 'contains' ? '包含' : c.operator === 'equals' ? '等于' : '...'}{' '}
                                                "{c.value}"
                                            </span>
                                        ))}
                                    </td>
                                    <td className={styles.td}>
                                        <span className={`badge ${rule.action.type === 'skip_push' ? 'badge-warning' : 'badge-error'}`}>
                                            {rule.action.type === 'skip_push' ? '不推送' : rule.action.type === 'mark_spam' ? '标记垃圾' : '拦截'}
                                        </span>
                                    </td>
                                    <td className={styles.td}>
                                        {rule.is_enabled ? (
                                            <span className={styles.statusEnabled}>启用</span>
                                        ) : (
                                            <span className={styles.statusDisabled}>禁用</span>
                                        )}
                                    </td>
                                    <td className={`${styles.td} ${styles.tdActions}`}>
                                        <button
                                            className="btn btn-ghost btn-danger btn-sm"
                                            onClick={() => handleDelete(rule.id)}
                                        >
                                            删除
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>添加新规则</h3>
                            <button className="btn-close" onClick={() => setShowModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">规则名称</label>
                                <input
                                    className="form-input"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    placeholder="例如：拦截广告"
                                    autoFocus
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">匹配条件</label>
                                {form.conditions.map((cond, idx) => (
                                    <div key={idx} className={styles.conditionGrid}>
                                        <select
                                            className={styles.conditionSelect}
                                            value={cond.field}
                                            onChange={e => {
                                                const newConds = [...form.conditions];
                                                newConds[idx].field = e.target.value as RuleField;
                                                setForm({ ...form, conditions: newConds });
                                            }}
                                        >
                                            <option value="subject">主题</option>
                                            <option value="from">发件人</option>
                                            <option value="content">正文</option>
                                        </select>
                                        <select
                                            className={styles.conditionSelect}
                                            value={cond.operator}
                                            onChange={e => {
                                                const newConds = [...form.conditions];
                                                newConds[idx].operator = e.target.value as RuleOperator;
                                                setForm({ ...form, conditions: newConds });
                                            }}
                                        >
                                            <option value="contains">包含</option>
                                            <option value="equals">等于</option>
                                            <option value="starts_with">开始于</option>
                                            <option value="ends_with">结束于</option>
                                            <option value="not_contains">不包含</option>
                                        </select>
                                        <input
                                            className={styles.conditionInput}
                                            value={cond.value}
                                            onChange={e => {
                                                const newConds = [...form.conditions];
                                                newConds[idx].value = e.target.value;
                                                setForm({ ...form, conditions: newConds });
                                            }}
                                            placeholder="匹配内容"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="form-group">
                                <label className="form-label">执行动作</label>
                                <select
                                    className="form-select"
                                    value={form.action.type}
                                    onChange={e => setForm({ ...form, action: { ...form.action, type: e.target.value as RuleActionType } })}
                                >
                                    <option value="mark_spam">标记为垃圾邮件 (不推送)</option>
                                    <option value="skip_push">仅保存 (不推送)</option>
                                    <option value="block">直接拦截 (不保存)</option>
                                </select>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>取消</button>
                            <button className="btn btn-primary" onClick={handleSave}>保存规则</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
