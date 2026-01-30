/**
 * 时间处理工具
 * 注意：Cloudflare Workers 运行在 UTC 时区
 */

import { ScheduleType } from '../types';

/**
 * 获取指定时区的当前时间偏移量（毫秒）
 * 例如：Asia/Shanghai 是 UTC+8，返回 8 * 60 * 60 * 1000
 */
function getTimezoneOffset(timezone: string): number {
    const now = new Date();
    // 获取 UTC 时间字符串
    const utcString = now.toLocaleString('en-US', { timeZone: 'UTC' });
    // 获取目标时区时间字符串
    const tzString = now.toLocaleString('en-US', { timeZone: timezone });
    // 计算差值
    const utcDate = new Date(utcString);
    const tzDate = new Date(tzString);
    return tzDate.getTime() - utcDate.getTime();
}

/**
 * 将本地时间（指定时区）转换为 UTC 时间戳
 * @param year 年
 * @param month 月 (1-12)
 * @param day 日
 * @param hours 小时
 * @param minutes 分钟
 * @param timezone 时区
 * @returns UTC 时间戳（毫秒）
 */
function localToUtc(
    year: number,
    month: number,
    day: number,
    hours: number,
    minutes: number,
    timezone: string
): number {
    // 先创建一个 UTC 日期
    const utcDate = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
    // 减去时区偏移量得到真正的 UTC 时间
    const offset = getTimezoneOffset(timezone);
    return utcDate - offset;
}

/**
 * 获取指定时区的当前时间组件
 */
function getNowInTimezone(timezone: string): { year: number; month: number; day: number; hours: number; minutes: number; weekday: number } {
    const now = new Date();
    const tzString = now.toLocaleString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    // 解析时间字符串 "MM/DD/YYYY, HH:MM"
    const match = tzString.match(/(\d+)\/(\d+)\/(\d+),\s*(\d+):(\d+)/);
    if (!match) {
        throw new Error(`Failed to parse timezone string: ${tzString}`);
    }

    const [, month, day, year, hours, minutes] = match.map(Number);

    // 获取星期几
    const weekdayString = now.toLocaleString('en-US', { timeZone: timezone, weekday: 'short' });
    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekday = weekdayMap[weekdayString] ?? 0;

    return { year, month, day, hours, minutes, weekday };
}

/**
 * 解析时间字符串 (HH:mm) 为小时和分钟
 */
export function parseTime(timeStr: string): { hours: number; minutes: number } {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours, minutes };
}

/**
 * 计算下次触发时间
 * @param scheduleType 调度类型
 * @param scheduleTime 时间 HH:mm
 * @param scheduleDate 日期 YYYY-MM-DD（一次性任务）
 * @param scheduleWeekday 周几 0-6
 * @param scheduleDay 几号 1-31
 * @param timezone 时区
 * @param baseTime 基准时间（默认当前时间，UTC）
 * @returns 下次触发时间戳（毫秒，UTC），如果任务已完成返回 null
 */
export function calculateNextTrigger(
    scheduleType: ScheduleType,
    scheduleTime: string | null,
    scheduleDate: string | null,
    scheduleWeekday: number | null,
    scheduleDay: number | null,
    timezone: string = 'Asia/Shanghai',
    baseTime?: Date
): number | null {
    const now = baseTime || new Date();

    switch (scheduleType) {
        case 'once':
            return calculateOnceNextTrigger(scheduleDate!, scheduleTime!, timezone, now);
        case 'daily':
            return calculateDailyNextTrigger(scheduleTime!, timezone, now);
        case 'weekly':
            return calculateWeeklyNextTrigger(scheduleWeekday!, scheduleTime!, timezone, now);
        case 'monthly':
            return calculateMonthlyNextTrigger(scheduleDay!, scheduleTime!, timezone, now);
        case 'cron':
            // Cron 表达式解析需要额外的库，这里先返回下一分钟
            return now.getTime() + 60000;
        default:
            return null;
    }
}

/**
 * 一次性任务：计算指定日期时间的时间戳
 */
function calculateOnceNextTrigger(
    date: string,
    time: string,
    timezone: string,
    now: Date
): number | null {
    const { hours, minutes } = parseTime(time);
    const [year, month, day] = date.split('-').map(Number);

    // 将用户指定的本地时间转换为 UTC 时间戳
    const targetUtc = localToUtc(year, month, day, hours, minutes, timezone);

    // 如果目标时间已过，返回 null（任务将被标记为完成）
    if (targetUtc <= now.getTime()) {
        return null;
    }

    return targetUtc;
}

/**
 * 每日任务：计算今天或明天的触发时间
 */
function calculateDailyNextTrigger(
    time: string,
    timezone: string,
    now: Date
): number {
    const { hours, minutes } = parseTime(time);
    const nowInTz = getNowInTimezone(timezone);

    // 计算今天的目标时间（UTC）
    let targetUtc = localToUtc(nowInTz.year, nowInTz.month, nowInTz.day, hours, minutes, timezone);

    // 如果今天的时间已过，则设为明天
    if (targetUtc <= now.getTime()) {
        // 加一天
        targetUtc += 24 * 60 * 60 * 1000;
    }

    return targetUtc;
}

/**
 * 每周任务：计算下一个指定周几的触发时间
 */
function calculateWeeklyNextTrigger(
    weekday: number, // 0-6, 0=周日
    time: string,
    timezone: string,
    now: Date
): number {
    const { hours, minutes } = parseTime(time);
    const nowInTz = getNowInTimezone(timezone);

    // 计算距离目标周几的天数
    let daysUntilTarget = weekday - nowInTz.weekday;
    if (daysUntilTarget < 0) {
        daysUntilTarget += 7;
    }

    // 计算目标日期
    const targetDate = new Date(nowInTz.year, nowInTz.month - 1, nowInTz.day + daysUntilTarget);
    let targetUtc = localToUtc(
        targetDate.getFullYear(),
        targetDate.getMonth() + 1,
        targetDate.getDate(),
        hours,
        minutes,
        timezone
    );

    // 如果是同一天但时间已过，加7天
    if (targetUtc <= now.getTime()) {
        targetUtc += 7 * 24 * 60 * 60 * 1000;
    }

    return targetUtc;
}

/**
 * 每月任务：计算下一个指定日期的触发时间
 */
function calculateMonthlyNextTrigger(
    day: number, // 1-31
    time: string,
    timezone: string,
    now: Date
): number {
    const { hours, minutes } = parseTime(time);
    const nowInTz = getNowInTimezone(timezone);

    // 计算本月的目标时间（UTC）
    let targetUtc = localToUtc(nowInTz.year, nowInTz.month, day, hours, minutes, timezone);

    // 如果本月的日期已过，则设为下月
    if (targetUtc <= now.getTime()) {
        // 计算下个月
        let nextMonth = nowInTz.month + 1;
        let nextYear = nowInTz.year;
        if (nextMonth > 12) {
            nextMonth = 1;
            nextYear++;
        }
        targetUtc = localToUtc(nextYear, nextMonth, day, hours, minutes, timezone);
    }

    return targetUtc;
}

/**
 * 格式化时间戳为 ISO 字符串
 */
export function formatTimestamp(timestamp: number | null): string | null {
    if (!timestamp) return null;
    return new Date(timestamp).toISOString();
}

/**
 * 验证时间格式 (HH:mm)
 */
export function isValidTimeFormat(time: string): boolean {
    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return regex.test(time);
}

/**
 * 验证日期格式 (YYYY-MM-DD)
 */
export function isValidDateFormat(date: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(date)) return false;

    const [year, month, day] = date.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}
