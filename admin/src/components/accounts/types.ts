/**
 * 邮箱账户类型定义
 * @author zhangws
 */

export interface EmailAccount {
    id: string;
    name: string;
    email: string;
    imap_host: string;
    imap_port: number;
    username: string;
    password?: string;
    use_ssl: boolean;
    enabled: boolean;
    sync_status?: 'idle' | 'syncing' | 'error';
    last_sync?: string;
    email_count?: number;
    sync_error?: string | null;
    pending_count?: number;
    failed_count?: number;

    // 推送配置
    auto_push?: boolean;
    push_user_id?: string;
    push_template_id?: string;
    push_appid?: string;
    push_secret?: string;
    push_url?: string;
    template_name?: string;

    // AI 过滤
    ai_spam_filter?: boolean;
    ai_profile_id?: string;
    ai_filter_config?: {
        ads_keep_importance_threshold: number;
    } | null;

    // 兼容后端原始字段（解析后回填）
    push_config?: {
        appid: string;
        secret: string;
        userid: string;
        template_id: string;
    } | null;

    created_at?: string;
    updated_at?: string;
}

export interface AccountFormData {
    name: string;
    email: string;
    imap_host: string;
    imap_port: number;
    username: string;
    password: string;
    use_ssl: boolean;
    enabled: boolean;
    auto_push: boolean;
    push_user_id: string;
    push_profile_id: string;
    push_template_id: string;
    push_appid: string;
    push_secret: string;
    push_url: string;
    template_name: string;
    ai_spam_filter: boolean;
    ai_profile_id: string;
    ads_keep_importance_threshold: number;
}
