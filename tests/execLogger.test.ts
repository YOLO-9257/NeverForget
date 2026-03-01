import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recordExecution, type ExecRecord } from '../src/services/execLogger';
import type { Env } from '../src/types';

interface QueryLog {
    sql: string;
    binds: unknown[];
}

interface MockOptions {
    snapshotRow?: {
        reminder_id: string;
        consecutive_failures: number;
        is_escalated: number;
        escalated_until: number | null;
    } | null;
    heartbeatExists?: boolean;
}

class MockDB {
    public queries: QueryLog[] = [];
    private readonly snapshotRow: MockOptions['snapshotRow'];
    private readonly heartbeatExists: boolean;

    constructor(options: MockOptions = {}) {
        this.snapshotRow = options.snapshotRow ?? null;
        this.heartbeatExists = options.heartbeatExists ?? false;
    }

    prepare(sql: string) {
        const normalizedSql = sql.replace(/\s+/g, ' ').trim();

        return {
            bind: (...binds: unknown[]) => ({
                first: async <T>() => {
                    this.queries.push({ sql: normalizedSql, binds });

                    if (normalizedSql.includes('FROM task_exec_snapshot')) {
                        return (this.snapshotRow ?? null) as T | null;
                    }

                    if (normalizedSql.includes('SELECT 1 FROM task_exec_detail')) {
                        return (this.heartbeatExists ? ({ exists: 1 } as T) : null);
                    }

                    return null as T | null;
                },
                run: async () => {
                    this.queries.push({ sql: normalizedSql, binds });
                    return { success: true };
                },
            }),
        };
    }
}

function createEnv(db: MockDB): Env {
    return { DB: db } as unknown as Env;
}

function createBaseRecord(overrides: Partial<ExecRecord> = {}): ExecRecord {
    return {
        reminderId: 'task-1',
        userKey: 'user-1',
        taskType: 'reminder',
        scheduleType: 'daily',
        triggeredAt: 1739500000000,
        status: 'success',
        response: null,
        error: null,
        durationMs: 120,
        isManual: false,
        ...overrides,
    };
}

function getDetailReasons(db: MockDB): string[] {
    return db.queries
        .filter((q) => q.sql.includes('INSERT INTO task_exec_detail'))
        .map((q) => String(q.binds[q.binds.length - 1]));
}

describe('recordExecution', () => {
    it('单次任务会写入 detail，原因为 once', async () => {
        const db = new MockDB();
        const env = createEnv(db);

        await recordExecution(env, createBaseRecord({ scheduleType: 'once' }));

        assert.deepEqual(getDetailReasons(db), ['once']);
    });

    it('常规日程成功且已有当天心跳时，不写入 detail', async () => {
        const db = new MockDB({
            snapshotRow: {
                reminder_id: 'task-1',
                consecutive_failures: 0,
                is_escalated: 0,
                escalated_until: null,
            },
            heartbeatExists: true,
        });
        const env = createEnv(db);

        const originalRandom = Math.random;
        Math.random = () => 0.99;
        try {
            await recordExecution(env, createBaseRecord());
        } finally {
            Math.random = originalRandom;
        }

        assert.deepEqual(getDetailReasons(db), []);
    });

    it('连续失败达到阈值时会升档，且失败任务写入 failed 明细', async () => {
        const db = new MockDB({
            snapshotRow: {
                reminder_id: 'task-1',
                consecutive_failures: 2,
                is_escalated: 0,
                escalated_until: null,
            },
        });
        const env = createEnv(db);

        await recordExecution(
            env,
            createBaseRecord({
                status: 'failed',
                error: 'network timeout',
            })
        );

        const snapshotUpsert = db.queries.find((q) => q.sql.includes('INSERT INTO task_exec_snapshot'));
        assert.ok(snapshotUpsert);
        assert.equal(snapshotUpsert.binds[9], 3);
        assert.equal(snapshotUpsert.binds[10], 1);
        assert.equal(typeof snapshotUpsert.binds[11], 'number');

        assert.deepEqual(getDetailReasons(db), ['failed']);
    });
});
