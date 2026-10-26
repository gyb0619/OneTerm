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
  GraduationCap,
  ChevronRight,
  Clock,
  Loader2,
  X,
  CheckSquare,
  Square,
  Layers,
  ArrowRight,
} from 'lucide-react';
import type { EventDto, ReviewTopicDto } from '../../../shared/types/api';
import { calendarApi } from '../api';
import { formatShortDate, parseEventDateTimeParts } from '../dateUtils';

interface ReviewPathPanelProps {
  events: EventDto[];
  reviewTopics: ReviewTopicDto[];
  scheduling: boolean;
  onAddTopic: (eventId: number, topic: string, plannedDate?: string) => Promise<void>;
  onBatchAddTopics?: (eventId: number, topics: string[], autoSchedule?: boolean) => Promise<void>;
  onScheduleAll: () => Promise<void>;
  onUpdateTopic: (
    id: number,
    payload: { topic?: string; plannedDate?: string | null; done?: boolean }
  ) => Promise<void>;
  onDeleteTopic: (id: number) => Promise<void>;
  onNavigateToVisualize: (topic: ReviewTopicDto) => void;
}

export interface DetectedSubject {
  name: string;
  examEvent?: EventDto;
  courseEvents: EventDto[];
  representativeEventId: number;
  examDate?: string;
  daysToExam?: number;
  totalTopics: number;
  doneTopics: number;
}

// 辅助清洗提取规范课程名称
function extractCleanCourseName(rawTitle?: string, rawCourse?: string): string {
  if (rawCourse && rawCourse.trim()) {
    return rawCourse.trim();
  }
  if (!rawTitle) return '未命名课程';
  const match = /《(.*?)》/.exec(rawTitle);
  if (match && match[1]) {
    return match[1].trim();
  }
  return rawTitle.replace(/【.*?】/g, '').replace(/（.*?）/g, '').replace(/课程|实验课|期末考试|期中测验|随堂测验/g, '').trim() || rawTitle;
}

export const ReviewPathPanel: React.FC<ReviewPathPanelProps> = ({
  events,
  reviewTopics,
  scheduling,
  onAddTopic,
  onBatchAddTopics,
  onScheduleAll,
  onUpdateTopic,
  onDeleteTopic,
  onNavigateToVisualize,
}) => {
  // 1. 自动检测学期课表，结构化提取每门科目及其关联考试
  const detectedSubjects = useMemo<DetectedSubject[]>(() => {
    const subjectMap = new Map<string, { examEvent?: EventDto; courses: EventDto[]; allEvents: EventDto[] }>();

    for (const ev of events) {
      const name = extractCleanCourseName(ev.title, ev.courseName);
      if (!name) continue;

      if (!subjectMap.has(name)) {
        subjectMap.set(name, { courses: [], allEvents: [] });
      }
      const entry = subjectMap.get(name)!;
      entry.allEvents.push(ev);

      if (ev.type === 'exam') {
        if (!entry.examEvent || ev.startTime < entry.examEvent.startTime) {
          entry.examEvent = ev;
        }
      } else if (ev.type === 'course') {
        entry.courses.push(ev);
      }
    }

    const todayMs = new Date().setHours(0, 0, 0, 0);

    return Array.from(subjectMap.entries()).map(([name, data]) => {
      const repEvent = data.examEvent || (data.courses.length > 0 ? data.courses[0] : data.allEvents[0]);
      let examDate: string | undefined;
      let daysToExam: number | undefined;

      if (data.examEvent) {
        examDate = parseEventDateTimeParts(data.examEvent.startTime).dateStr;
        try {
          const examMs = new Date(examDate).getTime();
          daysToExam = Math.ceil((examMs - todayMs) / (1000 * 3600 * 24));
        } catch {
          // ignore date parse error
        }
      }

      // 统计属于该科目的已规划知识点
      const subjectTopics = reviewTopics.filter((rt) => {
        const topicCourseName = extractCleanCourseName(rt.eventTitle, rt.courseName);
        return topicCourseName === name || data.allEvents.some((e) => e.id === rt.eventId);
      });

      return {
        name,
        examEvent: data.examEvent,
        courseEvents: data.courses,
        representativeEventId: repEvent ? repEvent.id : 0,
        examDate,
        daysToExam,
        totalTopics: subjectTopics.length,
        doneTopics: subjectTopics.filter((t) => t.done).length,
      };
    }).sort((a, b) => {
      // 优先将有考试安排的排在前面，若都有考试则按考试日期先后排列
      if (a.examDate && !b.examDate) return -1;
      if (!a.examDate && b.examDate) return 1;
      if (a.examDate && b.examDate) return a.examDate.localeCompare(b.examDate);
      return b.totalTopics - a.totalTopics;
    });
  }, [events, reviewTopics]);

  // 当前选中的科目（支持 "ALL" 或单科名称）
  const [selectedSubjectName, setSelectedSubjectName] = useState<string>('ALL');

  // 当前选中科目的详情
  const currentSubject = useMemo(() => {
    if (selectedSubjectName === 'ALL') return null;
    return detectedSubjects.find((s) => s.name === selectedSubjectName) || null;
  }, [detectedSubjects, selectedSubjectName]);

  // 过滤展示当前科目的知识点
  const filteredTopics = useMemo(() => {
    if (selectedSubjectName === 'ALL') {
      return reviewTopics;
    }
    return reviewTopics.filter((rt) => {
      const topicCourse = extractCleanCourseName(rt.eventTitle, rt.courseName);
      if (topicCourse === selectedSubjectName) return true;
      const subj = detectedSubjects.find((s) => s.name === selectedSubjectName);
      if (subj) {
        if (subj.examEvent && subj.examEvent.id === rt.eventId) return true;
        if (subj.courseEvents.some((c) => c.id === rt.eventId)) return true;
      }
      return false;
    });
  }, [reviewTopics, selectedSubjectName, detectedSubjects]);

  // 智能梳理知识点弹窗状态（在用户同意下生成）
  const [consentModalOpen, setConsentModalOpen] = useState(false);
  const [modalSubject, setModalSubject] = useState<DetectedSubject | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestedTopicList, setSuggestedTopicList] = useState<string[]>([]);
  const [selectedTopicSet, setSelectedTopicSet] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  // 打开 AI 提炼全科考点弹窗
  const handleOpenSuggestModal = async (subject: DetectedSubject) => {
    setModalSubject(subject);
    setConsentModalOpen(true);
    setSuggestLoading(true);
    try {
      const res = await calendarApi.suggestCourseTopics({
        courseName: subject.name,
        eventId: subject.representativeEventId,
      });
      const list = res.topics && res.topics.length > 0 ? res.topics : [];
      setSuggestedTopicList(list);
      setSelectedTopicSet(new Set(list));
    } catch {
      // 容错降级
      setSuggestedTopicList([
        `《${subject.name}》核心概念与基础理论架构`,
        `《${subject.name}》关键机制与标准执行流程`,
        `《${subject.name}》核心算法/协议分析与应用实践`,
        `《${subject.name}》期末重点题型与推导`,
      ]);
      setSelectedTopicSet(new Set([
        `《${subject.name}》核心概念与基础理论架构`,
        `《${subject.name}》关键机制与标准执行流程`,
        `《${subject.name}》核心算法/协议分析与应用实践`,
      ]));
    } finally {
      setSuggestLoading(false);
    }
  };

  // 切换选中某知识点
  const toggleTopicSelect = (topic: string) => {
    setSelectedTopicSet((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) {
        next.delete(topic);
      } else {
        next.add(topic);
      }
      return next;
    });
  };

  // 全选 / 取消全选
  const toggleSelectAll = () => {
    if (selectedTopicSet.size === suggestedTopicList.length) {
      setSelectedTopicSet(new Set());
    } else {
      setSelectedTopicSet(new Set(suggestedTopicList));
    }
  };

  // 用户点击「同意并导入复习计划」
  const handleConfirmImport = async () => {
    if (!modalSubject || selectedTopicSet.size === 0) return;
    setImporting(true);
    try {
      const topicsToImport = Array.from(selectedTopicSet);
      if (onBatchAddTopics) {
        await onBatchAddTopics(modalSubject.representativeEventId, topicsToImport, true);
      } else {
        for (const t of topicsToImport) {
          await onAddTopic(modalSubject.representativeEventId, t);
        }
        await onScheduleAll();
      }
      setConsentModalOpen(false);
      setSelectedSubjectName(modalSubject.name);
    } catch (err) {
      alert((err as Error).message || '导入考点失败，请稍后重试');
    } finally {
      setImporting(false);
    }
  };

  // 单条手动新增状态
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
      : currentSubject
        ? currentSubject.representativeEventId
        : candidateEvents.length > 0
          ? candidateEvents[0].id
          : '';

  const handleManualSubmit = async (e: React.FormEvent) => {
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
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-5 space-y-4">
      {/* 模块标题与全局动作 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              考前复习路径规划（单科专项）
            </h2>
            <p className="text-[11px] text-slate-400">
              自动检测学期课表并分离各学科，支持一键提炼全科考点细点与交互式可视化仿真
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={scheduling || reviewTopics.length === 0}
            onClick={onScheduleAll}
            className="btn-primary bg-teal-600 hover:bg-teal-700 py-1.5 px-3 text-xs shrink-0 flex items-center gap-1.5"
            title="根据各科目考试日期自动避开冲突日并均衡每日复习负载"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>{scheduling ? '正在倒排...' : '自动倒排全科路径'}</span>
          </button>
        </div>
      </div>

      {/* 每科分开导航标签条 */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => setSelectedSubjectName('ALL')}
          className={`shrink-0 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all ${
            selectedSubjectName === 'ALL'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>全部科目</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            selectedSubjectName === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
          }`}>
            {reviewTopics.length}
          </span>
        </button>

        {detectedSubjects.map((sub) => {
          const isActive = selectedSubjectName === sub.name;
          return (
            <button
              key={sub.name}
              type="button"
              onClick={() => setSelectedSubjectName(sub.name)}
              className={`shrink-0 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all duration-150 ease-out active:scale-95 ${
                isActive
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-slate-50 hover:bg-teal-50/70 text-slate-700 border border-slate-200/80 hover:border-teal-300'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>《{sub.name}》</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                isActive ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-600'
              }`}>
                {sub.doneTopics}/{sub.totalTopics}
              </span>
              {sub.daysToExam !== undefined && sub.daysToExam >= 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : 'bg-rose-50 text-rose-600 border border-rose-200'
                }`}>
                  余{sub.daysToExam}天
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 单科专属复习看板 Banner */}
      {currentSubject ? (
        <div className="bg-gradient-to-r from-teal-50/90 via-slate-50 to-indigo-50/60 p-4 sm:p-5 rounded-2xl border border-teal-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-base font-bold text-slate-900">
                《{currentSubject.name}》
              </span>
              {currentSubject.examDate ? (
                <span className="text-xs px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-medium flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-rose-600" />
                  期末统考：{currentSubject.examDate}
                  {currentSubject.daysToExam !== undefined && (
                    <span className="font-bold">（倒计时 {currentSubject.daysToExam} 天）</span>
                  )}
                </span>
              ) : (
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
                  日常随堂课程
                </span>
              )}
            </div>

            <p className="text-xs sm:text-sm text-slate-500">
              包含 {currentSubject.courseEvents.length} 次课时安排 · 已录入 {currentSubject.totalTopics} 个考前复习知识点
              {currentSubject.totalTopics > 0 && (
                <span>（复习进度：{Math.round((currentSubject.doneTopics / currentSubject.totalTopics) * 100)}%）</span>
              )}
            </p>

            {/* 进度条 */}
            {currentSubject.totalTopics > 0 && (
              <div className="w-full max-w-md h-2 bg-slate-200 rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-teal-600 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.round((currentSubject.doneTopics / currentSubject.totalTopics) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenSuggestModal(currentSubject)}
              className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-xs flex items-center gap-2 transition"
            >
              <Sparkles className="w-4 h-4" />
              <span>智能提炼本学科考点体系</span>
            </button>
          </div>
        </div>
      ) : (
        /* 全部科目总览状态卡 */
        detectedSubjects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {detectedSubjects.map((sub) => (
              <div
                key={sub.name}
                className="p-4 rounded-2xl border border-slate-200/90 hover:border-teal-300 bg-slate-50/50 hover:bg-white transition-all space-y-2.5 flex flex-col justify-between shadow-2xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5">
                    <h3 className="text-sm font-bold text-slate-800 truncate">《{sub.name}》</h3>
                    {sub.daysToExam !== undefined && sub.daysToExam >= 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 font-semibold border border-rose-200/60 shrink-0">
                        剩{sub.daysToExam}天
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {sub.examDate ? `考试日：${sub.examDate}` : '常规学期课程'} · {sub.totalTopics} 个考点
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSelectedSubjectName(sub.name)}
                    className="text-xs sm:text-sm text-teal-700 hover:text-teal-800 font-semibold flex items-center gap-1"
                  >
                    <span>进入单科</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenSuggestModal(sub)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 font-medium flex items-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                    <span>提炼考点体系</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* 手动添加单个复习知识点 */}
      <form onSubmit={handleManualSubmit} className="space-y-3 bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              关联课表 / 考试事件
            </label>
            <select
              value={effectiveEventId}
              onChange={(e) => setSelectedEventId(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
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
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              新增复习考点细点名称
            </label>
            <input
              type="text"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              placeholder="例如：TCP三次握手与四次挥手、滑动窗口流量控制..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={submitting || !effectiveEventId || !topicInput.trim()}
              className="btn-secondary w-full py-2 px-3 text-xs sm:text-sm border-teal-300 text-teal-700 hover:bg-teal-50 flex items-center justify-center gap-1.5 rounded-xl font-medium"
            >
              <Plus className="w-4 h-4" />
              <span>添加考点</span>
            </button>
          </div>
        </div>
      </form>

      {/* 知识点细点列表 */}
      {filteredTopics.length === 0 ? (
        <div className="text-center py-12 text-xs sm:text-sm text-slate-400 border border-dashed border-slate-200 rounded-2xl space-y-2.5">
          <BookOpen className="w-9 h-9 text-slate-300 mx-auto" />
          <p className="font-medium">
            {selectedSubjectName === 'ALL'
              ? '当前尚未添加任何考前复习知识点'
              : `《${selectedSubjectName}》尚未梳理复习知识点`}
          </p>
          {currentSubject && (
            <button
              type="button"
              onClick={() => handleOpenSuggestModal(currentSubject)}
              className="btn-primary bg-teal-600 hover:bg-teal-700 text-xs sm:text-sm py-2 px-4 inline-flex items-center gap-2 mx-auto rounded-xl shadow-xs"
            >
              <Sparkles className="w-4 h-4" />
              <span>智能提炼《{currentSubject.name}》完整考点体系</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredTopics.map((item) => (
            <div
              key={item.id}
              className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-xs shadow-2xs ${
                item.done
                  ? 'bg-slate-50/70 border-slate-200 text-slate-400'
                  : 'bg-white border-slate-200/90 hover:border-teal-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => onUpdateTopic(item.id, { done: !item.done })}
                    className="mt-0.5 text-teal-600 hover:text-teal-700 shrink-0 transition-transform duration-150 active:scale-90 hover:scale-110"
                    title={item.done ? '标记为待复习' : '标记为已完成'}
                  >
                    {item.done ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-400 hover:text-teal-600" />
                    )}
                  </button>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm sm:text-base font-semibold leading-snug transition-all duration-200 ${
                          item.done ? 'line-through text-slate-400' : 'text-slate-900'
                        }`}
                      >
                        {item.topic}
                      </span>
                      {item.done && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                          已掌握
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                        <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                        {item.courseName || item.eventTitle || `事件 #${item.eventId}`}
                      </span>
                      {item.examDate && (
                        <span className="text-rose-600 font-semibold">
                          考试：{formatShortDate(item.examDate)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onDeleteTopic(item.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all duration-150 active:scale-90"
                  title="删除知识点"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* 底部：排期日期调整与一键快速连接交互式可视化 */}
              <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs sm:text-sm">
                  <CalendarIcon className="w-4 h-4 text-teal-600" />
                  <span className="text-slate-500 text-xs">计划复习日:</span>
                  <input
                    type="date"
                    aria-label={`${item.topic} 计划复习日期`}
                    value={item.plannedDate || ''}
                    onChange={(e) =>
                      onUpdateTopic(item.id, { plannedDate: e.target.value || '' })
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  {!item.plannedDate && (
                    <span className="text-amber-600 text-xs font-medium">待自动倒排</span>
                  )}
                </div>

                {/* 快速连接生成 知识点交互式可视化 */}
                <button
                  type="button"
                  onClick={() => onNavigateToVisualize(item)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 active:scale-95 hover:shadow-2xs ${
                    item.visualizationId
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                      : 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100'
                  }`}
                  title="一键直达可视化工坊，生成或查看该知识点的交互式原生仿真沙箱"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{item.visualizationId ? '查看交互仿真' : '生成交互可视化'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 智能提炼考点体系弹窗（经用户知情同意后生成与导入） */}
      {consentModalOpen && modalSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[88vh] animate-scale-in">
            {/* 弹窗头部 */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-teal-50/50">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    智能提炼《{modalSubject.name}》全科考点体系
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    基于学期课表与教学要求，梳理覆盖近乎所有细节的核心知识点
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConsentModalOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 弹窗内容 */}
            <div className="p-5 overflow-y-auto space-y-4">
              {suggestLoading ? (
                <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
                  <span>正在深度梳理《{modalSubject.name}》全套核心知识点考查细点...</span>
                </div>
              ) : (
                <>
                  {/* 用户知情同意说明框 */}
                  <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200/80 text-xs text-teal-900 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-teal-700" />
                      <span>用户知情与授权确认</span>
                    </div>
                    <p className="text-[11px] text-teal-800 leading-relaxed">
                      经您同意后，勾选的知识点将批量加入该科目的考前复习路径。系统将结合考试日期（{modalSubject.examDate || '学期末'}），自动避开时间冲突日并均衡每日复习负载。
                    </p>
                  </div>

                  {/* 考点列表勾选区 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                      <span className="font-semibold">
                        提炼考点细点（已选中 {selectedTopicSet.size} / {suggestedTopicList.length} 项）：
                      </span>
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="text-teal-600 hover:text-teal-700 underline text-[11px]"
                      >
                        {selectedTopicSet.size === suggestedTopicList.length ? '取消全选' : '全部勾选'}
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {suggestedTopicList.map((topic) => {
                        const isChecked = selectedTopicSet.has(topic);
                        return (
                          <div
                            key={topic}
                            onClick={() => toggleTopicSelect(topic)}
                            className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 cursor-pointer transition-all ${
                              isChecked
                                ? 'bg-teal-50/40 border-teal-300 text-slate-800 font-medium'
                                : 'bg-slate-50/60 border-slate-200/80 text-slate-500'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {isChecked ? (
                                <CheckSquare className="w-4 h-4 text-teal-600 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400 shrink-0" />
                              )}
                              <span>{topic}</span>
                            </div>

                            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/60 shrink-0">
                              支持交互仿真
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 弹窗底部操作 */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/70">
              <span className="text-[11px] text-slate-400">
                可随时在复习看板中自由微调各知识点的计划日期
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConsentModalOpen(false)}
                  disabled={importing}
                  className="btn-secondary py-1.5 px-3 text-xs text-slate-600 hover:text-slate-900"
                >
                  取消
                </button>

                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={importing || selectedTopicSet.size === 0 || suggestLoading}
                  className="btn-primary bg-teal-600 hover:bg-teal-700 py-1.5 px-3.5 text-xs flex items-center gap-1.5"
                >
                  {importing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="w-3.5 h-3.5" />
                  )}
                  <span>{importing ? '正在导入并倒排...' : `同意并导入 (${selectedTopicSet.size})`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default ReviewPathPanel;
