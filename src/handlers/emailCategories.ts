/**
 * Phase 1.1: 智能邮件分类系统 - 后端API
 * 
 * 功能：
 * - 分类规则的 CRUD 操作
 * - 邮件自动分类
 * - 分类统计
 */

import { Env, EmailCategory, EmailCategoryDefault, CategoryConditions } from '../types';
import { success, badRequest, notFound, serverError } from '../utils/response';

/**
 * 获取分类列表
 */
export async function listCategories(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const url = new URL(request.url);
        const accountId = url.searchParams.get('account_id');

        let query = `
            SELECT c.*, COUNT(fe.id) as email_count
            FROM email_categories c
            LEFT JOIN fetched_emails fe ON fe.category_id = c.id
            WHERE c.id IN (
                SELECT id FROM email_categories 
                WHERE account_id IN (
                    SELECT id FROM email_accounts WHERE user_key = ?
                )
            )
        `;
        const params: any[] = [userKey];

        if (accountId) {
            query += ` AND c.account_id = ?`;
            params.push(accountId);
        }

        query += ` GROUP BY c.id ORDER BY c.created_at DESC`;

        const result = await env.DB.prepare(query).bind(...params).all<EmailCategory & { email_count: number }>();

        return success({
            items: (result.results || []).map(cat => ({
                ...cat,
                conditions: JSON.parse(cat.conditions as unknown as string),
            })),
        });
    } catch (error) {
        console.error('获取分类列表失败:', error);
        return serverError('获取分类列表失败');
    }
}

/**
 * 创建分类
 */
export async function createCategory(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const body = await request.json<{
            account_id: string;
            name: string;
            color?: string;
            icon?: string;
            conditions: CategoryConditions;
            auto_archive?: boolean;
            auto_mark_as_read?: boolean;
            notify_on_match?: boolean;
        }>();

        const { account_id, name, conditions } = body;

        if (!account_id || !name || !conditions) {
            return badRequest('缺少必要参数: account_id, name, conditions');
        }

        // 验证账户所有权
        const account = await env.DB.prepare(
            `SELECT id FROM email_accounts WHERE id = ? AND user_key = ?`
        ).bind(account_id, userKey).first<{ id: string }>();

        if (!account) {
            return notFound('账户不存在或无权限');
        }

        const now = Date.now();
        const result = await env.DB.prepare(`
            INSERT INTO email_categories (
                account_id, name, color, icon, conditions,
                auto_archive, auto_mark_as_read, notify_on_match,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            account_id,
            name,
            body.color || '#3498db',
            body.icon || '📁',
            JSON.stringify(conditions),
            body.auto_archive ? 1 : 0,
            body.auto_mark_as_read ? 1 : 0,
            body.notify_on_match !== false ? 1 : 0,
            now,
            now
        ).run();

        if (!result.success) {
            return serverError('创建分类失败');
        }

        return success({
            id: result.meta?.last_row_id,
            message: '分类创建成功',
        });
    } catch (error) {
        console.error('创建分类失败:', error);
        return serverError('创建分类失败');
    }
}

/**
 * 更新分类
 */
export async function updateCategory(
    id: string,
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const body = await request.json<Partial<{
            name: string;
            color: string;
            icon: string;
            conditions: CategoryConditions;
            auto_archive: boolean;
            auto_mark_as_read: boolean;
            notify_on_match: boolean;
        }>>();

        // 验证分类所有权
        const category = await env.DB.prepare(`
            SELECT c.* FROM email_categories c
            JOIN email_accounts ea ON c.account_id = ea.id
            WHERE c.id = ? AND ea.user_key = ?
        `).bind(id, userKey).first<EmailCategory>();

        if (!category) {
            return notFound('分类不存在');
        }

        const updates: string[] = [];
        const values: any[] = [];

        if (body.name !== undefined) {
            updates.push('name = ?');
            values.push(body.name);
        }
        if (body.color !== undefined) {
            updates.push('color = ?');
            values.push(body.color);
        }
        if (body.icon !== undefined) {
            updates.push('icon = ?');
            values.push(body.icon);
        }
        if (body.conditions !== undefined) {
            updates.push('conditions = ?');
            values.push(JSON.stringify(body.conditions));
        }
        if (body.auto_archive !== undefined) {
            updates.push('auto_archive = ?');
            values.push(body.auto_archive ? 1 : 0);
        }
        if (body.auto_mark_as_read !== undefined) {
            updates.push('auto_mark_as_read = ?');
            values.push(body.auto_mark_as_read ? 1 : 0);
        }
        if (body.notify_on_match !== undefined) {
            updates.push('notify_on_match = ?');
            values.push(body.notify_on_match ? 1 : 0);
        }

        updates.push('updated_at = ?');
        values.push(Date.now());
        values.push(id);

        await env.DB.prepare(`
            UPDATE email_categories 
            SET ${updates.join(', ')} 
            WHERE id = ?
        `).bind(...values).run();

        return success({ message: '分类更新成功' });
    } catch (error) {
        console.error('更新分类失败:', error);
        return serverError('更新分类失败');
    }
}

/**
 * 删除分类
 */
export async function deleteCategory(
    id: string,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        // 验证分类所有权
        const category = await env.DB.prepare(`
            SELECT c.* FROM email_categories c
            JOIN email_accounts ea ON c.account_id = ea.id
            WHERE c.id = ? AND ea.user_key = ?
        `).bind(id, userKey).first<EmailCategory>();

        if (!category) {
            return notFound('分类不存在');
        }

        // 将关联邮件的分类置空
        await env.DB.prepare(`
            UPDATE fetched_emails SET category_id = NULL WHERE category_id = ?
        `).bind(id).run();

        await env.DB.prepare(`DELETE FROM email_categories WHERE id = ?`).bind(id).run();

        return success({ message: '分类删除成功' });
    } catch (error) {
        console.error('删除分类失败:', error);
        return serverError('删除分类失败');
    }
}

/**
 * 获取默认分类列表
 */
export async function listDefaultCategories(env: Env): Promise<Response> {
    try {
        const result = await env.DB.prepare(`
            SELECT * FROM email_category_defaults ORDER BY sort_order ASC
        `).all<EmailCategoryDefault>();

        return success({
            items: (result.results || []).map(cat => ({
                ...cat,
                conditions_template: cat.conditions_template ? JSON.parse(cat.conditions_template as string) as CategoryConditions : undefined,
            })),
        });
    } catch (error) {
        console.error('获取默认分类失败:', error);
        return serverError('获取默认分类失败');
    }
}

/**
 * 邮件自动分类
 */
export async function autoClassifyEmail(
    env: Env,
    emailId: string,
    accountId: string
): Promise<{ categoryId: number | null; matchedRule: EmailCategory | null }> {
    try {
        // 获取邮件详情
        const email = await env.DB.prepare(`
            SELECT * FROM fetched_emails WHERE id = ?
        `).bind(emailId).first<{ id: string; from_address: string; subject: string; content: string }>();

        if (!email) {
            return { categoryId: null, matchedRule: null };
        }

        // 获取账户的分类规则
        const categoriesResult = await env.DB.prepare(`
            SELECT * FROM email_categories 
            WHERE account_id = ? AND enabled = 1
            ORDER BY priority DESC, created_at ASC
        `).bind(accountId).all<EmailCategory>();

        const categories = (categoriesResult.results || []).map(cat => ({
            ...cat,
            conditions: JSON.parse(cat.conditions as unknown as string) as CategoryConditions,
        }));

        // 逐个匹配规则
        for (const category of categories) {
            if (matchesConditions(email, category.conditions as CategoryConditions)) {
                // 更新邮件分类
                await env.DB.prepare(`
                    UPDATE fetched_emails 
                    SET category_id = ?, updated_at = ? 
                    WHERE id = ?
                `).bind(category.id, Date.now(), emailId).run();

                // 更新匹配计数
                await env.DB.prepare(`
                    UPDATE email_categories 
                    SET match_count = match_count + 1 
                    WHERE id = ?
                `).bind(category.id).run();

                return { categoryId: category.id, matchedRule: category };
            }
        }

        return { categoryId: null, matchedRule: null };
    } catch (error) {
        console.error('自动分类邮件失败:', error);
        return { categoryId: null, matchedRule: null };
    }
}

/**
 * 检查邮件是否匹配分类条件
 */
function matchesConditions(
    email: { from_address: string; subject: string; content: string },
    conditions: CategoryConditions
): boolean {
    // 检查发件人
    if (conditions.sender_contains && conditions.sender_contains.length > 0) {
        const matched = conditions.sender_contains.some(keyword =>
            email.from_address.toLowerCase().includes(keyword.toLowerCase())
        );
        if (!matched) return false;
    }

    // 检查主题
    if (conditions.subject_contains && conditions.subject_contains.length > 0) {
        const matched = conditions.subject_contains.some(keyword =>
            email.subject.toLowerCase().includes(keyword.toLowerCase())
        );
        if (!matched) return false;
    }

    // 检查正文
    if (conditions.body_contains && conditions.body_contains.length > 0) {
        const matched = conditions.body_contains.some(keyword =>
            email.content.toLowerCase().includes(keyword.toLowerCase())
        );
        if (!matched) return false;
    }

    return true;
}

/**
 * 批量分类邮件
 */
export async function batchClassifyEmails(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const body = await request.json<{
            email_ids: string[];
            category_id: number;
        }>();

        const { email_ids, category_id } = body;

        if (!email_ids || !Array.isArray(email_ids) || email_ids.length === 0) {
            return badRequest('缺少必要参数: email_ids');
        }

        // 验证分类所有权
        const category = await env.DB.prepare(`
            SELECT c.* FROM email_categories c
            JOIN email_accounts ea ON c.account_id = ea.id
            WHERE c.id = ? AND ea.user_key = ?
        `).bind(category_id, userKey).first<EmailCategory>();

        if (!category) {
            return notFound('分类不存在');
        }

        // 构建 IN 查询
        const placeholders = email_ids.map(() => '?').join(',');
        
        // 验证邮件所有权
        const emailCheck = await env.DB.prepare(`
            SELECT COUNT(*) as count FROM fetched_emails fe
            JOIN email_accounts ea ON fe.account_id = ea.id
            WHERE fe.id IN (${placeholders}) AND ea.user_key = ?
        `).bind(...email_ids, userKey).first<{ count: number }>();

        if (emailCheck?.count !== email_ids.length) {
            return badRequest('部分邮件不存在或无权限');
        }

        // 批量更新
        await env.DB.prepare(`
            UPDATE fetched_emails 
            SET category_id = ?, updated_at = ? 
            WHERE id IN (${placeholders})
        `).bind(category_id, Date.now(), ...email_ids).run();

        return success({
            message: `成功更新 ${email_ids.length} 封邮件的分类`,
            updated_count: email_ids.length,
        });
    } catch (error) {
        console.error('批量分类邮件失败:', error);
        return serverError('批量分类邮件失败');
    }
}

/**
 * 获取分类统计
 */
export async function getCategoryStats(
    request: Request,
    env: Env,
    userKey: string
): Promise<Response> {
    try {
        const url = new URL(request.url);
        const accountId = url.searchParams.get('account_id');

        let query = `
            SELECT 
                c.id,
                c.name,
                c.color,
                c.icon,
                COUNT(fe.id) as email_count,
                COUNT(CASE WHEN fe.is_pushed = 0 THEN 1 END) as unread_count,
                MAX(fe.received_at) as last_email_at
            FROM email_categories c
            JOIN email_accounts ea ON c.account_id = ea.id
            LEFT JOIN fetched_emails fe ON fe.category_id = c.id
            WHERE ea.user_key = ?
        `;
        const params: any[] = [userKey];

        if (accountId) {
            query += ` AND c.account_id = ?`;
            params.push(accountId);
        }

        query += ` GROUP BY c.id ORDER BY email_count DESC`;

        const result = await env.DB.prepare(query).bind(...params).all();

        // 获取总计
        const totalResult = await env.DB.prepare(`
            SELECT COUNT(*) as total FROM fetched_emails fe
            JOIN email_accounts ea ON fe.account_id = ea.id
            WHERE ea.user_key = ?
            ${accountId ? 'AND fe.account_id = ?' : ''}
        `).bind(...(accountId ? [userKey, accountId] : [userKey])).first<{ total: number }>();

        return success({
            categories: result.results || [],
            total_emails: totalResult?.total || 0,
        });
    } catch (error) {
        console.error('获取分类统计失败:', error);
        return serverError('获取分类统计失败');
    }
}

/**
 * 使用默认分类初始化账户
 */
export async function initDefaultCategories(
    env: Env,
    accountId: string
): Promise<void> {
    try {
        const defaults = await env.DB.prepare(`
            SELECT * FROM email_category_defaults ORDER BY sort_order ASC
        `).all<EmailCategoryDefault>();

        const now = Date.now();

        for (const def of defaults.results || []) {
            await env.DB.prepare(`
                INSERT INTO email_categories (
                    account_id, name, color, icon, conditions,
                    auto_archive, auto_mark_as_read, notify_on_match,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                accountId,
                def.name,
                def.color,
                def.icon,
                def.conditions_template || '{}',
                0,
                0,
                1,
                now,
                now
            ).run();
        }
    } catch (error) {
        console.error('初始化默认分类失败:', error);
    }
}
