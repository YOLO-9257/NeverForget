import { ToolDefinition } from './types';

const reminderTools: ToolDefinition[] = [
    {
        name: 'query_reminders',
        description: '查询提醒任务列表，支持按状态、关键词筛选',
        parameters: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    enum: ['active', 'paused', 'completed', 'failed'],
                    description: '任务状态筛选'
                },
                keyword: {
                    type: 'string',
                    description: '标题或内容关键词'
                },
                limit: {
                    type: 'integer',
                    description: '返回数量限制，默认 10，最大 50',
                    default: 10
                }
            }
        }
    },
    {
        name: 'create_reminder',
        description: '创建新的提醒任务（用于定时提醒，不用于立刻发送）',
        parameters: {
            type: 'object',
            required: ['title', 'content', 'schedule_type'],
            properties: {
                title: { type: 'string', description: '提醒标题' },
                content: { type: 'string', description: '提醒内容' },
                recipient: { type: 'string', description: '可选，目标联系人/配置名（如: 小晴）。会从配置列表自动匹配' },
                config_name: { type: 'string', description: '可选，配置名称别名，等价于 recipient' },
                schedule_type: {
                    type: 'string',
                    enum: ['once', 'daily', 'weekly', 'monthly', 'cron'],
                    description: '调度类型'
                },
                schedule_time: { type: 'string', description: '时间 HH:mm' },
                schedule_cron: { type: 'string', description: 'Cron 表达式' },
                schedule_date: { type: 'string', description: '日期 YYYY-MM-DD（once 使用）' },
                schedule_weekday: { type: 'integer', description: '周几 0-6（weekly 使用）' },
                schedule_day: { type: 'integer', description: '每月几号 1-31（monthly 使用）' },
                timezone: { type: 'string', description: '时区，默认使用系统时区' },
                push_config: {
                    type: 'object',
                    description: '推送配置（可省略，系统会尝试自动补全）',
                    properties: {
                        appid: { type: 'string' },
                        secret: { type: 'string' },
                        userid: { type: 'string' },
                        template_id: { type: 'string' },
                        template_name: { type: 'string' }
                    }
                },
                push_url: { type: 'string', description: '自定义推送地址' },
                template_name: { type: 'string', description: '模板名称（例如：甜蜜提醒）' },
                template: { type: 'string', description: 'template_name 的别名（例如：甜蜜提醒）' },
                ack_required: { type: 'boolean', description: '是否开启确认机制' },
                retry_interval: { type: 'integer', description: '确认重试间隔（分钟）' }
            }
        }
    },
    {
        name: 'send_immediate_message',
        description: '立即发送消息（直接调用发送接口，不创建定时任务）。支持按 recipient/config_name 自动匹配配置列表中的用户；未匹配时回退默认配置',
        parameters: {
            type: 'object',
            required: ['content'],
            properties: {
                title: { type: 'string', description: '消息标题，默认“提醒”' },
                content: { type: 'string', description: '消息内容' },
                recipient: { type: 'string', description: '可选，目标联系人/配置名（如: 小晴）' },
                config_name: { type: 'string', description: '可选，配置名称别名，等价于 recipient' },
                push_config: {
                    type: 'object',
                    description: '可选，显式传入推送配置；未传时自动使用默认配置',
                    properties: {
                        appid: { type: 'string' },
                        secret: { type: 'string' },
                        userid: { type: 'string' },
                        template_id: { type: 'string' },
                        template_name: { type: 'string' }
                    }
                },
                push_url: { type: 'string', description: '可选，自定义推送服务地址' },
                template_name: { type: 'string', description: '可选，go-wxpush 模板名称（例如：甜蜜提醒）' },
                template: { type: 'string', description: 'template_name 的别名（例如：甜蜜提醒）' }
            }
        }
    },
    {
        name: 'update_reminder',
        description: '更新提醒任务（改时间、改内容、暂停/恢复等）',
        parameters: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', description: '任务 ID' },
                title: { type: 'string' },
                content: { type: 'string' },
                status: {
                    type: 'string',
                    enum: ['active', 'paused'],
                    description: '任务状态'
                },
                schedule_type: {
                    type: 'string',
                    enum: ['once', 'daily', 'weekly', 'monthly', 'cron']
                },
                schedule_time: { type: 'string', description: '时间 HH:mm' },
                schedule_cron: { type: 'string', description: 'Cron 表达式' },
                schedule_date: { type: 'string', description: '日期 YYYY-MM-DD' },
                schedule_weekday: { type: 'integer', description: '周几 0-6' },
                schedule_day: { type: 'integer', description: '每月几号 1-31' },
                timezone: { type: 'string', description: '时区' },
                push_config: {
                    type: 'object',
                    properties: {
                        appid: { type: 'string' },
                        secret: { type: 'string' },
                        userid: { type: 'string' },
                        template_id: { type: 'string' },
                        template_name: { type: 'string' }
                    }
                },
                push_url: { type: 'string' },
                template_name: { type: 'string' },
                ack_required: { type: 'boolean' },
                retry_interval: { type: 'integer' }
            }
        }
    },
    {
        name: 'delete_reminder',
        description: '删除提醒任务',
        parameters: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', description: '任务 ID' }
            }
        }
    },
    {
        name: 'get_reminder_detail',
        description: '获取单个提醒任务详情',
        parameters: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', description: '任务 ID' }
            }
        }
    },
    {
        name: 'trigger_reminder',
        description: '立即触发一次提醒任务（测试用）',
        parameters: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', description: '任务 ID' }
            }
        }
    },
    {
        name: 'ack_reminder',
        description: '确认提醒（completed）或稍后提醒（snooze）',
        parameters: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', description: '任务 ID' },
                action: {
                    type: 'string',
                    enum: ['completed', 'snooze'],
                    description: '确认动作，默认 completed'
                }
            }
        }
    },
    {
        name: 'get_system_report',
        description: '获取提醒系统统计与最近执行记录',
        parameters: {
            type: 'object',
            properties: {}
        }
    }
];

const emailTools: ToolDefinition[] = [
    {
        name: 'search_emails',
        description: '按关键词搜索邮件（发件人、标题、正文、摘要）',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: '搜索关键词；留空返回最近邮件' },
                account_id: { type: 'string', description: '可选，限定邮箱账户 ID' },
                limit: { type: 'integer', description: '返回数量，默认 10，最大 50', default: 10 }
            }
        }
    },
    {
        name: 'get_email_summary',
        description: '获取邮件 AI 摘要（若无缓存会实时生成）',
        parameters: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', description: '邮件 ID' },
                force_refresh: { type: 'boolean', description: '是否强制重新生成摘要' }
            }
        }
    },
    {
        name: 'sync_email_account',
        description: '手动触发指定邮箱账户同步',
        parameters: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', description: '邮箱账户 ID' }
            }
        }
    },
    {
        name: 'create_task_from_email',
        description: '把邮件转换为提醒任务',
        parameters: {
            type: 'object',
            required: ['email_id'],
            properties: {
                email_id: { type: 'string', description: '邮件 ID' },
                custom_title: { type: 'string', description: '自定义任务标题' },
                use_ai_extract: { type: 'boolean', description: '是否启用 AI 提取时间信息' },
                schedule_type: {
                    type: 'string',
                    enum: ['once', 'daily', 'weekly', 'monthly'],
                    description: '任务类型，默认 once'
                },
                schedule_date: { type: 'string', description: '日期 YYYY-MM-DD' },
                schedule_time: { type: 'string', description: '时间 HH:mm' }
            }
        }
    },
    {
        name: 'block_sender',
        description: '将发件人加入黑名单',
        parameters: {
            type: 'object',
            required: ['email_address'],
            properties: {
                email_address: { type: 'string', description: '发件人邮箱地址' },
                account_id: { type: 'string', description: '可选，指定账户级黑名单' }
            }
        }
    }
];

const systemTools: ToolDefinition[] = [
    {
        name: 'list_notification_channels',
        description: '列出通知渠道',
        parameters: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'test_notification_channel',
        description: '测试指定通知渠道连通性',
        parameters: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', description: '通知渠道 ID' }
            }
        }
    },
    {
        name: 'check_notification_channel',
        description: '测试指定通知渠道连通性（兼容别名）',
        parameters: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string', description: '通知渠道 ID' }
            }
        }
    },
    {
        name: 'get_system_health',
        description: '获取系统健康检查（数据库、调度、邮件同步、AI 队列）',
        parameters: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'update_global_settings',
        description: '更新全局设置（例如 default_timezone、default_retry_interval）',
        parameters: {
            type: 'object',
            required: ['key', 'value'],
            properties: {
                key: { type: 'string', description: '设置键名' },
                value: { type: 'string', description: '设置值（建议传字符串，数字可用字符串形式）' }
            }
        }
    }
];

const workflowTools: ToolDefinition[] = [
    {
        name: 'create_automation_rule',
        description: '创建自动化规则',
        parameters: {
            type: 'object',
            properties: {
                account_id: { type: 'string', description: '邮箱账户 ID（可选，默认首个账户）' },
                name: { type: 'string', description: '规则名称' },
                description: { type: 'string', description: '规则描述' },
                trigger: {
                    type: 'object',
                    description: '触发描述（可选，用于自然语言转规则）'
                },
                check: {
                    type: 'array',
                    description: '条件列表',
                    items: {
                        type: 'object',
                        properties: {
                            field: {
                                type: 'string',
                                enum: ['from', 'subject', 'content', 'category', 'importance', 'age_hours']
                            },
                            operator: {
                                type: 'string',
                                enum: ['contains', 'equals', 'starts_with', 'ends_with', 'not_contains', 'gt', 'lt', 'gte', 'lte']
                            },
                            value: { type: 'string' }
                        },
                        required: ['field', 'operator', 'value']
                    }
                },
                condition_logic: {
                    type: 'string',
                    enum: ['AND', 'OR'],
                    description: '条件组合逻辑'
                },
                action: {
                    type: 'object',
                    description: '单个动作对象（如需多个动作可使用 actions）',
                    properties: {
                        type: {
                            type: 'string',
                            enum: ['auto_reply', 'forward_channel', 'mark_as', 'move_to', 'create_reminder', 'webhook', 'archive', 'delete']
                        },
                        config: { type: 'object' }
                    },
                    required: ['type']
                },
                actions: {
                    type: 'array',
                    description: '可选，多动作数组',
                    items: {
                        type: 'object',
                        properties: {
                            type: {
                                type: 'string',
                                enum: ['auto_reply', 'forward_channel', 'mark_as', 'move_to', 'create_reminder', 'webhook', 'archive', 'delete']
                            },
                            config: { type: 'object' }
                        },
                        required: ['type']
                    }
                },
                max_executions_per_day: { type: 'integer' },
                cooldown_minutes: { type: 'integer' }
            }
        }
    },
    {
        name: 'list_automation_rules',
        description: '列出当前自动化规则',
        parameters: {
            type: 'object',
            properties: {
                account_id: { type: 'string', description: '可选，按账户过滤' }
            }
        }
    },
    {
        name: 'toggle_automation_rule',
        description: '启用或禁用自动化规则',
        parameters: {
            type: 'object',
            required: ['id', 'enable'],
            properties: {
                id: { type: 'string', description: '规则 ID' },
                enable: { type: 'boolean', description: 'true 启用，false 禁用' }
            }
        }
    }
];

const configTools: ToolDefinition[] = [
    {
        name: 'save_config',
        description: '保存常用配置',
        parameters: {
            type: 'object',
            required: ['category', 'name', 'value'],
            properties: {
                category: { type: 'string', description: '配置分类' },
                name: { type: 'string', description: '配置名称' },
                value: { type: 'string', description: '配置值' }
            }
        }
    },
    {
        name: 'list_configs',
        description: '列出已保存配置',
        parameters: {
            type: 'object',
            properties: {
                category: { type: 'string', description: '可选，按分类筛选' }
            }
        }
    }
];

export const TOOLS: ToolDefinition[] = [
    ...reminderTools,
    ...emailTools,
    ...systemTools,
    ...workflowTools,
    ...configTools
];
