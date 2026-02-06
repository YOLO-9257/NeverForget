import { useState, useEffect, useRef } from 'react';
import { aiChatApi } from '../api';
import { getAiProfiles } from '../utils/ai';

interface Message {
    role: 'user' | 'model' | 'system';
    content: string;
    timestamp?: number;
}

export function AiButler() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [summary, setSummary] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        loadHistory();
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const loadHistory = async () => {
        try {
            const res = await aiChatApi.getHistory();
            if (res.data) {
                setSummary(res.data.summary);
                // Type safety check
                const hist = res.data.history.map((m: any) => ({
                    role: m.role as 'user' | 'model' | 'system',
                    content: m.content,
                    timestamp: m.timestamp
                }));
                setMessages(hist);
            }
        } catch (e: any) {
            console.error(e);
            setError('加载历史记录失败');
        }
    };

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg: Message = { role: 'user', content: input, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);
        setError('');

        try {
            // Get current AI profile
            const profiles = getAiProfiles();
            const profile = profiles.find(p => p.isDefault) || profiles[0];

            if (!profile) {
                throw new Error("请先在设置中配置 AI 模型");
            }

            const res = await aiChatApi.send({
                message: userMsg.content,
                provider: profile.provider,
                apiKey: profile.apiKey,
                baseUrl: profile.baseUrl,
                model: profile.model
            });

            if (res.data) {
                const modelMsg: Message = { role: 'model', content: res.data.reply, timestamp: Date.now() };
                setMessages(prev => [...prev, modelMsg]);

                if (res.data.context_updated) {
                    // Refresh summary if updated (optional, could just wait for next reload)
                    // loadHistory(); 
                }
            }
        } catch (e: any) {
            console.error(e);
            setError(e.message || '发送失败');
            // Remove optimistic message if needed, or show error
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">🤖 智能管家</h1>
                    <p className="page-subtitle">我是您的私人助手，我会记住您的习惯并协助您管理事务。</p>
                </div>
            </div>

            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                {/* Summary Banner */}
                {summary && (
                    <div style={{ padding: '12px 24px', background: 'rgba(var(--primary-rgb), 0.05)', borderBottom: '1px solid var(--border)', fontSize: '0.9em', color: 'var(--text-secondary)' }}>
                        <strong>🧠 记忆摘要:</strong> {summary}
                    </div>
                )}

                {/* Messages Area */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {messages.length === 0 && !loading && (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>
                            👋 你好！我是您的智能管家。有什么可以帮您的吗？
                        </div>
                    )}

                    {messages.filter(m => m.role !== 'system').map((msg, idx) => (
                        <div key={idx} style={{
                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            maxWidth: '70%',
                        }}>
                            <div style={{
                                padding: '12px 16px',
                                borderRadius: '12px',
                                borderTopRightRadius: msg.role === 'user' ? '2px' : '12px',
                                borderTopLeftRadius: msg.role === 'model' ? '2px' : '12px',
                                background: msg.role === 'user' ? 'var(--primary)' : 'var(--bg-hover)',
                                color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                                whiteSpace: 'pre-wrap',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                            }}>
                                {msg.content}
                            </div>
                            {msg.timestamp && (
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                </div>
                            )}
                        </div>
                    ))}

                    {loading && (
                        <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', padding: '12px' }}>
                            <span className="spinner-sm"></span> 正在思考...
                        </div>
                    )}

                    {error && (
                        <div style={{ alignSelf: 'center', color: 'var(--error)', fontSize: '0.9em', padding: '8px' }}>
                            ❌ {error}
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            placeholder="告诉管家您的安排或习惯..."
                            style={{
                                flex: 1,
                                height: '50px',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                background: 'var(--bg-page)',
                                color: 'var(--text-primary)',
                                resize: 'none',
                                fontFamily: 'inherit'
                            }}
                        />
                        <button
                            className="btn btn-primary"
                            onClick={handleSend}
                            disabled={loading || !input.trim()}
                            style={{ padding: '0 24px', borderRadius: '8px' }}
                        >
                            发送
                        </button>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
                        您的对话会被智能分析并提取为记忆，以提供更个性化的服务。
                    </div>
                </div>
            </div>
        </div>
    );
}
