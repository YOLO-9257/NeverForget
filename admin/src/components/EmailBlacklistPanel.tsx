import { useState, useEffect, useCallback } from 'react';
import styles from './EmailBlacklistPanel.module.css';

interface BlacklistItem {
    id: number;
    account_id: string | null;
    email_address: string;
    created_at: number;
}

export function EmailBlacklistPanel() {
    const [items, setItems] = useState<BlacklistItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [email, setEmail] = useState('');

    const token = localStorage.getItem('auth_token');
    const apiUrl = localStorage.getItem('api_url') || '';

    const fetchItems = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${apiUrl}/api/email/blacklist`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.code === 0) setItems(json.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [apiUrl, token]);

    useEffect(() => {
        void fetchItems();
    }, [fetchItems]);

    const handleAdd = async () => {
        if (!email) return;
        try {
            const res = await fetch(`${apiUrl}/api/email/blacklist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ email_address: email })
            });
            const json = await res.json();
            if (json.code === 0) {
                setEmail('');
                await fetchItems();
            } else {
                alert(json.message || 'Add failed');
            }
        } catch (e) { alert(String(e)); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Remove from blacklist?')) return;
        try {
            const res = await fetch(`${apiUrl}/api/email/blacklist/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) await fetchItems();
        } catch (e) { alert(String(e)); }
    };

    return (
        <div>
            <div className={styles.header}>
                <h3 className="card-title">🚫 邮件黑名单</h3>
                <p className="card-subtitle">在此列表中的发件人邮件将被自动屏蔽，不会推送通知。</p>
            </div>

            <div className={`card ${styles.card}`}>
                <div className={styles.inputRow}>
                    <input
                        className={`form-input ${styles.emailInput}`}
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="输入要屏蔽的邮箱地址 (例如 spam@example.com)"
                    />
                    <button className="btn btn-primary" onClick={handleAdd} disabled={!email}>
                        添加屏蔽
                    </button>
                </div>

                {loading ? (
                    <div className="loading"><div className="spinner" /></div>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr className={styles.tableHead}>
                                <th className={styles.th}>邮箱地址</th>
                                <th className={styles.th}>添加时间</th>
                                <th className={`${styles.th} ${styles.thActions}`}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className={styles.emptyRow}>暂无黑名单数据</td>
                                </tr>
                            ) : items.map(item => (
                                <tr key={item.id}>
                                    <td className={styles.td}>{item.email_address}</td>
                                    <td className={`${styles.td} ${styles.tdTime}`}>
                                        {new Date(item.created_at).toLocaleString()}
                                    </td>
                                    <td className={`${styles.td} ${styles.tdActions}`}>
                                        <button
                                            className={`btn btn-ghost ${styles.removeBtn}`}
                                            onClick={() => handleDelete(item.id)}
                                        >
                                            移除
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
