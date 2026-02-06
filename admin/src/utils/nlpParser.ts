/**
 * 自然语言解析器
 * 支持中英文自然语言转换为调度规则
 * 
 * @author zhangws
 */

import { generateContent } from './ai';
import type { AiProfile } from './ai';

// 解析结果类型
export interface NlpParseResult {
    success: boolean;
    schedule_type?: 'once' | 'daily' | 'weekly' | 'monthly' | 'cron';
    schedule_time?: string;      // HH:mm 格式
    schedule_date?: string;      // YYYY-MM-DD 格式
    schedule_weekday?: number;   // 0-6, 0=周日
    schedule_day?: number;       // 1-31
    title?: string;              // 提取的任务标题
    content?: string;            // 提取的任务内容
    confidence: number;          // 解析置信度 0-1
    rawInput: string;            // 原始输入
    errorMessage?: string;       // 错误信息
}

// 兼容旧类型定义（将在未来版本移除）
export type LlmApiConfig = Partial<AiProfile>;

// 星期映射
const WEEKDAY_MAP_CN: Record<string, number> = {
    '日': 0, '天': 0, '周日': 0, '星期日': 0, '星期天': 0,
    '一': 1, '周一': 1, '星期一': 1,
    '二': 2, '周二': 2, '星期二': 2,
    '三': 3, '周三': 3, '星期三': 3,
    '四': 4, '周四': 4, '星期四': 4,
    '五': 5, '周五': 5, '星期五': 5,
    '六': 6, '周六': 6, '星期六': 6,
};

const WEEKDAY_MAP_EN: Record<string, number> = {
    'sunday': 0, 'sun': 0,
    'monday': 1, 'mon': 1,
    'tuesday': 2, 'tue': 2,
    'wednesday': 3, 'wed': 3,
    'thursday': 4, 'thu': 4,
    'friday': 5, 'fri': 5,
    'saturday': 6, 'sat': 6,
};

/**
 * 解析自然语言为调度规则（纯本地规则引擎）
 */
export function parseNaturalLanguage(input: string): NlpParseResult {
    const trimmedInput = input.trim();
    if (!trimmedInput) {
        return { success: false, confidence: 0, rawInput: input, errorMessage: '输入为空' };
    }

    // 尝试中文解析
    let result = parseChineseInput(trimmedInput);
    if (result.success && result.confidence > 0.5) {
        return result;
    }

    // 尝试英文解析
    result = parseEnglishInput(trimmedInput);
    if (result.success && result.confidence > 0.5) {
        return result;
    }

    return {
        success: false,
        confidence: 0,
        rawInput: input,
        errorMessage: '无法解析输入内容，请尝试更明确的表述',
    };
}

/**
 * 解析中文输入
 */
function parseChineseInput(input: string): NlpParseResult {
    const result: NlpParseResult = { success: false, confidence: 0, rawInput: input };
    let processedInput = input;

    // 提取任务内容（更宽容的模式，支持时间在前后两种情况）
    // 模式 A: [提醒我] 内容 [明天/下午/...]
    const contentMatchA = input.match(/(?:提醒我?|记得|别忘了|通知我?)\s*(.+?)\s*(?:[在于到]|(?:明天|后天|下周|每天|每周|每月|\d))/);
    // 模式 B: [明天] 提醒我 [内容]
    const contentMatchB = input.match(/(?:明天|后天|下周|每天|每周|每月|\d+).*?(?:提醒我?|记得|别忘了|通知我?)\s*(.+)/);

    if (contentMatchA) {
        result.title = contentMatchA[1].trim();
    } else if (contentMatchB) {
        result.title = contentMatchB[1].trim();
    }

    if (result.title) {
        result.content = result.title;
    }

    // 解析时间
    const timeResult = parseChineseTime(processedInput);
    if (timeResult) {
        result.schedule_time = timeResult;
        result.confidence += 0.3;
    }

    // 解析日期/周期模式
    // 1. 检查 "X分钟后" / "X小时后" 模式
    const offsetMatch = input.match(/(\d+)\s*(分钟|小时|天)后/);
    if (offsetMatch) {
        const value = parseInt(offsetMatch[1]);
        const unit = offsetMatch[2];
        const offset = calculateTimeOffset(value, unit);
        const targetTime = new Date(Date.now() + offset);

        result.success = true;
        result.schedule_type = 'once';
        result.schedule_date = formatDate(targetTime);
        result.schedule_time = formatTime(targetTime);
        result.confidence = 0.9;
        return result;
    }

    // 2. 检查 "明天" / "后天" 模式
    if (input.includes('明天')) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        result.schedule_type = 'once';
        result.schedule_date = formatDate(tomorrow);
        result.confidence += 0.4;
        result.success = true;
    } else if (input.includes('后天')) {
        const dayAfter = new Date();
        dayAfter.setDate(dayAfter.getDate() + 2);
        result.schedule_type = 'once';
        result.schedule_date = formatDate(dayAfter);
        result.confidence += 0.4;
        result.success = true;
    } else if (input.includes('今天') || input.includes('今晚')) {
        result.schedule_type = 'once';
        result.schedule_date = formatDate(new Date());
        result.confidence += 0.4;
        result.success = true;
    }

    // 3. 检查 "每天" / "每日" 模式
    if (input.includes('每天') || input.includes('每日')) {
        result.schedule_type = 'daily';
        result.confidence += 0.5;
        result.success = true;
    }

    // 4. 检查 "每周X" 模式
    const weeklyMatch = input.match(/每(周|星期)(一|二|三|四|五|六|日|天)/);
    if (weeklyMatch) {
        const weekdayStr = weeklyMatch[2];
        result.schedule_type = 'weekly';
        result.schedule_weekday = WEEKDAY_MAP_CN[weekdayStr] ?? WEEKDAY_MAP_CN['周' + weekdayStr] ?? 1;
        result.confidence += 0.5;
        result.success = true;
    }

    // 5. 检查 "下周X" 模式
    const nextWeekMatch = input.match(/下(周|星期)(一|二|三|四|五|六|日|天)/);
    if (nextWeekMatch) {
        const weekdayStr = nextWeekMatch[2];
        const targetWeekday = WEEKDAY_MAP_CN[weekdayStr] ?? WEEKDAY_MAP_CN['周' + weekdayStr] ?? 1;
        const targetDate = getNextWeekday(targetWeekday, true);
        result.schedule_type = 'once';
        result.schedule_date = formatDate(targetDate);
        result.confidence += 0.5;
        result.success = true;
    }

    // 6. 检查 "每月X号" 模式
    const monthlyMatch = input.match(/每月(\d{1,2})[号日]/);
    if (monthlyMatch) {
        result.schedule_type = 'monthly';
        result.schedule_day = parseInt(monthlyMatch[1]);
        result.confidence += 0.5;
        result.success = true;
    }

    // 7. 检查 "X月X日" 模式（一次性）
    const dateMatch = input.match(/(\d{1,2})月(\d{1,2})[日号]/);
    if (dateMatch) {
        const month = parseInt(dateMatch[1]);
        const day = parseInt(dateMatch[2]);
        const year = new Date().getFullYear();
        const targetDate = new Date(year, month - 1, day);
        // 如果日期已过，则设为明年
        if (targetDate < new Date()) {
            targetDate.setFullYear(year + 1);
        }
        result.schedule_type = 'once';
        result.schedule_date = formatDate(targetDate);
        result.confidence += 0.5;
        result.success = true;
    }

    // 设置默认时间（如果未指定）
    if (result.success && !result.schedule_time) {
        result.schedule_time = '09:00';
        result.confidence -= 0.1;
    }

    return result;
}

/**
 * 解析英文输入
 */
function parseEnglishInput(input: string): NlpParseResult {
    const result: NlpParseResult = { success: false, confidence: 0, rawInput: input };
    const lowerInput = input.toLowerCase();

    // 提取任务内容
    const contentMatch = input.match(/(?:remind me to|remember to|don't forget to)\s+(.+?)(?:\s+(?:at|on|in|every|tomorrow|next))/i);
    if (contentMatch) {
        result.title = contentMatch[1].trim();
        result.content = result.title;
    }

    // 解析时间
    const timeResult = parseEnglishTime(lowerInput);
    if (timeResult) {
        result.schedule_time = timeResult;
        result.confidence += 0.3;
    }

    // 1. 检查 "in X minutes/hours/days" 模式
    const offsetMatch = lowerInput.match(/in\s+(\d+)\s*(minutes?|hours?|days?)/);
    if (offsetMatch) {
        const value = parseInt(offsetMatch[1]);
        const unitMap: Record<string, string> = {
            'minute': '分钟', 'minutes': '分钟',
            'hour': '小时', 'hours': '小时',
            'day': '天', 'days': '天',
        };
        const unit = unitMap[offsetMatch[2]] || '分钟';
        const offset = calculateTimeOffset(value, unit);
        const targetTime = new Date(Date.now() + offset);

        result.success = true;
        result.schedule_type = 'once';
        result.schedule_date = formatDate(targetTime);
        result.schedule_time = formatTime(targetTime);
        result.confidence = 0.9;
        return result;
    }

    // 2. 检查 "tomorrow" 模式
    if (lowerInput.includes('tomorrow')) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        result.schedule_type = 'once';
        result.schedule_date = formatDate(tomorrow);
        result.confidence += 0.4;
        result.success = true;
    } else if (lowerInput.includes('today') || lowerInput.includes('tonight')) {
        result.schedule_type = 'once';
        result.schedule_date = formatDate(new Date());
        result.confidence += 0.4;
        result.success = true;
    }

    // 3. 检查 "every day" / "daily" 模式
    if (lowerInput.includes('every day') || lowerInput.includes('daily')) {
        result.schedule_type = 'daily';
        result.confidence += 0.5;
        result.success = true;
    }

    // 4. 检查 "every Monday" 等模式
    const weeklyMatch = lowerInput.match(/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)/);
    if (weeklyMatch) {
        result.schedule_type = 'weekly';
        result.schedule_weekday = WEEKDAY_MAP_EN[weeklyMatch[1]] ?? 1;
        result.confidence += 0.5;
        result.success = true;
    }

    // 5. 检查 "next Monday" 等模式
    const nextWeekMatch = lowerInput.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)/);
    if (nextWeekMatch) {
        const targetWeekday = WEEKDAY_MAP_EN[nextWeekMatch[1]] ?? 1;
        const targetDate = getNextWeekday(targetWeekday, true);
        result.schedule_type = 'once';
        result.schedule_date = formatDate(targetDate);
        result.confidence += 0.5;
        result.success = true;
    }

    // 6. 检查 "every month on the Xth" 模式
    const monthlyMatch = lowerInput.match(/every\s+month\s+(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/);
    if (monthlyMatch) {
        result.schedule_type = 'monthly';
        result.schedule_day = parseInt(monthlyMatch[1]);
        result.confidence += 0.5;
        result.success = true;
    }

    // 设置默认时间
    if (result.success && !result.schedule_time) {
        result.schedule_time = '09:00';
        result.confidence -= 0.1;
    }

    return result;
}

/**
 * 解析中文时间表达式
 */
function parseChineseTime(input: string): string | null {
    // 匹配模式定义：必须先匹配有明确修饰词的，最后匹配纯数字，防止误读
    const patterns = [
        { regex: /(?:下午|中午|午后)\s*(\d{1,2})\s*[点:：时]\s*(\d{1,2})?\s*[分]?/, offset: 12 },
        { regex: /(?:晚上|傍晚|晚间|夜里)\s*(\d{1,2})\s*[点:：时]\s*(\d{1,2})?\s*[分]?/, offset: 12 },
        { regex: /(?:上午|早上|早晨)\s*(\d{1,2})\s*[点:：时]\s*(\d{1,2})?\s*[分]?/, offset: 0 },
        { regex: /(\d{1,2})\s*[:：]\s*(\d{1,2})/, offset: -1 }, // HH:mm 格式
        { regex: /(\d{1,2})\s*[点时]\s*(\d{1,2})?\s*[分]?/, offset: -1 }, // X点X分 格式
    ];

    for (const item of patterns) {
        const match = input.match(item.regex);
        if (match) {
            let hours = parseInt(match[1]);
            const minutes = parseInt(match[2] || '0');

            if (item.offset === 12 && hours < 12) {
                // 下午且小时小于 12
                hours += 12;
            } else if (item.offset === 0 && hours === 12) {
                // 上午 12 点 = 0 点
                hours = 0;
            } else if (item.offset === -1) {
                // 纯数字识别：如果是 1-6 点且输入中没有"凌晨/上午"字样，默认倾向于下午
                if (hours >= 1 && hours <= 6 && !input.match(/凌晨|早上|上午/)) {
                    hours += 12;
                }
            }

            // 验证时间有效性
            if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
                return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            }
        }
    }

    return null;
}

/**
 * 解析英文时间表达式
 */
function parseEnglishTime(input: string): string | null {
    // 匹配 "X:XX am/pm" 或 "X am/pm" 格式
    const patterns = [
        /(\d{1,2}):(\d{2})\s*(am|pm)?/i,
        /(\d{1,2})\s*(am|pm)/i,
        /at\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?/i,
    ];

    for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match) {
            let hours = parseInt(match[1]);
            const minutes = parseInt(match[2] || '0');
            const meridiem = (match[3] || '').toLowerCase();

            // 转换 12 小时制
            if (meridiem === 'pm' && hours < 12) {
                hours += 12;
            } else if (meridiem === 'am' && hours === 12) {
                hours = 0;
            }

            // 验证时间有效性
            if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
                return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            }
        }
    }

    return null;
}

/**
 * 计算时间偏移（毫秒）
 */
function calculateTimeOffset(value: number, unit: string): number {
    const unitMs: Record<string, number> = {
        '分钟': 60 * 1000,
        '小时': 60 * 60 * 1000,
        '天': 24 * 60 * 60 * 1000,
    };
    return value * (unitMs[unit] || 60 * 1000);
}

/**
 * 获取下一个指定星期几的日期
 */
function getNextWeekday(targetWeekday: number, nextWeek: boolean = false): Date {
    const today = new Date();
    const currentWeekday = today.getDay();
    let daysToAdd = targetWeekday - currentWeekday;

    if (nextWeek) {
        // 下周
        daysToAdd += 7;
    } else if (daysToAdd <= 0) {
        // 本周已过，跳到下周
        daysToAdd += 7;
    }

    const result = new Date(today);
    result.setDate(today.getDate() + daysToAdd);
    return result;
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 格式化时间为 HH:mm
 */
function formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * 获取调度类型的中文描述
 */
export function getScheduleDescription(result: NlpParseResult): string {
    if (!result.success) return '解析失败';

    const parts: string[] = [];

    switch (result.schedule_type) {
        case 'once':
            parts.push(`一次性：${result.schedule_date}`);
            break;
        case 'daily':
            parts.push('每天');
            break;
        case 'weekly':
            const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            parts.push(`每${weekdayNames[result.schedule_weekday ?? 0]}`);
            break;
        case 'monthly':
            parts.push(`每月 ${result.schedule_day} 号`);
            break;
    }

    if (result.schedule_time) {
        parts.push(result.schedule_time);
    }

    return parts.join(' ');
}

/**
 * 使用 LLM API 解析自然语言（多模态增强版）
 */
export async function parseWithLlm(
    input: string,
    profileId?: string // 可选指定使用的 profile ID
): Promise<NlpParseResult> {
    // 先尝试本地解析
    const localResult = parseNaturalLanguage(input);
    if (localResult.success && localResult.confidence >= 0.8) {
        return localResult;
    }

    // 本地解析置信度不够，调用 LLM API
    try {
        const prompt = buildLlmPrompt(input);

        // 调用通用 AI 服务
        const responseText = await generateContent(prompt, profileId);

        // 解析 LLM 返回的 JSON
        const parsed = parseLlmResponse(responseText, input);
        return parsed;
    } catch (error) {
        console.error('LLM API 调用失败:', error);
        // 回退到本地解析结果
        if (localResult.success) {
            return localResult;
        }
        return {
            success: false,
            confidence: 0,
            rawInput: input,
            errorMessage: `LLM 解析失败: ${error instanceof Error ? error.message : '未知错误'}`,
        };
    }
}

/**
 * 构建 LLM 提示词
 */
function buildLlmPrompt(input: string): string {
    const now = new Date();
    const currentDate = formatDate(now);
    const currentTime = formatTime(now);
    const currentWeekday = now.getDay();
    const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    return `你是一个智能日程解析助手。请将用户的自然语言输入解析为结构化的调度规则。

当前时间信息：
- 日期：${currentDate}（${weekdayNames[currentWeekday]}）
- 时间：${currentTime}

用户输入："${input}"

请返回一个 JSON 对象，格式如下：
{
  "success": true,
  "schedule_type": "once|daily|weekly|monthly",
  "schedule_time": "HH:mm",
  "schedule_date": "YYYY-MM-DD",  // 仅当 schedule_type 为 "once" 时需要
  "schedule_weekday": 0-6,        // 仅当 schedule_type 为 "weekly" 时需要，0=周日
  "schedule_day": 1-31,           // 仅当 schedule_type 为 "monthly" 时需要
  "title": "提取的任务标题",
  "content": "提取的任务内容",
  "confidence": 0.0-1.0
}

注意事项：
1. 如果用户没有明确指定时间，使用 09:00 作为默认时间
2. "明天" 表示 ${formatDate(new Date(now.getTime() + 86400000))}
3. "下周X" 表示下周的某天，例如今天是${weekdayNames[currentWeekday]}，"下周一" 表示 7 天后的周一
4. 只返回 JSON，不要有其他文字

请解析：`;
}

/**
 * 解析 LLM 返回的响应
 */
function parseLlmResponse(response: string, originalInput: string): NlpParseResult {
    try {
        // 尝试提取 JSON（可能被包裹在 markdown 代码块中）
        let jsonStr = response;
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        }

        const parsed = JSON.parse(jsonStr.trim());

        return {
            success: parsed.success ?? true,
            schedule_type: parsed.schedule_type,
            schedule_time: parsed.schedule_time,
            schedule_date: parsed.schedule_date,
            schedule_weekday: parsed.schedule_weekday,
            schedule_day: parsed.schedule_day,
            title: parsed.title,
            content: parsed.content,
            confidence: parsed.confidence ?? 0.8,
            rawInput: originalInput,
        };
    } catch (error) {
        console.error('解析 LLM 响应失败:', error, response);
        return {
            success: false,
            confidence: 0,
            rawInput: originalInput,
            errorMessage: '无法解析 LLM 返回的响应',
        };
    }
}
