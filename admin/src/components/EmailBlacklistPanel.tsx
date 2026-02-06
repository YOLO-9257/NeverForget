import { useState, useEffect } from 'react';

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

    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${apiUrl}/api/email/blacklist`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.code === 0) setItems(json.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

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
                fetchItems();
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
            if (res.ok) fetchItems();
        } catch (e) { alert(String(e)); }
    };

    return (
        <div>
            <div style={{ marginBottom: '24px' }}>
                <h3 className="card-title">🚫 邮件黑名单</h3>
                <p className="card-subtitle">在此列表中的发件人邮件将被自动屏蔽，不会推送通知。</p>
            </div>

            <div className="card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    <input
                        className="input"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="输入要屏蔽的邮箱地址 (例如 spam@example.com)"
                        style={{ maxWidth: '400px' }}
                    />
                    <button className="btn btn-primary" onClick={handleAdd} disabled={!email}>添加屏蔽</button>
                </div>

                {loading ? <div className="loading"><div className="spinner" /></div> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                                <th style={{ padding: '12px' }}>邮箱地址</th>
                                <th style={{ padding: '12px' }}>添加时间</th>
                                <th style={{ padding: '12px', textAlign: 'right' }}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 ? (
                                <tr><td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>暂无黑名单数据</td></tr>
                            ) : items.map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                    <td style={{ padding: '12px' }}>{item.email_address}</td>
                                    <td style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>{new Date(item.created_at).toLocaleString()}</td>
                                    <td style={{ padding: '12px', textAlign: 'right' }}>
                                        <button
                                            className="btn btn-ghost"
                                            onClick={() => handleDelete(item.id)}
                                            style={{ color: 'var(--error)', padding: '4px 8px' }}
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
