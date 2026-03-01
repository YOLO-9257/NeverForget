import { Env } from '../../../types';
import { ToolExecutor } from '../types';
import { TOOLS } from '../definitions';
import {
    ackReminderExecutor,
    createReminderExecutor,
    deleteReminderExecutor,
    getReminderDetailExecutor,
    getSystemReportExecutor,
    listConfigsExecutor,
    queryRemindersExecutor,
    saveConfigExecutor,
    sendImmediateMessageExecutor,
    triggerReminderExecutor,
    updateReminderExecutor
} from './reminders';
import {
    blockSenderExecutor,
    createTaskFromEmailExecutor,
    getEmailSummaryExecutor,
    searchEmailsExecutor,
    syncEmailAccountExecutor
} from './emails';
import {
    getSystemHealthExecutor,
    listNotificationChannelsExecutor,
    testNotificationChannelExecutor,
    updateGlobalSettingsExecutor
} from './system';
import {
    createAutomationRuleExecutor,
    listAutomationRulesExecutor,
    toggleAutomationRuleExecutor
} from './workflows';

const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
    // Reminder lifecycle
    query_reminders: queryRemindersExecutor,
    create_reminder: createReminderExecutor,
    send_immediate_message: sendImmediateMessageExecutor,
    update_reminder: updateReminderExecutor,
    delete_reminder: deleteReminderExecutor,
    get_reminder_detail: getReminderDetailExecutor,
    trigger_reminder: triggerReminderExecutor,
    ack_reminder: ackReminderExecutor,
    get_system_report: getSystemReportExecutor,

    // Email & intelligence
    search_emails: searchEmailsExecutor,
    get_email_summary: getEmailSummaryExecutor,
    sync_email_account: syncEmailAccountExecutor,
    create_task_from_email: createTaskFromEmailExecutor,
    block_sender: blockSenderExecutor,

    // System/Ops
    list_notification_channels: listNotificationChannelsExecutor,
    test_notification_channel: testNotificationChannelExecutor,
    check_notification_channel: testNotificationChannelExecutor,
    get_system_health: getSystemHealthExecutor,
    update_global_settings: updateGlobalSettingsExecutor,

    // Workflow automation
    create_automation_rule: createAutomationRuleExecutor,
    list_automation_rules: listAutomationRulesExecutor,
    toggle_automation_rule: toggleAutomationRuleExecutor,

    // Legacy config tools
    save_config: saveConfigExecutor,
    list_configs: listConfigsExecutor
};

function validateToolRegistry(): void {
    const definedNames = new Set(TOOLS.map(tool => tool.name));
    const executorNames = new Set(Object.keys(TOOL_EXECUTORS));

    const missingExecutors = [...definedNames].filter(name => !executorNames.has(name));
    const extraExecutors = [...executorNames].filter(name => !definedNames.has(name));

    if (missingExecutors.length > 0) {
        console.warn('[AI Tools] Missing executors for tools:', missingExecutors.join(', '));
    }

    if (extraExecutors.length > 0) {
        console.warn('[AI Tools] Executors without tool definitions:', extraExecutors.join(', '));
    }
}

validateToolRegistry();

export async function executeTool(
    name: string,
    args: Record<string, any>,
    env: Env,
    userKey: string
): Promise<any> {
    const executor = TOOL_EXECUTORS[name];
    if (!executor) {
        throw new Error(`Unknown tool: ${name}`);
    }

    return executor(args || {}, env, userKey);
}
