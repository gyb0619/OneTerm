import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  MapPin,
  BookOpen,
  Sparkles,
  CheckSquare,
  Square,
  AlertCircle,
  FileText,
  X,
} from 'lucide-react';
import type {
  ConflictPairDto,
  EventDto,
  ReviewTopicDto,
  WeeklyDensityItemDto,
} from '../../../shared/types/api';
import {
  addDays,
  EVENT_TYPE_META,
  formatShortDate,
  formatTimeRange,
  getWeekDays,
  parseEventDateTimeParts,
} from '../dateUtils';

interface WeeklyCalendarViewProps {
  events: EventDto[];
  reviewTopics: ReviewTopicDto[];
  conflicts: ConflictPairDto[];
  weeklyDensity: WeeklyDensityItemDto[];
  currentWeekMonday: string;
  onChangeWeekMonday: (mondayStr: string) => void;
  highlightedEventId: number | null;
  secondaryHighlightedEventId: number | null;
  onSelectEvent: (eventId: number | null) => void;
  onToggleReviewTopicDone: (topic: ReviewTopicDto) => void;
  onNavigateToVisualize: (topic: ReviewTopicDto) => void;
}

export const WeeklyCalendarView: React.FC<WeeklyCalendarViewProps> = ({
  events,
  reviewTopics,
  conflicts,
  weeklyDensity,
  currentWeekMonday,
  onChangeWeekMonday,
  highlightedEventId,
  secondaryHighlightedEventId,
  onSelectEvent,
  onToggleReviewTopicDone,
  onNavigateToVisualize,
}) => {
  const [inspectingEvent, setInspectingEvent] = useState<EventDto | null>(null);

  const weekDays = useMemo(() => getWeekDays(currentWeekMonday), [currentWeekMonday]);
  const weekEndStr = weekDays[6]?.dateStr || addDays(currentWeekMonday, 6);

  const conflictEventIds = useMemo(() => {
    const ids = new Set<number>();
    conflicts.forEach((c) => {
      ids.add(c.eventA.id);
      ids.add(c.eventB.id);
    });
    return ids;
  }, [conflicts]);

  const currentWeekDensity = useMemo(
    () => weeklyDensity.find((w) => w.weekStart === currentWeekMonday),
    [weeklyDensity, currentWeekMonday]
  );

  const eventsByDay = useMemo(() => {
    const map: Record<string, EventDto[]> = {};
    weekDays.forEach((d) => {
      map[d.dateStr] = [];
    });

    events.forEach((ev) => {
      const startParts = parseEventDateTimeParts(ev.startTime);
      const endParts = parseEventDateTimeParts(ev.endTime);
      let endInclusive = endParts.dateStr;
      if (endParts.timeStr === '00:00' && endParts.dateStr > startParts.dateStr) {
        endInclusive = addDays(endParts.dateStr, -1);
      }

      weekDays.forEach((day) => {
        if (day.dateStr >= startParts.dateStr && day.dateStr <= endInclusive) {
          map[day.dateStr].push(ev);
        }
      });
    });

    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => a.startTime.localeCompare(b.startTime));
    });
    return map;
  }, [events, weekDays]);

  const reviewTopicsByDay = useMemo(() => {
    const map: Record<string, ReviewTopicDto[]> = {};
    weekDays.forEach((d) => {
      map[d.dateStr] = [];
    });
    reviewTopics.forEach((rt) => {
      if (rt.plannedDate && map[rt.plannedDate]) {
        map[rt.plannedDate].push(rt);
      }
    });
    return map;
  }, [reviewTopics, weekDays]);

  const handleEventClick = (ev: EventDto) => {
    onSelectEvent(ev.id);
    setInspectingEvent(ev);
  };

  return (
    <section className="college-card overflow-hidden">
      {/* 顶部控制栏与图例 */}
      <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/60 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-brand-600" />
            <h2 className="text-base font-bold text-slate-900">周视图日历</h2>
          </div>

          <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => onChangeWeekMonday(addDays(currentWeekMonday, -7))}
              className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              title="上一周"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs sm:text-sm font-semibold text-slate-800">
              {currentWeekMonday} ~ {weekEndStr}
            </span>
            <button
              type="button"
              onClick={() => onChangeWeekMonday(addDays(currentWeekMonday, 7))}
              className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              title="下一周"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {weeklyDensity.length > 0 && (
            <select
              aria-label="选择学期周次"
              value={currentWeekMonday}
              onChange={(e) => onChangeWeekMonday(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {weeklyDensity.map((w, idx) => (
                <option key={w.weekStart} value={w.weekStart}>
                  第 {idx + 1} 周 ({w.weekStart.slice(5)} ~ {w.weekEnd.slice(5)}) · 负载 {w.totalScore} 分
                </option>
              ))}
              {!weeklyDensity.some((w) => w.weekStart === currentWeekMonday) && (
                <option value={currentWeekMonday}>
                  自定义周 ({currentWeekMonday.slice(5)} ~ {weekEndStr.slice(5)})
                </option>
              )}
            </select>
          )}

          {currentWeekDensity && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
              本周负载总分：{currentWeekDensity.totalScore} 分
            </span>
          )}
        </div>

        {/* 色彩语义图例 */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600">
          {(['exam', 'deadline', 'course', 'activity', 'notice'] as const).map((type) => {
            const meta = EVENT_TYPE_META[type];
            return (
              <span key={type} className="inline-flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: meta.dotColor }}
                />
                <span>
                  {meta.label}({meta.weight})
                </span>
              </span>
            );
          })}
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
            <span>考前复习(2)</span>
          </span>
        </div>
      </div>

      {/* 7 天周视图列 */}
      <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-slate-200 bg-white">
        {weekDays.map((day) => {
          const dayEvents = eventsByDay[day.dateStr] || [];
          const dayReviews = reviewTopicsByDay[day.dateStr] || [];
          const hasConflictToday = dayEvents.some((e) => conflictEventIds.has(e.id));

          return (
            <div
              key={day.dateStr}
              className={`min-h-[260px] flex flex-col ${
                day.isWeekend ? 'bg-slate-50/40' : 'bg-white'
              }`}
            >
              {/* 列头：星期 + 日期 */}
              <div
                className={`px-3 py-2.5 border-b border-slate-100 flex items-center justify-between ${
                  hasConflictToday ? 'bg-red-50/70' : 'bg-slate-50/60'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-800">{day.weekdayLabel}</span>
                  <span className="text-xs font-mono text-slate-500">{day.monthDay}</span>
                </div>
                {hasConflictToday ? (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">
                    <AlertCircle className="w-3 h-3" />
                    有冲突
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">
                    {dayEvents.length + dayReviews.length > 0
                      ? `${dayEvents.length + dayReviews.length} 项`
                      : '空闲'}
                  </span>
                )}
              </div>

              {/* 当日卡片列表 */}
              <div className="p-2 space-y-2 flex-1">
                {dayEvents.map((ev) => {
                  const meta = EVENT_TYPE_META[ev.type] || EVENT_TYPE_META.notice;
                  const startParts = parseEventDateTimeParts(ev.startTime);
                  const endParts = parseEventDateTimeParts(ev.endTime);
                  const isHighlighted =
                    highlightedEventId === ev.id || secondaryHighlightedEventId === ev.id;
                  const isConflicting = conflictEventIds.has(ev.id);

                  return (
                    <div
                      key={ev.id}
                      id={`calendar-event-${ev.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleEventClick(ev)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') handleEventClick(ev);
                      }}
                      className={`rounded-lg border p-2.5 text-left cursor-pointer transition-all ${
                        meta.cardClass
                      } ${
                        isHighlighted
                          ? 'ring-2 ring-brand-600 shadow-md scale-[1.02]'
                          : 'shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${meta.badgeClass}`}
                        >
                          {meta.label}
                        </span>
                        <span className="text-[11px] font-mono font-medium opacity-80">
                          {startParts.timeStr}-{endParts.timeStr}
                        </span>
                      </div>

                      <div className="text-xs font-bold leading-snug break-words">{ev.title}</div>

                      {ev.location && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] opacity-80 truncate">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{ev.location}</span>
                        </div>
                      )}

                      {isConflicting && (
                        <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-100/90 px-1.5 py-0.5 rounded">
                          <AlertCircle className="w-3 h-3" />
                          时间冲突
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 当日已排期的考前复习任务 */}
                {dayReviews.map((rt) => (
                  <div
                    key={`review-${rt.id}`}
                    className={`rounded-lg border border-l-4 p-2.5 transition-all shadow-sm ${
                      rt.done
                        ? 'bg-slate-50 border-slate-200 border-l-slate-400 text-slate-500'
                        : 'bg-indigo-50/90 border-indigo-200 border-l-indigo-500 text-indigo-950'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold">
                        考前复习
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggleReviewTopicDone(rt)}
                        className="inline-flex items-center gap-0.5 text-[11px] font-medium text-indigo-700 hover:text-indigo-900"
                        title={rt.done ? '标记为未完成' : '标记为已完成'}
                      >
                        {rt.done ? (
                          <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <div
                      className={`text-xs font-bold leading-snug ${
                        rt.done ? 'line-through opacity-75' : ''
                      }`}
                    >
                      {rt.topic}
                    </div>

                    {(rt.courseName || rt.eventTitle) && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] opacity-80 truncate">
                        <BookOpen className="w-3 h-3 shrink-0" />
                        <span className="truncate">{rt.courseName || rt.eventTitle}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => onNavigateToVisualize(rt)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 hover:text-indigo-900 underline-offset-2 hover:underline"
                    >
                      <Sparkles className="w-3 h-3" />
                      可视化工坊
                    </button>
                  </div>
                ))}

                {dayEvents.length === 0 && dayReviews.length === 0 && (
                  <div className="h-full min-h-[120px] flex items-center justify-center text-xs text-slate-300 select-none">
                    今日无排程
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 选中事件详情与原文追溯浮层卡片 */}
      {inspectingEvent && (
        <div className="p-4 bg-brand-50/60 border-t border-brand-200 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-xs px-2 py-0.5 rounded border font-semibold ${
                  (EVENT_TYPE_META[inspectingEvent.type] || EVENT_TYPE_META.notice).badgeClass
                }`}
              >
                {(EVENT_TYPE_META[inspectingEvent.type] || EVENT_TYPE_META.notice).label}
              </span>
              <h3 className="text-sm font-bold text-slate-900">{inspectingEvent.title}</h3>
              <span className="text-xs text-slate-600 font-mono">
                {formatTimeRange(inspectingEvent.startTime, inspectingEvent.endTime)}
              </span>
              {inspectingEvent.location && (
                <span className="text-xs text-slate-600 inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-brand-600" />
                  {inspectingEvent.location}
                </span>
              )}
            </div>
            {inspectingEvent.sourceText && (
              <div className="text-xs text-slate-700 bg-white/90 border border-slate-200 rounded-lg p-2.5 flex items-start gap-2">
                <FileText className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-800">原文片段追溯：</span>
                  <span className="whitespace-pre-line">{inspectingEvent.sourceText}</span>
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setInspectingEvent(null);
              onSelectEvent(null);
            }}
            className="self-end sm:self-start p-1.5 rounded-lg text-slate-500 hover:bg-white hover:text-slate-800"
            title="关闭详情"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </section>
  );
};
export { formatShortDate };
