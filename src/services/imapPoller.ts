/**
 * IMAP 邮件轮询服务
 * @author zhangws
 * 
 * 负责定期检查配置了 IMAP 的用户邮箱，拉取新邮件并推送通知
 */

import { Env, EmailSettings, ForwardRules, EmailData, EmailFilterRule, AiFilterConfig } from '../types';
import { fetchNewEmails, EmailSummary, ImapConfig } from './ImapClient';
import { decryptPassword } from '../utils/crypto';
import { shouldForwardEmail, forwardEmailToPush, logAndFinishForward, checkAiSpam, PushSummaryContext } from './emailService';
import { resolveAiConfigForAccount } from './aiConfigResolver';
import { getOrGenerateEmailSummaryById } from '../handlers/emailAiSummary';

/**
 * IMAP 轮询结果
 */
interface PollResult {
    userKey: string;
    success: boolean;
    emailsFound: number;
    emailsPushed: number;
    error?: string;
}

/**
 * 执行 IMAP 邮件轮询
 * 遍历所有启用了 IMAP 的用户，拉取新邮件并推送
 */
export async function runImapPolling(env: Env): Promise<PollResult[]> {
    console.log('[IMAP Poller] 开始执行 IMAP 邮件轮询...');

    const results: PollResult[] = [];

    try {
        // 查询所有启用了 IMAP 的用户设置
        const settingsResult = await env.DB.prepare(`
            SELECT * FROM user_email_settings 
            WHERE enable_imap = 1 
              AND imap_host IS NOT NULL 
              AND imap_user IS NOT NULL 
              AND imap_password IS NOT NULL
            LIMIT 50
        `).all<EmailSettings>();

        const settings = settingsResult.results || [];

        if (settings.length === 0) {
            console.log('[IMAP Poller] 没有启用 IMAP 的用户');
            return results;
        }

        console.log(`[IMAP Poller] 找到 ${settings.length} 个启用了 IMAP 的用户`);

        // 顺序处理每个用户（避免并发过多连接）
        for (const userSettings of settings) {
            const result = await pollUserMailbox(userSettings, env);
            results.push(result);

            // 短暂延迟，避免过快请求
            await sleep(500);
        }

    } catch (error) {
        console.error('[IMAP Poller] 轮询过程中发生错误:', error);
    }

    console.log(`[IMAP Poller] 轮询完成，处理了 ${results.length} 个用户`);
    return results;
}

/**
 * 轮询单个用户的邮箱
 */
async function pollUserMailbox(settings: EmailSettings, env: Env): Promise<PollResult> {
    const userKey = settings.user_key;
    console.log(`[IMAP Poller] 处理用户: ${userKey}`);

    try {
        // 更新同步状态为进行中
        await updateSyncStatus(env, userKey, 'syncing', null);

        // 解密 IMAP 密码
        const secret = env.ENCRYPTION_KEY || env.API_KEYS;
        const password = await decryptPassword(settings.imap_password!, secret);

        if (!password) {
            throw new Error('无法解密 IMAP 密码');
        }

        // 构建 IMAP 配置
        const imapConfig: ImapConfig = {
            host: settings.imap_host!,
            port: settings.imap_port || 993,
            user: settings.imap_user!,
            password: password,
            tls: settings.imap_tls === 1,
        };

        // 解析规则获取上次同步的最大 UID
        let lastUid = 0;
        let rules: ForwardRules = {};
        if (settings.forward_rules) {
            try {
                rules = JSON.parse(settings.forward_rules);
                lastUid = rules.last_uid || 0;
            } catch (e) {
                // 忽略解析错误
            }
        }

        // 拉取新邮件
        const { emails, maxUid, error } = await fetchNewEmails(imapConfig, lastUid, 10);

        if (error) {
            throw new Error(error);
        }

        console.log(`[IMAP Poller] 用户 ${userKey} 拉取到 ${emails.length} 封新邮件`);

        // 过滤并推送邮件通知
        let pushedCount = 0;
        for (const email of emails) {
            const emailData: EmailData = {
                from: email.from,
                subject: email.subject,
                content: email.preview || '(无预览)',
                received_at: Date.parse(email.date) || Date.now(),
                uid: email.uid
            };

            // 1. 规则检查
            if (!shouldForwardEmail(emailData, rules)) {
                console.log(`[IMAP Poller] 邮件被过滤规则拦截: ${email.subject}`);
                continue;
            }

            // 2. 发送推送
            const pushResult = await forwardEmailToPush(env, settings, emailData);

            // 3. 记录日志 (由 EmailService 处理)
            await logAndFinishForward(
                env,
                userKey,
                emailData,
                pushResult.success,
                pushResult.response,
                pushResult.error
            );

            if (pushResult.success) {
                pushedCount++;
            }
        }

        // 更新同步状态和最大 UID
        await updateSyncSuccess(env, userKey, maxUid, pushedCount);

        return {
            userKey,
            success: true,
            emailsFound: emails.length,
            emailsPushed: pushedCount,
        };

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : '未知错误';
        console.error(`[IMAP Poller] 用户 ${userKey} 处理失败:`, errorMsg);

        // 更新同步状态为错误
        await updateSyncStatus(env, userKey, 'error', errorMsg);

        return {
            userKey,
            success: false,
            emailsFound: 0,
            emailsPushed: 0,
            error: errorMsg,
        };
    }
}

/**
 * 更新同步状态
 */
async function updateSyncStatus(
    env: Env,
    userKey: string,
    status: string,
    error: string | null
): Promise<void> {
    try {
        await env.DB.prepare(`
            UPDATE user_email_settings 
            SET sync_status = ?, sync_error = ?, updated_at = ?
            WHERE user_key = ?
        `).bind(status, error, Date.now(), userKey).run();
    } catch (e) {
        console.error('[IMAP Poller] 更新同步状态失败:', e);
    }
}

/**
 * 更新同步成功后的状态
 */
async function updateSyncSuccess(
    env: Env,
    userKey: string,
    maxUid: number,
    emailCount: number
): Promise<void> {
    try {
        const now = Date.now();

        // 获取现有的 forward_rules
        const existing = await env.DB.prepare(`
            SELECT forward_rules, total_forwarded FROM user_email_settings WHERE user_key = ?
        `).bind(userKey).first<{ forward_rules: string | null; total_forwarded: number }>();

        // 更新 last_uid 到 forward_rules
        let rules: any = {};
        if (existing?.forward_rules) {
            try {
                rules = JSON.parse(existing.forward_rules);
            } catch (e) {
                // 忽略
            }
        }
        rules.last_uid = maxUid;

        await env.DB.prepare(`
            UPDATE user_email_settings 
            SET sync_status = 'idle', 
                sync_error = NULL, 
                last_sync_at = ?,
                forward_rules = ?,
                updated_at = ?
            WHERE user_key = ?
        `).bind(
            now,
            JSON.stringify(rules),
            now,
            userKey
        ).run();

        // 注意：统计更新已在 logAndFinishForward 中处理，这里不再重复累加 total_forwarded
    } catch (e) {
        console.error('[IMAP Poller] 更新同步成功状态失败:', e);
    }
}

/**
 * 工具函数：延迟
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 将邮件加入 AI 摘要处理队列
 * - 新邮件：创建 pending 任务
 * - 失败任务：重置为 pending 便于重试
 * - 处理中/已完成：保持现状，避免打断正在处理的任务
 */
async function queueEmailSummaryJob(env: Env, emailId: number, priority: number = 0): Promise<void> {
    const now = Date.now();
    try {
        await env.DB.prepare(`
            INSERT INTO ai_processing_queue (
                email_id, priority, status, retry_count, error_message, created_at
            ) VALUES (?, ?, 'pending', 0, NULL, ?)
            ON CONFLICT(email_id) DO UPDATE SET
                priority = CASE
                    WHEN ai_processing_queue.status = 'pending' AND excluded.priority > ai_processing_queue.priority
                    THEN excluded.priority
                    ELSE ai_processing_queue.priority
                END,
                status = CASE
                    WHEN ai_processing_queue.status = 'failed' THEN 'pending'
                    ELSE ai_processing_queue.status
                END,
                retry_count = CASE
                    WHEN ai_processing_queue.status = 'failed' THEN 0
                    ELSE ai_processing_queue.retry_count
                END,
                error_message = CASE
                    WHEN ai_processing_queue.status = 'failed' THEN NULL
                    ELSE ai_processing_queue.error_message
                END,
                created_at = CASE
                    WHEN ai_processing_queue.status = 'failed' THEN excluded.created_at
                    ELSE ai_processing_queue.created_at
                END
        `).bind(String(emailId), priority, now).run();
    } catch (error) {
        console.warn(`[IMAP Poller] 添加摘要任务失败 (email_id=${emailId})`, error);
    }
}

const DEFAULT_ADS_KEEP_IMPORTANCE_THRESHOLD = 0.75;

function normalizeAdsKeepImportanceThreshold(raw: unknown): number {
    const numeric = typeof raw === 'number'
        ? raw
        : (typeof raw === 'string' ? Number.parseFloat(raw) : Number.NaN);
    if (!Number.isFinite(numeric)) {
        return DEFAULT_ADS_KEEP_IMPORTANCE_THRESHOLD;
    }
    return Math.min(1, Math.max(0, numeric));
}

function parseAccountAiFilterConfig(raw: unknown): AiFilterConfig {
    if (typeof raw === 'string' && raw.trim()) {
        try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            return {
                ads_keep_importance_threshold: normalizeAdsKeepImportanceThreshold(parsed.ads_keep_importance_threshold),
            };
        } catch {
            return {
                ads_keep_importance_threshold: DEFAULT_ADS_KEEP_IMPORTANCE_THRESHOLD,
            };
        }
    }

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const parsed = raw as Record<string, unknown>;
        return {
            ads_keep_importance_threshold: normalizeAdsKeepImportanceThreshold(parsed.ads_keep_importance_threshold),
        };
    }

    return {
        ads_keep_importance_threshold: DEFAULT_ADS_KEEP_IMPORTANCE_THRESHOLD,
    };
}

/**
 * 邮箱同步结果
 */
export interface SyncResult {
    success: boolean;
    emailsFound: number;
    emailsForwarded: number;
    error?: string;
    duration?: number;
}

/**
 * 按账户ID同步邮箱
 * 用于任务化调度的邮箱同步（type='email_sync'）
 */
export async function syncEmailAccount(env: Env, accountId: string): Promise<SyncResult> {
    const startTime = Date.now();

    console.log(`[IMAP Poller] 按账户同步: ${accountId}`);

    try {
        // 从 email_accounts 表读取账户配置
        const account = await env.DB.prepare(`
            SELECT * FROM email_accounts WHERE id = ? AND enabled = 1
        `).bind(accountId).first<any>();

        if (!account) {
            return {
                success: false,
                emailsFound: 0,
                emailsForwarded: 0,
                error: '账户不存在或已禁用',
                duration: Date.now() - startTime
            };
        }

        // 检查是否正在同步（并发锁）
        if (account.sync_status === 'syncing') {
            return {
                success: false,
                emailsFound: 0,
                emailsForwarded: 0,
                error: '该账户正在同步中',
                duration: Date.now() - startTime
            };
        }

        // 更新状态为同步中
        await env.DB.prepare(`
            UPDATE email_accounts SET sync_status = 'syncing', updated_at = ? WHERE id = ?
        `).bind(Date.now(), accountId).run();

        // 解密密码
        const secret = env.ENCRYPTION_KEY || env.API_KEYS;
        const password = await decryptPassword(account.imap_password, secret);

        if (!password) {
            throw new Error('无法解密 IMAP 密码');
        }

        // 构建 IMAP 配置
        const imapConfig: ImapConfig = {
            host: account.imap_host,
            port: account.imap_port || 993,
            user: account.imap_user,
            password: password,
            tls: account.imap_tls === 1,
        };

        // 解析过滤规则和 last_uid
        let lastUid = 0;
        let rules: ForwardRules = {};
        if (account.filter_rules) {
            try {
                rules = JSON.parse(account.filter_rules);
                lastUid = rules.last_uid || 0;
            } catch (e) { /* ignore */ }
        }

        // 优先使用账户绑定 AI 模型；无可用配置时回退用户默认模型和环境变量
        const aiConfig = await resolveAiConfigForAccount(env, account.user_key, account.id);
        const aiFilterConfig = parseAccountAiFilterConfig(account.ai_filter_config);

        // Fetch Security Rules (Blacklist & Custom Rules)
        // Global blacklist (account_id IS NULL) + Account specific
        const blacklistRows = await env.DB.prepare(`
            SELECT email_address FROM email_blacklist WHERE account_id = ? OR account_id IS NULL
        `).bind(accountId).all<{ email_address: string }>();
        const blacklistSet = new Set(blacklistRows.results.map(r => r.email_address));

        const rulesRows = await env.DB.prepare(`
            SELECT * FROM email_rules WHERE (account_id = ? OR account_id IS NULL) AND is_enabled = 1 ORDER BY priority DESC
        `).bind(accountId).all<EmailFilterRule>();

        const customRules = rulesRows.results.map(r => {
            try {
                return {
                    ...r,
                    conditions: typeof r.conditions === 'string' ? JSON.parse(r.conditions) : r.conditions,
                    action: typeof r.action === 'string' ? JSON.parse(r.action) : r.action
                };
            } catch (e) { return null; }
        }).filter(r => r !== null);

        // 拉取新邮件
        const { emails, maxUid, error } = await fetchNewEmails(imapConfig, lastUid, 20);

        if (error) {
            throw new Error(error);
        }

        console.log(`[IMAP Poller] 账户 ${accountId} 拉取到 ${emails.length} 封新邮件`);

        // 过滤并推送邮件
        let forwardedCount = 0;
        const autoPush = account.auto_push !== 0; // 默认为 1 (开启)
        const requiresInlineSummary = account.enable_ai_spam_filter === 1 || autoPush;

        for (const email of emails) {
            const emailData: EmailData = {
                from: email.from,
                subject: email.subject,
                content: email.content || email.preview || '(无内容)',
                received_at: Date.parse(email.date) || Date.now(),
                uid: email.uid,
            };
            // Extend data with messageId (not in EmailData interface yet)
            const extendedData = { ...emailData, messageId: email.messageId };

            // 0. 保存到本地数据库 (fetched_emails)
            const messageId = extendedData.messageId || null;
            let savedId: number | null = null;
            let isDuplicate = false;
            let shouldQueueSummary = false;

            try {
                // 尝试插入，利用 (account_id, message_id) 唯一索引去重
                // 如果没有 Message-ID，则回退到 (account_id, uid) 去重 (由表定义保证或业务逻辑保证)
                // 这里我们优先使用 Message-ID

                // 首先检查是否存在相同的 Message-ID (仅当 Message-ID 存在时)
                if (messageId) {
                    const existing = await env.DB.prepare(`
                        SELECT id, ai_summary FROM fetched_emails WHERE account_id = ? AND message_id = ?
                    `).bind(accountId, messageId).first<{ id: number; ai_summary?: string | null }>();

                    if (existing) {
                        // console.log(`[IMAP Poller] 邮件已存在 (Message-ID): ${email.subject}`);
                        savedId = existing.id;
                        isDuplicate = true;
                        shouldQueueSummary = !existing.ai_summary;
                    }
                }

                // 如果按 Message-ID 没找到，尝试插入 (UID 可能会冲突，由 ON CONFLICT 处理)
                if (!savedId) {
                    const result = await env.DB.prepare(`
                        INSERT INTO fetched_emails (
                            account_id, uid, message_id, from_address, subject, content, 
                            received_at, fetched_at, is_pushed, push_status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending')
                        ON CONFLICT(account_id, uid) DO UPDATE SET fetched_at = excluded.fetched_at
                        RETURNING id
                    `).bind(
                        accountId,
                        email.uid,
                        messageId,
                        emailData.from,
                        emailData.subject,
                        emailData.content,
                        emailData.received_at,
                        Date.now()
                    ).first<{ id: number }>();

                    if (result) {
                        savedId = result.id;
                        shouldQueueSummary = true;
                    }
                    else {
                        // Insert failed
                        const fallback = await env.DB.prepare(`
                            SELECT id, ai_summary FROM fetched_emails WHERE account_id = ? AND uid = ?
                        `).bind(accountId, email.uid).first<{ id: number; ai_summary?: string | null }>();
                        if (fallback) {
                            savedId = fallback.id;
                            isDuplicate = true;
                            shouldQueueSummary = !fallback.ai_summary;
                        }
                    }
                }
            } catch (e) {
                console.error('[IMAP Poller] 保存邮件到本地失败:', e);
            }

            if (!savedId) {
                continue;
            }

            let summaryContext: PushSummaryContext | undefined;
            let summaryReady = false;
            if (requiresInlineSummary) {
                try {
                    const summaryResult = await getOrGenerateEmailSummaryById(env, account.user_key, String(savedId), false);
                    summaryContext = {
                        summary: summaryResult.result.summary,
                        sentiment: summaryResult.result.sentiment,
                        importance_score: summaryResult.result.importance_score,
                        action_items: summaryResult.result.action_items,
                    };
                    summaryReady = true;
                } catch (summaryError) {
                    console.warn(`[IMAP Poller] 生成摘要失败 (email_id=${savedId})`, summaryError);
                }
            }

            if (!summaryReady && shouldQueueSummary) {
                await queueEmailSummaryJob(env, savedId, 1);
            }

            // 如果是重复邮件 (Message-ID 或 UID 已存在)，则直接跳过后续推送逻辑
            if (isDuplicate) {
                // 修复逻辑：即使是重复邮件，也更新内容 (防止之前因 bug 导致内容为空)
                if (savedId && emailData.content && emailData.content !== '(无内容)') {
                    try {
                        await env.DB.prepare(`
                            UPDATE fetched_emails 
                            SET content = ?, subject = ?, from_address = ?, received_at = ?
                            WHERE id = ?
                        `).bind(
                            emailData.content,
                            emailData.subject,
                            emailData.from,
                            emailData.received_at,
                            savedId
                        ).run();
                    } catch (e) {
                        console.error('[IMAP Poller] 更新重复邮件失败:', e);
                    }
                }

                continue;
            }

            // --- Spam & Rules Check ---

            // 黑名单与规则已在循环外读取，这里仅做匹配判定。

            // 1. 规则检查 & 安全检查
            const checkResult = shouldForwardEmail(emailData, rules, blacklistSet, customRules);

            if (!checkResult.allowed) {
                console.log(`[IMAP Poller] 邮件被拦截 (${checkResult.reason}): ${email.subject}`);
                const status = checkResult.action?.type === 'mark_spam' ? 'filtered' : 'filtered'; // 'filtered' covers spam/block
                await env.DB.prepare("UPDATE fetched_emails SET push_status = ?, push_log = ? WHERE id = ?")
                    .bind(status, `Blocked by: ${checkResult.reason}`, savedId).run();
                continue;
            }

            // 2. AI 垃圾邮件检测 (如果开启)
            if (account.enable_ai_spam_filter === 1) {
                const aiDecision = await checkAiSpam(env, emailData, aiConfig, summaryContext, aiFilterConfig);
                if (aiDecision.shouldFilter) {
                    console.log(`[IMAP Poller] 邮件被 AI 过滤: ${email.subject} (category=${aiDecision.category}, severity=${aiDecision.severity}, reason=${aiDecision.reason || '无'})`);
                    const reasonText = [
                        `类型=${aiDecision.category}`,
                        `严重度=${aiDecision.severity}`,
                        aiDecision.reason || ''
                    ].filter(Boolean).join(' | ');

                    await env.DB.prepare("UPDATE fetched_emails SET push_status = 'filtered', push_log = ? WHERE id = ?")
                        .bind(`AI Filter: ${reasonText}`, savedId).run();
                    continue;
                }
            }

            // 3. 检查自动推送设置
            if (!autoPush) {
                console.log(`[IMAP Poller] 自动推送已关闭，仅保存: ${email.subject}`);
                await env.DB.prepare("UPDATE fetched_emails SET push_status = 'skipped' WHERE id = ?").bind(savedId).run();
                continue;
            }

            // 3.构建 settings 对象传递给 forwardEmailToPush
            const settings: EmailSettings = {
                id: 0,
                user_key: account.user_key,
                enabled: 1,
                email_address: null,
                wxpush_token: null,
                wxpush_url: account.push_url,
                forward_rules: account.filter_rules,
                push_config: account.push_config,
                template_name: account.template_name,
                enable_imap: 1,
                imap_host: account.imap_host,
                imap_port: account.imap_port,
                imap_user: account.imap_user,
                imap_password: account.imap_password,
                imap_tls: account.imap_tls,
                last_sync_at: account.last_sync_at,
                sync_status: account.sync_status,
                sync_error: account.sync_error,
                total_forwarded: account.total_forwarded,
                last_forwarded_at: null,
                created_at: account.created_at,
                updated_at: account.updated_at
            };

            const pushResult = await forwardEmailToPush(env, settings, emailData, aiConfig, summaryContext);

            // 更新本地状态
            await env.DB.prepare(`
                UPDATE fetched_emails 
                SET is_pushed = ?, push_status = ?, push_log = ?
                WHERE id = ?
            `).bind(
                pushResult.success ? 1 : 0,
                pushResult.success ? 'success' : 'failed',
                pushResult.error || pushResult.response,
                savedId
            ).run();

            // 仅在成功转发时记录到 email_forward_logs (Legacy)
            if (pushResult.success) {
                await logAndFinishForward(
                    env,
                    account.user_key,
                    emailData,
                    true,
                    pushResult.response,
                    undefined
                );
                forwardedCount++;
            }
        }

        // 更新同步成功状态
        const now = Date.now();
        rules.last_uid = maxUid;
        await env.DB.prepare(`
            UPDATE email_accounts 
            SET sync_status = 'idle', 
                sync_error = NULL, 
                last_sync_at = ?,
                filter_rules = ?,
                total_synced = total_synced + ?,
                total_forwarded = total_forwarded + ?,
                updated_at = ?
            WHERE id = ?
        `).bind(now, JSON.stringify(rules), emails.length, forwardedCount, now, accountId).run();

        return {
            success: true,
            emailsFound: emails.length,
            emailsForwarded: forwardedCount,
            duration: Date.now() - startTime
        };

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : '未知错误';
        console.error(`[IMAP Poller] 账户 ${accountId} 同步失败:`, errorMsg);

        // 更新错误状态
        await env.DB.prepare(`
            UPDATE email_accounts SET sync_status = 'error', sync_error = ?, updated_at = ? WHERE id = ?
        `).bind(errorMsg, Date.now(), accountId).run();

        return {
            success: false,
            emailsFound: 0,
            emailsForwarded: 0,
            error: errorMsg,
            duration: Date.now() - startTime
        };
    }
}
