import { useState, useEffect, useRef } from 'react';
import { Button } from '../components/shared';
import { aiChatApi } from '../api';
import { getAiProfiles } from '../utils/ai';
import { MarkdownRenderer } from '../components/common/MarkdownRenderer';
import styles from './AiButler.module.css';

interface Message {
    role: 'user' | 'model' | 'system';
    content: string;
    timestamp?: number;
}

interface HistoryMessage {
    role?: string;
    content?: string;
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
                const hist = res.data.history
                    .map((item) => {
                        const m = item as HistoryMessage;
                        if (!m || typeof m.content !== 'string') {
                            return null;
                        }
                        if (m.role !== 'user' && m.role !== 'model' && m.role !== 'system') {
                            return null;
                        }
                        return {
                            role: m.role,
                            content: m.content,
                            timestamp: m.timestamp,
                        } as Message;
                    })
                    .filter((item): item is Message => item !== null);
                setMessages(hist);
            }
        } catch (error) {
            console.error(error);
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
            }
        } catch (error) {
            console.error(error);
            setError(error instanceof Error ? error.message : '发送失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">🤖 智能管家</h1>
                    <p className="page-subtitle">我是您的私人助手，我会记住您的习惯并协助您管理事务。</p>
                </div>
            </div>

            <div className={`card ${styles.chatCard}`}>
                {/* Summary Banner */}
                {summary && (
                    <div className={styles.summaryBanner}>
                        <strong>🧠 记忆摘要:</strong> {summary}
                    </div>
                )}

                {/* Messages Area */}
                <div className={styles.messagesArea}>
                    {messages.length === 0 && !loading && (
                        <div className={styles.emptyState}>
                            👋 你好！我是您的智能管家。有什么可以帮您的吗？
                        </div>
                    )}

                    {messages.filter(m => m.role !== 'system').map((msg, idx) => (
                        <div
                            key={idx}
                            className={`${styles.messageWrapper} ${msg.role === 'user' ? styles.messageWrapperUser : styles.messageWrapperModel
                                }`}
                        >
                            <div
                                className={`${styles.messageBubble} ${msg.role === 'user' ? styles.messageBubbleUser : styles.messageBubbleModel
                                    }`}
                            >
                                <MarkdownRenderer
                                    content={msg.content}
                                    className={msg.role === 'user' ? 'user-message' : ''}
                                />
                            </div>
                            {msg.timestamp && (
                                <div
                                    className={`${styles.messageTimestamp} ${msg.role === 'user' ? styles.messageTimestampUser : styles.messageTimestampModel
                                        }`}
                                >
                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                </div>
                            )}
                        </div>
                    ))}

                    {loading && (
                        <div className={styles.loadingState}>
                            <span className="spinner-sm"></span> 正在思考...
                        </div>
                    )}

                    {error && (
                        <div className={styles.errorState}>
                            ❌ {error}
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className={styles.inputArea}>
                    <div className={styles.inputWrapper}>
                        <textarea
                            className={styles.textarea}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            placeholder="告诉管家您的安排或习惯..."
                        />
                        <Button
                            variant="primary"
                            onClick={handleSend}
                            disabled={loading || !input.trim()}
                            loading={loading}
                        >
                            发送
                        </Button>
                    </div>
                    <div className={styles.footerHint}>
                        您的对话会被智能分析并提取为记忆，以提供更个性化的服务。
                    </div>
                </div>
            </div>
        </div>
    );
}
