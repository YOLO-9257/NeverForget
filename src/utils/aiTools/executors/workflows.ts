import { Env, WorkflowAction, WorkflowCondition } from '../../../types';
import {
    createWorkflowRule,
    listWorkflowRules,
    updateWorkflowRule
} from '../../../handlers/workflowRules';
import {
    buildInternalUrl,
    createJsonRequest,
    isRecord,
    unwrapApiResponse
} from './shared';

function normalizeConditions(input: unknown, triggerInput: unknown): WorkflowCondition[] {
    const conditions: WorkflowCondition[] = [];

    if (Array.isArray(input)) {
        for (const condition of input) {
            if (isRecord(condition) &&
                typeof condition.field === 'string' &&
                typeof condition.operator === 'string' &&
                (typeof condition.value === 'string' || typeof condition.value === 'number')) {
                conditions.push(condition as WorkflowCondition);
            }
        }
    } else if (isRecord(input) &&
        typeof input.field === 'string' &&
        typeof input.operator === 'string' &&
        (typeof input.value === 'string' || typeof input.value === 'number')) {
        conditions.push(input as WorkflowCondition);
    }

    if (conditions.length > 0) {
        return conditions;
    }

    // 若模型只给了 trigger 描述，做一层最小映射，保证规则可创建
    if (isRecord(triggerInput)) {
        if (typeof triggerInput.subject_contains === 'string' && triggerInput.subject_contains.trim()) {
            conditions.push({
                field: 'subject',
                operator: 'contains',
                value: triggerInput.subject_contains.trim()
            });
        }
        if (typeof triggerInput.from_contains === 'string' && triggerInput.from_contains.trim()) {
            conditions.push({
                field: 'from',
                operator: 'contains',
                value: triggerInput.from_contains.trim()
            });
        }
        if (typeof triggerInput.content_contains === 'string' && triggerInput.content_contains.trim()) {
            conditions.push({
                field: 'content',
                operator: 'contains',
                value: triggerInput.content_contains.trim()
            });
        }
        if (typeof triggerInput.importance_gte === 'number') {
            conditions.push({
                field: 'importance',
                operator: 'gte',
                value: triggerInput.importance_gte
            });
        }
    }

    return conditions;
}

function normalizeActions(input: unknown): WorkflowAction[] {
    if (Array.isArray(input)) {
        return input
            .filter(action => isRecord(action) && typeof action.type === 'string')
            .map(action => action as WorkflowAction);
    }

    if (isRecord(input) && typeof input.type === 'string') {
        return [input as WorkflowAction];
    }

    return [];
}

async function resolveAccountId(input: unknown, env: Env, userKey: string): Promise<string> {
    if (typeof input === 'string' && input.trim()) {
        const account = await env.DB.prepare(`
            SELECT id FROM email_accounts WHERE id = ? AND user_key = ? LIMIT 1
        `).bind(input.trim(), userKey).first<{ id: string }>();
        if (account?.id) {
            return account.id;
        }
        throw new Error('指定的邮箱账户不存在或无权限');
    }

    const fallback = await env.DB.prepare(`
        SELECT id
        FROM email_accounts
        WHERE user_key = ?
        ORDER BY updated_at DESC
        LIMIT 1
    `).bind(userKey).first<{ id: string }>();

    if (!fallback?.id) {
        throw new Error('未找到可用的邮箱账户，请先创建邮箱账户');
    }

    return fallback.id;
}

function buildRuleName(args: Record<string, any>, conditions: WorkflowCondition[]): string {
    if (typeof args.name === 'string' && args.name.trim()) {
        return args.name.trim();
    }

    if (conditions.length > 0) {
        const first = conditions[0];
        return `自动化规则: ${first.field} ${first.operator} ${first.value}`;
    }

    return `自动化规则_${Date.now()}`;
}

export async function createAutomationRuleExecutor(
    args: Record<string, any>,
    env: Env,
    userKey: string
): Promise<any> {
    const accountId = await resolveAccountId(args.account_id, env, userKey);
    const conditions = normalizeConditions(args.check, args.trigger);
    const actions = normalizeActions(args.action ?? args.actions);

    if (conditions.length === 0) {
        throw new Error('缺少可用条件，请提供 check 或可映射的 trigger');
    }
    if (actions.length === 0) {
        throw new Error('缺少可用动作，请提供 action');
    }

    const body: Record<string, any> = {
        account_id: accountId,
        name: buildRuleName(args, conditions),
        description: typeof args.description === 'string' ? args.description : null,
        conditions,
        condition_logic: args.condition_logic === 'OR' ? 'OR' : 'AND',
        actions
    };

    if (typeof args.max_executions_per_day === 'number' && Number.isFinite(args.max_executions_per_day)) {
        body.max_executions_per_day = Math.max(1, Math.floor(args.max_executions_per_day));
    }
    if (typeof args.cooldown_minutes === 'number' && Number.isFinite(args.cooldown_minutes)) {
        body.cooldown_minutes = Math.max(0, Math.floor(args.cooldown_minutes));
    }

    const request = createJsonRequest(buildInternalUrl('/api/workflow/rules'), 'POST', body);
    const response = await createWorkflowRule(request, env, userKey);
    return unwrapApiResponse(response);
}

export async function listAutomationRulesExecutor(
    args: Record<string, any>,
    env: Env,
    userKey: string
): Promise<any> {
    const accountId = typeof args.account_id === 'string' && args.account_id.trim()
        ? args.account_id.trim()
        : undefined;
    const request = new Request(buildInternalUrl('/api/workflow/rules', { account_id: accountId }), {
        method: 'GET'
    });
    const response = await listWorkflowRules(request, env, userKey);
    return unwrapApiResponse(response);
}

export async function toggleAutomationRuleExecutor(
    args: Record<string, any>,
    env: Env,
    userKey: string
): Promise<any> {
    const id = String(args.id || '').trim();
    if (!id) {
        throw new Error('缺少规则 ID');
    }

    const enable = Boolean(args.enable);
    const request = createJsonRequest(
        buildInternalUrl(`/api/workflow/rules/${encodeURIComponent(id)}`),
        'PUT',
        { enabled: enable }
    );
    const response = await updateWorkflowRule(id, request, env, userKey);
    return unwrapApiResponse(response);
}
