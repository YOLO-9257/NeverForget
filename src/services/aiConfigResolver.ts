/**
 * AI 配置解析服务
 * 优先级：
 * 0) 邮箱账户绑定 ai_profile_id（如果指定）
 * 1) saved_configs.ai_profile 中默认模型
 * 2) saved_configs.ai_config 旧版单配置
 * 3) 环境变量 AI_* 默认配置
 */

import { Env } from '../types';

export interface ResolvedAiConfig {
    apiKey?: string;
    provider?: string;
    model?: string;
    baseUrl?: string;
    profileId?: string;
    source: 'account_binding' | 'ai_profile' | 'ai_config' | 'env' | 'none';
}

interface SavedConfigRow {
    value: string;
    created_at?: number;
}

interface ParsedAiProfile {
    id?: string;
    apiKey?: string;
    provider?: string;
    model?: string;
    baseUrl?: string;
    isDefault?: boolean;
}

function normalizeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }
        return parsed as Record<string, unknown>;
    } catch {
        return null;
    }
}

function toProfileConfig(profile: ParsedAiProfile): ResolvedAiConfig | null {
    const apiKey = normalizeString(profile.apiKey);
    if (!apiKey) {
        return null;
    }

    return {
        apiKey,
        provider: normalizeString(profile.provider) || undefined,
        model: normalizeString(profile.model) || undefined,
        baseUrl: normalizeString(profile.baseUrl) || undefined,
        profileId: normalizeString(profile.id) || undefined,
        source: 'ai_profile',
    };
}

function parseAiProfile(raw: string): ParsedAiProfile | null {
    const obj = parseJsonObject(raw);
    if (!obj) {
        return null;
    }

    const apiKey = normalizeString(obj.apiKey) || normalizeString(obj.api_key);
    const baseUrl = normalizeString(obj.baseUrl) || normalizeString(obj.base_url);

    return {
        id: normalizeString(obj.id),
        apiKey,
        provider: normalizeString(obj.provider),
        model: normalizeString(obj.model),
        baseUrl,
        isDefault: Boolean(obj.isDefault),
    };
}

function parseLegacyAiConfig(raw: string): ResolvedAiConfig | null {
    const obj = parseJsonObject(raw);
    if (!obj) {
        return null;
    }

    const apiKey = normalizeString(obj.apiKey) || normalizeString(obj.api_key);
    if (!apiKey) {
        return null;
    }

    return {
        apiKey,
        provider: normalizeString(obj.provider) || undefined,
        model: normalizeString(obj.model) || undefined,
        baseUrl: normalizeString(obj.baseUrl) || normalizeString(obj.base_url) || undefined,
        source: 'ai_config',
    };
}

async function loadAiProfiles(env: Env, userKey: string): Promise<ParsedAiProfile[]> {
    const profiles = await env.DB.prepare(`
        SELECT value, created_at
        FROM saved_configs
        WHERE user_key = ? AND category = 'ai_profile'
        ORDER BY created_at DESC
        LIMIT 50
    `).bind(userKey).all<SavedConfigRow>();

    return (profiles.results || [])
        .map(p => parseAiProfile(p.value))
        .filter((p): p is ParsedAiProfile => p !== null);
}

function findProfileById(profiles: ParsedAiProfile[], profileId: string): ParsedAiProfile | undefined {
    const normalizedTarget = normalizeString(profileId);
    if (!normalizedTarget) {
        return undefined;
    }

    return profiles.find(profile => normalizeString(profile.id) === normalizedTarget);
}

export async function hasAiProfileForUser(env: Env, userKey: string, profileId: string): Promise<boolean> {
    try {
        const profiles = await loadAiProfiles(env, userKey);
        return Boolean(findProfileById(profiles, profileId));
    } catch {
        return false;
    }
}

export async function resolveAiConfigForUser(
    env: Env,
    userKey: string,
    options?: { preferredProfileId?: string | null }
): Promise<ResolvedAiConfig | undefined> {
    try {
        const parsedProfiles = await loadAiProfiles(env, userKey);

        const preferredProfileId = normalizeString(options?.preferredProfileId);
        if (preferredProfileId) {
            const preferredProfile = findProfileById(parsedProfiles, preferredProfileId);
            if (preferredProfile) {
                const preferredConfig = toProfileConfig(preferredProfile);
                if (preferredConfig) {
                    return preferredConfig;
                }
            }
        }

        const defaultProfile = parsedProfiles.find(p => p.isDefault);
        if (defaultProfile) {
            const config = toProfileConfig(defaultProfile);
            if (config) {
                return config;
            }
        }

        for (const profile of parsedProfiles) {
            const config = toProfileConfig(profile);
            if (config) {
                return config;
            }
        }
    } catch (e) {
        console.warn('[AiConfigResolver] 读取 ai_profile 失败:', e);
    }

    try {
        const legacy = await env.DB.prepare(`
            SELECT value
            FROM saved_configs
            WHERE user_key = ? AND category = 'ai_config'
            ORDER BY created_at DESC
            LIMIT 1
        `).bind(userKey).first<{ value: string }>();

        if (legacy) {
            const config = parseLegacyAiConfig(legacy.value);
            if (config) {
                return config;
            }
        }
    } catch (e) {
        console.warn('[AiConfigResolver] 读取 ai_config 失败:', e);
    }

    if (env.AI_API_KEY) {
        return {
            apiKey: env.AI_API_KEY,
            provider: env.AI_PROVIDER,
            model: env.AI_MODEL,
            source: 'env',
        };
    }

    return undefined;
}

export async function resolveAiConfigForAccount(
    env: Env,
    userKey: string,
    accountId?: string | null
): Promise<ResolvedAiConfig | undefined> {
    const normalizedAccountId = normalizeString(accountId);
    if (!normalizedAccountId) {
        return resolveAiConfigForUser(env, userKey);
    }

    try {
        const account = await env.DB.prepare(`
            SELECT ai_profile_id
            FROM email_accounts
            WHERE id = ? AND user_key = ?
            LIMIT 1
        `).bind(normalizedAccountId, userKey).first<{ ai_profile_id: string | null }>();

        const preferredProfileId = normalizeString(account?.ai_profile_id);
        if (preferredProfileId) {
            const accountConfig = await resolveAiConfigForUser(env, userKey, { preferredProfileId });
            if (accountConfig) {
                return {
                    ...accountConfig,
                    profileId: preferredProfileId,
                    source: 'account_binding',
                };
            }
        }
    } catch (e) {
        console.warn('[AiConfigResolver] 读取账户绑定 AI 配置失败:', e);
    }

    return resolveAiConfigForUser(env, userKey);
}
