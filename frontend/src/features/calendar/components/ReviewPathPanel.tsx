import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  Plus,
  Wand2,
  Trash2,
  CheckCircle2,
  Circle,
  Calendar as CalendarIcon,
  BookOpen,
} from 'lucide-react';
import type { EventDto, ReviewTopicDto } from '../../../shared/types/api';
import { formatShortDate, parseEventDateTimeParts } from '../dateUtils';

interface ReviewPathPanelProps {
  events: EventDto[];
  reviewTopics: ReviewTopicDto[];
  scheduling: boolean;
  onAddTopic: (eventId: number, topic: string, plannedDate?: string) => Promise<void>;
  onScheduleAll: () => Promise<void>;
  onUpdateTopic: (
    id: number,
    payload: { topic?: string; plannedDate?: string | null; done?: boolean }
  ) => Promise<void>;
  onDeleteTopic: (id: number) => Promise<void>;
  onNavigateToVisualize: (topic: ReviewTopicDto) => void;
}

const PRESET_TOPICS = [
  '冒泡排序',
  'TCP 三次握手',
  '快速排序与分治策略',
  '银行家算法与死锁避免',
  '滑动窗口流量控制',
];

export const ReviewPathPanel: React.FC<ReviewPathPanelProps> = ({
  events,
  reviewTopics,
  scheduling,
  onAddTopic,
  onScheduleAll,
  onUpdateTopic,
  onDeleteTopic,
  onNavigateToVisualize,
}) => {
  const candidateEvents = useMemo(() => {
    const examsAndCourses = events.filter((e) => e.type === 'exam' || e.type === 'course');
    const list = examsAndCourses.length > 0 ? examsAndCourses : events;
    return [...list].sort((a, b) => {
      if (a.type === 'exam' && b.type !== 'exam') return -1;
      if (a.type !== 'exam' && b.type === 'exam') return 1;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [events]);

  const [selectedEventId, setSelectedEventId] = useState<number | ''>('');
  const [topicInput, setTopicInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const effectiveEventId =
    selectedEventId !== ''
      ? selectedEventId
      : candidateEvents.length > 0
        ? candidateEvents[0].id
        : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveEventId || !topicInput.trim()) return;
    setSubmitting(true);
    try {
      await onAddTopic(Number(effectiveEventId), topicInput.trim());
      setTopicInput('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="college-card p-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-brand-600" />
            <h2 className="text-base font-bold text-slate-900">
              考前复习路径规划（倒排与负载均衡）
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            为考试或课程添加核心复习知识点，点击「自动生成考前复习路径」即可按考试日期倒排至考前空闲日、自动避开冲突日并写回日历。
          </p>
        </div>

        <button
          type="button"
          disabled={scheduling || reviewTopics.length === 0}
          onClick={onScheduleAll}
          className="btn-primary shrink-0"
        >
          <Wand2 className="w-4 h-4" />
          {scheduling ? '正在倒排规划...' : '自动生成考前复习路径'}
        </button>
      </div>

      {/* 添加复习知识点表单 */}
      <form onSubmit={handleSubmit} className="space-y-3 bg-slate-50/80 p-4 rounded-xl border border-slate-200/80">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              关联考试 / 课程事件
            </label>
            <select
              value={effectiveEventId}
              onChange={(e) => setSelectedEventId(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {candidateEvents.map((ev) => {
                const datePart = parseEventDateTimeParts(ev.startTime).dateStr;
                const tag = ev.type === 'exam' ? '【考试】' : '【课程】';
                return (
                  <option key={ev.id} value={ev.id}>
                    {tag} {ev.title} ({datePart})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="md:col-span-5">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              复习知识点名称（支持算法与网络协议可视化）
            </label>
            <input
              type="text"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              placeholder="例如：冒泡排序、TCP 三次握手、银行家算法..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={submitting || !effectiveEventId || !topicInput.trim()}
              className="btn-secondary w-full py-2 border-brand-300 text-brand-700 hover:bg-brand-50"
            >
              <Plus className="w-4 h-4" />
              添加知识点
            </button>
          </div>
        </div>

        {/* 快捷填入推荐知识点标签 */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs text-slate-500">快捷填入知识点：</span>
          {PRESET_TOPICS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setTopicInput(preset)}
              className="px-2.5 py-0.5 rounded-full text-xs bg-white border border-slate-200 text-slate-600 hover:border-brand-400 hover:text-brand-700 transition-colors"
            >
              + {preset}
            </button>
          ))}
        </div>
      </form>

      {/* 已添加的复习知识点与排期列表 */}
      {reviewTopics.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl">
          尚未添加考前复习知识点。请在上方选择一场考试并输入知识点（如「冒泡排序」或「TCP 三次握手」）。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {reviewTopics.map((item) => (
            <div
              key={item.id}
              className={`rounded-xl border p-4 flex flex-col justify-between gap-3 transition-all ${
                item.done
                  ? 'bg-slate-50 border-slate-200 text-slate-500'
                  : 'bg-white border-slate-200 hover:border-indigo-300 shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    onClick={() => onUpdateTopic(item.id, { done: !item.done })}
                    className="mt-0.5 text-brand-600 hover:text-brand-700 shrink-0"
                    title={item.done ? '标记为待复习' : '标记为已完成'}
                  >
                    {item.done ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-400 hover:text-brand-600" />
                    )}
                  </button>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm font-bold ${
                          item.done ? 'line-through text-slate-400' : 'text-slate-900'
                        }`}
                      >
                        {item.topic}
                      </span>
                      {item.done && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                          已完成复习
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                        {item.eventTitle || item.courseName || `事件 #${item.eventId}`}
                      </span>
                      {item.examDate && (
                        <span className="text-red-600 font-medium">
                          考试日：{formatShortDate(item.examDate)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onDeleteTopic(item.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="删除知识点"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <CalendarIcon className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="text-slate-600 font-medium">计划复习日：</span>
                  <input
                    type="date"
                    aria-label={`${item.topic} 计划复习日期`}
                    value={item.plannedDate || ''}
                    onChange={(e) =>
                      onUpdateTopic(item.id, { plannedDate: e.target.value || '' })
                    }
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  {!item.plannedDate && (
                    <span className="text-amber-600 text-[11px]">待自动倒排</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onNavigateToVisualize(item)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {item.visualizationId ? '查看交互式可视化' : '生成知识点可视化'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
