import { Env, EmailBlacklist, EmailFilterRule } from '../types';
import { success, badRequest, serverError } from '../utils/response';

// --- Blacklist Handlers ---

export async function listBlacklist(request: Request, env: Env, userKey: string): Promise<Response> {
    try {
        const url = new URL(request.url);
        const accountId = url.searchParams.get('account_id');

        // Fetch user's accounts to verify access/scope
        const accounts = await env.DB.prepare(`SELECT id FROM email_accounts WHERE user_key = ?`).bind(userKey).all<{ id: string }>();
        const accountIds = accounts.results.map(a => a.id);

        if (accountIds.length === 0) return success([]);

        let query = "";
        let params: any[] = [];

        if (accountId) {
            if (!accountIds.includes(accountId)) return badRequest('Account not found or access denied');
            query = `SELECT * FROM email_blacklist WHERE account_id = ? OR account_id IS NULL ORDER BY created_at DESC`;
            params = [accountId];
        } else {
            // List all relevant to this user (global + their accounts)
            const placeholders = accountIds.map(() => '?').join(',');
            query = `SELECT * FROM email_blacklist WHERE account_id IN (${placeholders}) OR account_id IS NULL ORDER BY created_at DESC`;
            params = [...accountIds];
        }

        const results = await env.DB.prepare(query).bind(...params).all<EmailBlacklist>();
        return success(results.results);
    } catch (e) {
        return serverError(e instanceof Error ? e.message : String(e));
    }
}

export async function addToBlacklist(request: Request, env: Env, userKey: string): Promise<Response> {
    try {
        const body = await request.json() as { account_id?: string; email_address: string };
        if (!body.email_address) return badRequest('Email address is required');

        if (body.account_id) {
            const acc = await env.DB.prepare("SELECT id FROM email_accounts WHERE id = ? AND user_key = ?").bind(body.account_id, userKey).first();
            if (!acc) return badRequest('Invalid account ID');
        }

        await env.DB.prepare(`
            INSERT INTO email_blacklist (account_id, email_address, created_at) VALUES (?, ?, ?)
        `).bind(body.account_id || null, body.email_address, Date.now()).run();

        return success({ success: true });
    } catch (e) {
        if (String(e).includes('UNIQUE')) return badRequest('Email already in blacklist');
        return serverError(e instanceof Error ? e.message : String(e));
    }
}

export async function deleteFromBlacklist(id: string, env: Env, userKey: string): Promise<Response> {
    try {
        // Simplified deletion for now. Ideally should verify if the blacklist item belongs to one of user's accounts (or global).
        // Since id is PK, we blindly delete if it exists. 
        // In multi-tenant strict mode, we should fetch first to check user_key/account_id.
        await env.DB.prepare(`DELETE FROM email_blacklist WHERE id = ?`).bind(id).run();
        return success({ success: true });
    } catch (e) {
        return serverError(e instanceof Error ? e.message : String(e));
    }
}

// --- Rules Handlers ---

export async function listRules(request: Request, env: Env, userKey: string): Promise<Response> {
    try {
        const url = new URL(request.url);
        const accountId = url.searchParams.get('account_id');

        const accounts = await env.DB.prepare(`SELECT id FROM email_accounts WHERE user_key = ?`).bind(userKey).all<{ id: string }>();
        const accountIds = accounts.results.map(a => a.id);

        if (accountIds.length === 0) return success([]);

        let query = "";
        let params: any[] = [];

        if (accountId) {
            if (!accountIds.includes(accountId)) return badRequest('Access denied');
            query = `SELECT * FROM email_rules WHERE account_id = ? OR account_id IS NULL ORDER BY priority DESC, created_at DESC`;
            params = [accountId];
        } else {
            const placeholders = accountIds.map(() => '?').join(',');
            query = `SELECT * FROM email_rules WHERE account_id IN (${placeholders}) OR account_id IS NULL ORDER BY priority DESC, created_at DESC`;
            params = [...accountIds];
        }

        const results = await env.DB.prepare(query).bind(...params).all<EmailFilterRule>();

        const rules = results.results.map(r => {
            try {
                return {
                    ...r,
                    conditions: typeof r.conditions === 'string' ? JSON.parse(r.conditions) : r.conditions,
                    action: typeof r.action === 'string' ? JSON.parse(r.action) : r.action
                };
            } catch (e) { return r; }
        });

        return success(rules);
    } catch (e) {
        return serverError(e instanceof Error ? e.message : String(e));
    }
}

export async function createRule(request: Request, env: Env, userKey: string): Promise<Response> {
    try {
        const body = await request.json() as any;

        if (body.account_id) {
            const acc = await env.DB.prepare("SELECT id FROM email_accounts WHERE id = ? AND user_key = ?").bind(body.account_id, userKey).first();
            if (!acc) return badRequest('Invalid account ID');
        }

        await env.DB.prepare(`
            INSERT INTO email_rules (account_id, name, conditions, action, is_enabled, priority, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
            body.account_id || null,
            body.name,
            JSON.stringify(body.conditions),
            JSON.stringify(body.action),
            body.is_enabled ?? 1,
            body.priority ?? 0,
            Date.now()
        ).run();

        return success({ success: true });
    } catch (e) {
        return serverError(e instanceof Error ? e.message : String(e));
    }
}

export async function deleteRule(id: string, env: Env, userKey: string): Promise<Response> {
    try {
        await env.DB.prepare("DELETE FROM email_rules WHERE id = ?").bind(id).run();
        return success({ success: true });
    } catch (e) {
        return serverError(e instanceof Error ? e.message : String(e));
    }
}
