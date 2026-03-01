import { Env } from '../types';

interface TableInfoRow {
    name?: string;
}

let remindersSchemaReady = false;
let remindersSchemaInitPromise: Promise<boolean> | null = null;

function isDuplicateColumnError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.toLowerCase().includes('duplicate column name');
}

/**
 * 兼容历史库：确保 reminders 表具备 type / related_id 列及相关索引
 */
export async function ensureRemindersSchema(env: Env): Promise<boolean> {
    if (remindersSchemaReady) {
        return true;
    }

    if (remindersSchemaInitPromise) {
        return remindersSchemaInitPromise;
    }

    remindersSchemaInitPromise = (async () => {
        try {
            const tableInfo = await env.DB.prepare('PRAGMA table_info(reminders)').all<TableInfoRow>();
            const columns = new Set(
                (tableInfo.results || [])
                    .map((row) => String(row?.name || '').trim())
                    .filter(Boolean)
            );

            if (!columns.has('type')) {
                try {
                    await env.DB.prepare(`ALTER TABLE reminders ADD COLUMN type TEXT DEFAULT 'reminder'`).run();
                } catch (error) {
                    if (!isDuplicateColumnError(error)) {
                        throw error;
                    }
                }
            }

            if (!columns.has('related_id')) {
                try {
                    await env.DB.prepare(`ALTER TABLE reminders ADD COLUMN related_id TEXT`).run();
                } catch (error) {
                    if (!isDuplicateColumnError(error)) {
                        throw error;
                    }
                }
            }

            const indexStatements = [
                `CREATE INDEX IF NOT EXISTS idx_reminders_type ON reminders(type)`,
                `CREATE INDEX IF NOT EXISTS idx_reminders_related ON reminders(related_id)`,
                `CREATE INDEX IF NOT EXISTS idx_reminders_user_type ON reminders(user_key, type)`,
            ];

            for (const sql of indexStatements) {
                await env.DB.prepare(sql).run();
            }

            remindersSchemaReady = true;
            return true;
        } catch (error) {
            console.warn('[Reminder Schema] 初始化失败:', error);
            remindersSchemaReady = false;
            return false;
        } finally {
            remindersSchemaInitPromise = null;
        }
    })();

    return remindersSchemaInitPromise;
}
