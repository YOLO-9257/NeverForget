import { Env } from '../types';

export interface AiActionLogEntry {
    userKey: string;
    action: string;
    status: 'success' | 'failed';
    triggeredAt?: number;
    reminderId?: string | null;
    reminderTitle?: string | null;
    reminderType?: 'reminder' | 'email_sync';
    response?: string | null;
    error?: string | null;
    durationMs?: number | null;
}

let aiActionLogsTableReady = false;

export async function ensureAiActionLogsTable(env: Env): Promise<boolean> {
    if (aiActionLogsTableReady) {
        return true;
    }

    try {
        const statements = [
            `
            CREATE TABLE IF NOT EXISTS ai_action_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_key TEXT NOT NULL,
                action TEXT NOT NULL,
                reminder_id TEXT,
                reminder_title TEXT,
                reminder_type TEXT DEFAULT 'reminder',
                triggered_at INTEGER NOT NULL,
                status TEXT NOT NULL,
                response TEXT,
                error TEXT,
                duration_ms INTEGER,
                created_at INTEGER NOT NULL
            )
            `,
            `CREATE INDEX IF NOT EXISTS idx_ai_action_logs_user_time ON ai_action_logs(user_key, triggered_at DESC)`,
            `CREATE INDEX IF NOT EXISTS idx_ai_action_logs_user_status ON ai_action_logs(user_key, status)`,
            `CREATE INDEX IF NOT EXISTS idx_ai_action_logs_reminder ON ai_action_logs(reminder_id, triggered_at DESC)`,
        ];

        for (const sql of statements) {
            await env.DB.prepare(sql).run();
        }

        aiActionLogsTableReady = true;
        return true;
    } catch (error) {
        console.warn('[AI Action Log] 初始化表失败:', error);
        return false;
    }
}

export async function logAiAction(env: Env, entry: AiActionLogEntry): Promise<void> {
    try {
        await ensureAiActionLogsTable(env);

        const now = Date.now();
        const triggeredAt = entry.triggeredAt ?? now;
        const reminderType = entry.reminderType || 'reminder';

        await env.DB.prepare(`
            INSERT INTO ai_action_logs (
                user_key, action, reminder_id, reminder_title, reminder_type,
                triggered_at, status, response, error, duration_ms, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            entry.userKey,
            entry.action,
            entry.reminderId ?? null,
            entry.reminderTitle ?? null,
            reminderType,
            triggeredAt,
            entry.status,
            entry.response ?? null,
            entry.error ?? null,
            entry.durationMs ?? null,
            now
        ).run();
    } catch (error) {
        console.warn('[AI Action Log] 写入失败:', error);
    }
}
