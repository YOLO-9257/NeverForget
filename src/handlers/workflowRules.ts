/**
 * Phase 3.2: 邮件工作流系统 - 后端API
 */

import { Env, WorkflowRule, WorkflowCondition, WorkflowAction, WorkflowExecution } from '../types';
import { success, badRequest, notFound, serverError } from '../utils/response';

export async function listWorkflowRules(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const url = new URL(request.url);
        const accountId = url.searchParams.get('account_id');

        let query = `
            SELECT wr.*, ea.name as account_name
            FROM workflow_rules wr
            JOIN email_accounts ea ON wr.account_id = ea.id
            WHERE ea.user_key = ?
        `;
        const params: any[] = [userKey];

        if (accountId) {
            query += ` AND wr.account_id = ?`;
            params.push(accountId);
        }

        query += ` ORDER BY wr.created_at DESC`;

        const result = await env.DB.prepare(query).bind(...params).all<WorkflowRule & { account_name: string }>();

        return success({
            items: (result.results || []).map(rule => ({
                ...rule,
                conditions: JSON.parse(rule.conditions as unknown as string),
                actions: JSON.parse(rule.actions as unknown as string),
            })),
        });
    } catch (error) {
        console.error('获取工作流规则失败:', error);
        return serverError('获取工作流规则失败');
    }
}

export async function createWorkflowRule(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const body = await request.json<{
            account_id: string;
            name: string;
            description?: string;
            conditions: WorkflowCondition[];
            condition_logic?: 'AND' | 'OR';
            actions: WorkflowAction[];
            max_executions_per_day?: number;
            cooldown_minutes?: number;
        }>();

        const { account_id, name, conditions, actions } = body;

        if (!account_id || !name || !conditions || !actions) {
            return badRequest('缺少必要参数');
        }

        // 验证账户所有权
        const account = await env.DB.prepare(`
            SELECT id FROM email_accounts WHERE id = ? AND user_key = ?
        `).bind(account_id, userKey).first();

        if (!account) {
            return notFound('账户不存在');
        }

        const now = Date.now();
        const result = await env.DB.prepare(`
            INSERT INTO workflow_rules (
                account_id, name, description, conditions, condition_logic,
                actions, enabled, max_executions_per_day, cooldown_minutes,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            account_id,
            name,
            body.description || null,
            JSON.stringify(conditions),
            body.condition_logic || 'AND',
            JSON.stringify(actions),
            1,
            body.max_executions_per_day || 100,
            body.cooldown_minutes || 0,
            now,
            now
        ).run();

        return success({
            id: result.meta?.last_row_id,
            message: '工作流规则创建成功',
        });
    } catch (error) {
        console.error('创建工作流规则失败:', error);
        return serverError('创建工作流规则失败');
    }
}

export async function updateWorkflowRule(
    id: string,
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const body = await request.json<Partial<{
            name: string;
            description: string;
            conditions: WorkflowCondition[];
            condition_logic: 'AND' | 'OR';
            actions: WorkflowAction[];
            enabled: boolean;
            max_executions_per_day: number;
            cooldown_minutes: number;
        }>>();

        // 验证规则所有权
        const rule = await env.DB.prepare(`
            SELECT wr.* FROM workflow_rules wr
            JOIN email_accounts ea ON wr.account_id = ea.id
            WHERE wr.id = ? AND ea.user_key = ?
        `).bind(id, userKey).first<WorkflowRule>();

        if (!rule) {
            return notFound('工作流规则不存在');
        }

        const updates: string[] = [];
        const values: any[] = [];

        if (body.name !== undefined) {
            updates.push('name = ?');
            values.push(body.name);
        }
        if (body.description !== undefined) {
            updates.push('description = ?');
            values.push(body.description);
        }
        if (body.conditions !== undefined) {
            updates.push('conditions = ?');
            values.push(JSON.stringify(body.conditions));
        }
        if (body.condition_logic !== undefined) {
            updates.push('condition_logic = ?');
            values.push(body.condition_logic);
        }
        if (body.actions !== undefined) {
            updates.push('actions = ?');
            values.push(JSON.stringify(body.actions));
        }
        if (body.enabled !== undefined) {
            updates.push('enabled = ?');
            values.push(body.enabled ? 1 : 0);
        }
        if (body.max_executions_per_day !== undefined) {
            updates.push('max_executions_per_day = ?');
            values.push(body.max_executions_per_day);
        }
        if (body.cooldown_minutes !== undefined) {
            updates.push('cooldown_minutes = ?');
            values.push(body.cooldown_minutes);
        }

        updates.push('updated_at = ?');
        values.push(Date.now());
        values.push(id);

        await env.DB.prepare(`
            UPDATE workflow_rules SET ${updates.join(', ')} WHERE id = ?
        `).bind(...values).run();

        return success({ message: '工作流规则更新成功' });
    } catch (error) {
        console.error('更新工作流规则失败:', error);
        return serverError('更新工作流规则失败');
    }
}

export async function deleteWorkflowRule(
    id: string,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const rule = await env.DB.prepare(`
            SELECT wr.* FROM workflow_rules wr
            JOIN email_accounts ea ON wr.account_id = ea.id
            WHERE wr.id = ? AND ea.user_key = ?
        `).bind(id, userKey).first();

        if (!rule) {
            return notFound('工作流规则不存在');
        }

        await env.DB.prepare(`DELETE FROM workflow_rules WHERE id = ?`).bind(id).run();

        return success({ message: '工作流规则删除成功' });
    } catch (error) {
        console.error('删除工作流规则失败:', error);
        return serverError('删除工作流规则失败');
    }
}

export async function testWorkflowRule(
    id: string,
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const body = await request.json<{ email_id: string }>();
        const { email_id } = body;

        // 获取规则
        const rule = await env.DB.prepare(`
            SELECT wr.* FROM workflow_rules wr
            JOIN email_accounts ea ON wr.account_id = ea.id
            WHERE wr.id = ? AND ea.user_key = ?
        `).bind(id, userKey).first<WorkflowRule>();

        if (!rule) {
            return notFound('工作流规则不存在');
        }

        // 获取邮件
        const email = await env.DB.prepare(`
            SELECT fe.* FROM fetched_emails fe
            JOIN email_accounts ea ON fe.account_id = ea.id
            WHERE fe.id = ? AND ea.user_key = ?
        `).bind(email_id, userKey).first<{ from_address: string; subject: string; content: string; ai_importance_score?: number }>();

        if (!email) {
            return notFound('邮件不存在');
        }

        const conditions: WorkflowCondition[] = JSON.parse(rule.conditions as unknown as string);
        const actions: WorkflowAction[] = JSON.parse(rule.actions as unknown as string);

        // 测试匹配
        const matched = evaluateConditions(email, conditions, rule.condition_logic);

        return success({
            would_trigger: matched,
            matched_conditions: matched ? conditions.filter(c => evaluateSingleCondition(email, c)) : [],
            actions_to_execute: matched ? actions : [],
        });
    } catch (error) {
        console.error('测试工作流规则失败:', error);
        return serverError('测试工作流规则失败');
    }
}

export async function getWorkflowExecutions(
    request: Request,
    id: string,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);

        // 验证规则所有权
        const rule = await env.DB.prepare(`
            SELECT wr.* FROM workflow_rules wr
            JOIN email_accounts ea ON wr.account_id = ea.id
            WHERE wr.id = ? AND ea.user_key = ?
        `).bind(id, userKey).first();

        if (!rule) {
            return notFound('工作流规则不存在');
        }

        const result = await env.DB.prepare(`
            SELECT we.*, fe.subject as email_subject
            FROM workflow_executions we
            LEFT JOIN fetched_emails fe ON we.email_id = fe.id
            WHERE we.rule_id = ?
            ORDER BY we.triggered_at DESC
            LIMIT ?
        `).bind(id, limit).all<WorkflowExecution & { email_subject: string }>();

        return success({
            items: (result.results || []).map(exec => ({
                ...exec,
                actions_executed: JSON.parse(exec.actions_executed as unknown as string),
            })),
        });
    } catch (error) {
        console.error('获取工作流执行记录失败:', error);
        return serverError('获取工作流执行记录失败');
    }
}

// 辅助函数：评估条件
function evaluateConditions(
    email: { from_address: string; subject: string; content: string; ai_importance_score?: number },
    conditions: WorkflowCondition[],
    logic: string
): boolean {
    if (conditions.length === 0) return true;

    const results = conditions.map(c => evaluateSingleCondition(email, c));

    if (logic === 'OR') {
        return results.some(r => r);
    }
    return results.every(r => r);
}

function evaluateSingleCondition(
    email: { from_address: string; subject: string; content: string; ai_importance_score?: number },
    condition: WorkflowCondition
): boolean {
    let value: string | number;

    switch (condition.field) {
        case 'from':
            value = email.from_address;
            break;
        case 'subject':
            value = email.subject;
            break;
        case 'content':
            value = email.content;
            break;
        case 'importance':
            value = email.ai_importance_score || 0;
            break;
        default:
            return false;
    }

    switch (condition.operator) {
        case 'contains':
            return String(value).toLowerCase().includes(String(condition.value).toLowerCase());
        case 'equals':
            return String(value).toLowerCase() === String(condition.value).toLowerCase();
        case 'starts_with':
            return String(value).toLowerCase().startsWith(String(condition.value).toLowerCase());
        case 'ends_with':
            return String(value).toLowerCase().endsWith(String(condition.value).toLowerCase());
        case 'not_contains':
            return !String(value).toLowerCase().includes(String(condition.value).toLowerCase());
        case 'gt':
            return Number(value) > Number(condition.value);
        case 'lt':
            return Number(value) < Number(condition.value);
        case 'gte':
            return Number(value) >= Number(condition.value);
        case 'lte':
            return Number(value) <= Number(condition.value);
        default:
            return false;
    }
}
