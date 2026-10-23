import type { EventType } from '../../shared/types/api';

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/**
 * 将 ISO 8601 时间字符串解析为 Asia/Shanghai 下的 YYYY-MM-DD 日期与 HH:mm 时间。
 */
export function parseEventDateTimeParts(isoStr: string): {
  dateStr: string;
  timeStr: string;
  minutesOfDay: number;
} {
  if (!isoStr) {
    return { dateStr: '', timeStr: '00:00', minutesOfDay: 0 };
  }
  const normalized = isoStr.trim().replace(' ', 'T');
  const datePart = normalized.slice(0, 10);
  const timeMatch = normalized.match(/T(\d{2}):(\d{2})/);
  if (!timeMatch) {
    return { dateStr: datePart, timeStr: '00:00', minutesOfDay: 0 };
  }
  const hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  return {
    dateStr: datePart,
    timeStr: `${timeMatch[1]}:${timeMatch[2]}`,
    minutesOfDay: hours * 60 + minutes,
  };
}

/**
 * 根据 YYYY-MM-DD 获取所在周的周一日期（YYYY-MM-DD）
 */
export function getMondayOfDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diffToMonday);
  return formatUtcDate(dt);
}

/**
 * 在 YYYY-MM-DD 基础上加减指定天数
 */
export function addDays(dateStr: string, offsetDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  return formatUtcDate(dt);
}

/**
 * 获取某一周（周一为起点）的 7 天信息
 */
export function getWeekDays(weekMondayStr: string): Array<{
  dateStr: string;
  monthDay: string;
  weekdayLabel: string;
  isWeekend: boolean;
}> {
  return Array.from({ length: 7 }).map((_, idx) => {
    const dateStr = addDays(weekMondayStr, idx);
    const [, m, d] = dateStr.split('-');
    return {
      dateStr,
      monthDay: `${Number(m)}/${Number(d)}`,
      weekdayLabel: WEEKDAY_LABELS[idx],
      isWeekend: idx >= 5,
    };
  });
}

export function formatShortDate(dateStr?: string | null): string {
  if (!dateStr) return '--';
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts.map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayIdx = (dt.getUTCDay() + 6) % 7;
  return `${m}月${d}日 (${WEEKDAY_LABELS[dayIdx]})`;
}

export function formatTimeRange(startIso: string, endIso: string): string {
  const start = parseEventDateTimeParts(startIso);
  const end = parseEventDateTimeParts(endIso);
  if (start.dateStr === end.dateStr) {
    return `${formatShortDate(start.dateStr)} ${start.timeStr} - ${end.timeStr}`;
  }
  return `${formatShortDate(start.dateStr)} ${start.timeStr} 至 ${formatShortDate(end.dateStr)} ${end.timeStr}`;
}

export interface EventTypeMeta {
  label: string;
  weight: number;
  badgeClass: string;
  cardClass: string;
  dotColor: string;
}

export const EVENT_TYPE_META: Record<EventType, EventTypeMeta> = {
  exam: {
    label: '考试',
    weight: 5,
    badgeClass: 'bg-red-100 text-red-700 border-red-200',
    cardClass: 'bg-red-50/90 border-l-4 border-l-red-500 border-red-200 text-red-950 hover:bg-red-50',
    dotColor: '#ef4444',
  },
  deadline: {
    label: '作业截止',
    weight: 3,
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    cardClass:
      'bg-amber-50/90 border-l-4 border-l-amber-500 border-amber-200 text-amber-950 hover:bg-amber-50',
    dotColor: '#f59e0b',
  },
  course: {
    label: '课程',
    weight: 2,
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-200',
    cardClass:
      'bg-teal-50/90 border-l-4 border-l-teal-600 border-teal-200 text-teal-950 hover:bg-teal-50',
    dotColor: '#0d9488',
  },
  activity: {
    label: '活动',
    weight: 1,
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-200',
    cardClass:
      'bg-sky-50/90 border-l-4 border-l-sky-500 border-sky-200 text-sky-950 hover:bg-sky-50',
    dotColor: '#0284c7',
  },
  notice: {
    label: '通知',
    weight: 1,
    badgeClass: 'bg-slate-200 text-slate-700 border-slate-300',
    cardClass:
      'bg-slate-100/90 border-l-4 border-l-slate-500 border-slate-300 text-slate-900 hover:bg-slate-100',
    dotColor: '#64748b',
  },
};

function formatUtcDate(dt: Date): string {
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export const DEFAULT_SEMESTER_START = '2026-08-24';
export const DEFAULT_TOTAL_WEEKS = 21;

/**
 * 根据日期计算其属于学期的第几周（以 semesterStart 周一为第 1 周）
 */
export function getSemesterWeekNumber(dateStr: string, semesterStart = DEFAULT_SEMESTER_START): number {
  if (!dateStr) return 1;
  const monday = getMondayOfDate(dateStr);
  const startMonday = getMondayOfDate(semesterStart);
  const [y1, m1, d1] = monday.split('-').map(Number);
  const [y0, m0, d0] = startMonday.split('-').map(Number);
  const ms1 = Date.UTC(y1, m1 - 1, d1);
  const ms0 = Date.UTC(y0, m0 - 1, d0);
  const diffWeeks = Math.round((ms1 - ms0) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, diffWeeks + 1);
}

/**
 * 根据学期周次获取对应周的周一日期
 */
export function getDateOfSemesterWeek(weekNum: number, semesterStart = DEFAULT_SEMESTER_START): string {
  const startMonday = getMondayOfDate(semesterStart);
  return addDays(startMonday, (Math.max(1, weekNum) - 1) * 7);
}
