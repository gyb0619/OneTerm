import React, { useEffect, useState } from 'react';
import {
  BellRing,
  AlertTriangle,
  Clock,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ShieldAlert,
  Flame,
  Volume2,
} from 'lucide-react';
import { calendarApi } from '../api';
import type { RemindersSummaryResponse } from '../../../shared/types/api';
import { useAppStore } from '../../../shared/store/useAppStore';

interface CalendarReminderBannerProps {
  onSelectEvent?: (eventId: number) => void;
}

export const CalendarReminderBanner: React.FC<CalendarReminderBannerProps> = ({
  onSelectEvent,
}) => {
  const { setHighlightedEventId } = useAppStore();
  const [reminders, setReminders] = useState<RemindersSummaryResponse | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let active = true;
    void calendarApi.getReminders().then((data) => {
      if (active) setReminders(data);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!reminders || reminders.totalCount === 0) {
    return null;
  }

  const { urgentCount, upcomingExams, upcomingDeadlines, conflictAlerts, todayEvents } = reminders;

  const handleEventClick = (eventId?: number) => {
    if (!eventId) return;
    setHighlightedEventId(eventId);
    if (onSelectEvent) onSelectEvent(eventId);
  };

  return (
    <div className="rounded-2xl border border-amber-200/90 bg-gradient-to-r from-amber-50/80 via-white to-rose-50/60 p-3.5 shadow-xs transition-all">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
            <BellRing className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900">智能教务提醒体系</span>
              {urgentCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500 text-white shadow-2xs">
                  {urgentCount} 项重点关注
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800">
                  日常提醒已就位
                </span>
              )}
              <span className="hidden sm:inline-block text-[11px] text-teal-700 bg-teal-50 border border-teal-200/70 px-2 py-0.5 rounded-full font-mono">
                RFC 5545 VALARM 手机响铃支持
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              考前自动多波段预警 · 导入手机日历即刻生成系统本地闹钟（无需后台常驻）
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="text-xs text-slate-500 hover:text-slate-800 px-2.5 py-1 rounded-lg border border-slate-200/80 bg-white/80 hover:bg-white transition-colors"
        >
          {collapsed ? '展开提醒' : '收起'}
        </button>
      </div>

      {!collapsed && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-2.5 border-t border-amber-200/60 text-xs">
          {/* 临期考试卡片 */}
          <div className="bg-white/90 rounded-xl p-2.5 border border-slate-200/70 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-rose-700 font-semibold">
              <span className="flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-rose-500" />
                临期考试提醒 ({upcomingExams.length})
              </span>
              <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded font-mono">
                提前1天+2h响铃
              </span>
            </div>
            {upcomingExams.length > 0 ? (
              <ul className="space-y-1">
                {upcomingExams.slice(0, 2).map((item) => (
                  <li
                    key={item.id}
                    onClick={() => handleEventClick(item.relatedEventId)}
                    className="cursor-pointer hover:bg-slate-50 p-1 rounded transition-colors group flex items-center justify-between gap-1"
                  >
                    <span className="truncate font-medium text-slate-800 group-hover:text-rose-600">
                      {item.title}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-rose-600 font-semibold">
                      {item.subtitle}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-400 text-[11px]">未来 7 天内无临期考试</p>
            )}
          </div>

          {/* 冲突预警卡片 */}
          <div className="bg-white/90 rounded-xl p-2.5 border border-slate-200/70 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-amber-800 font-semibold">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                排课冲突告警 ({conflictAlerts.length})
              </span>
              <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-mono">
                即刻协调
              </span>
            </div>
            {conflictAlerts.length > 0 ? (
              <ul className="space-y-1">
                {conflictAlerts.slice(0, 2).map((item) => (
                  <li
                    key={item.id}
                    onClick={() => handleEventClick(item.relatedEventId)}
                    className="cursor-pointer hover:bg-slate-50 p-1 rounded transition-colors group flex items-center justify-between gap-1"
                  >
                    <span className="truncate font-medium text-slate-800 group-hover:text-amber-700">
                      {item.title}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-amber-700">
                      {item.timeDisplay}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-400 text-[11px]">全学期课程排程暂无冲突</p>
            )}
          </div>

          {/* 今日待办与上课 */}
          <div className="bg-white/90 rounded-xl p-2.5 border border-slate-200/70 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-teal-800 font-semibold">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-teal-600" />
                今日日程与课程 ({todayEvents.length})
              </span>
              <span className="text-[10px] bg-teal-100 text-teal-800 px-1.5 py-0.2 rounded font-mono">
                提前15m响铃
              </span>
            </div>
            {todayEvents.length > 0 ? (
              <ul className="space-y-1">
                {todayEvents.slice(0, 2).map((item) => (
                  <li
                    key={item.id}
                    onClick={() => handleEventClick(item.relatedEventId)}
                    className="cursor-pointer hover:bg-slate-50 p-1 rounded transition-colors group flex items-center justify-between gap-1"
                  >
                    <span className="truncate font-medium text-slate-800 group-hover:text-teal-700">
                      {item.title}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-slate-500">
                      {item.timeDisplay}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-400 text-[11px]">今日无课程或日程安排</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
