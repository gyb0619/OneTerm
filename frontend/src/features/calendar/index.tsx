import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  RefreshCw,
  Calendar as CalendarIcon,
  FileUp,
  Sparkles,
  BarChart3,
  Layers,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  X,
  Compass,
} from 'lucide-react';
import { useAppStore } from '../../shared/store/useAppStore';
import { SkeletonCard } from '../../shared/components/SkeletonCard';
import { EmptyState } from '../../shared/components/EmptyState';
import type {
  CalendarOverviewResponse,
  ConflictPairDto,
  ReviewTopicDto,
} from '../../shared/types/api';
import { calendarApi } from './api';
import {
  addDays,
  DEFAULT_SEMESTER_START,
  DEFAULT_TOTAL_WEEKS,
  EVENT_TYPE_META,
  formatTimeRange,
  getDateOfSemesterWeek,
  getMondayOfDate,
  getSemesterWeekNumber,
  parseEventDateTimeParts,
} from './dateUtils';
import { WeeklyCalendarView } from './components/WeeklyCalendarView';
import { SemesterWorkloadCharts } from './components/SemesterWorkloadCharts';
import { ReviewPathPanel } from './components/ReviewPathPanel';

type CalendarTab = 'weekly' | 'workload' | 'review';

export const CalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    highlightedEventId,
    setHighlightedEventId,
    setCurrentUser,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<CalendarTab>('weekly');
  const [overview, setOverview] = useState<CalendarOverviewResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [currentWeekMonday, setCurrentWeekMonday] = useState<string>('2026-11-02');
  const [showConflictModal, setShowConflictModal] = useState<boolean>(false);
  const [selectedConflictIndex, setSelectedConflictIndex] = useState<number | null>(null);
  const [secondaryHighlightedEventId, setSecondaryHighlightedEventId] = useState<number | null>(null);

  const [scheduling, setScheduling] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [loadingDemo, setLoadingDemo] = useState<boolean>(false);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  const fetchOverview = useCallback(async (preserveWeek = false) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await calendarApi.getOverview();
      setOverview(data);

      if (!preserveWeek) {
        if (data.weeklyDensity && data.weeklyDensity.length > 0) {
          setCurrentWeekMonday(data.weeklyDensity[0].weekStart);
        } else if (data.events && data.events.length > 0) {
          const firstDate = parseEventDateTimeParts(data.events[0].startTime).dateStr;
          setCurrentWeekMonday(getMondayOfDate(firstDate));
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载日历全景失败';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOverview(false);
  }, [fetchOverview]);

  // 当外部携带 highlightedEventId 时，自动切换到周视图并定位
  useEffect(() => {
    if (!highlightedEventId || !overview?.events?.length) return;
    const targetEvent = overview.events.find((e) => e.id === highlightedEventId);
    if (!targetEvent) return;

    setActiveTab('weekly');
    const eventDate = parseEventDateTimeParts(targetEvent.startTime).dateStr;
    const targetMonday = getMondayOfDate(eventDate);
    setCurrentWeekMonday(targetMonday);

    window.setTimeout(() => {
      const el = document.getElementById(`calendar-event-${highlightedEventId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);
  }, [highlightedEventId, overview]);

  const currentWeekNum = useMemo(() => {
    return getSemesterWeekNumber(currentWeekMonday);
  }, [currentWeekMonday]);

  const handleSelectConflict = (pair: ConflictPairDto, index: number) => {
    setSelectedConflictIndex(index);
    setHighlightedEventId(pair.eventA.id);
    setSecondaryHighlightedEventId(pair.eventB.id);

    const conflictDate = parseEventDateTimeParts(pair.overlapStart).dateStr;
    setCurrentWeekMonday(getMondayOfDate(conflictDate));
    setActiveTab('weekly');
    setShowConflictModal(false);

    window.setTimeout(() => {
      const el = document.getElementById(`calendar-event-${pair.eventA.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);
  };

  const handlePrevWeek = () => {
    setCurrentWeekMonday((prev) => addDays(prev, -7));
  };

  const handleNextWeek = () => {
    setCurrentWeekMonday((prev) => addDays(prev, 7));
  };

  const handleResetToCurrentWeek = () => {
    // 默认示例数据教学周为第 11 周（2026-11-02）
    setCurrentWeekMonday('2026-11-02');
  };

  const handleSelectWeekNumber = (week: number) => {
    const monday = getDateOfSemesterWeek(week);
    setCurrentWeekMonday(monday);
  };

  const handleAddTopic = async (eventId: number, topic: string, plannedDate?: string) => {
    try {
      await calendarApi.createReviewTopic({ eventId, topic, plannedDate });
      await fetchOverview(true);
      showToast(`已添加复习知识点「${topic}」`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '新增知识点失败');
    }
  };

  const handleScheduleAll = async () => {
    setScheduling(true);
    try {
      const scheduled = await calendarApi.scheduleReviewTopics();
      await fetchOverview(true);
      showToast(`已自动倒排 ${scheduled.length} 项考前复习任务并写回日历`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '自动排期失败');
    } finally {
      setScheduling(false);
    }
  };

  const handleUpdateTopic = async (
    id: number,
    payload: { topic?: string; plannedDate?: string | null; done?: boolean }
  ) => {
    try {
      await calendarApi.updateReviewTopic(id, payload);
      await fetchOverview(true);
      if (payload.plannedDate !== undefined && payload.plannedDate) {
        setCurrentWeekMonday(getMondayOfDate(payload.plannedDate));
      }
      showToast('复习任务已更新');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '更新复习任务失败');
    }
  };

  const handleDeleteTopic = async (id: number) => {
    try {
      await calendarApi.deleteReviewTopic(id);
      await fetchOverview(true);
      showToast('已删除复习知识点');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '删除复习知识点失败');
    }
  };

  const handleBatchAddTopics = async (
    eventId: number,
    topics: string[],
    autoSchedule = true
  ) => {
    try {
      await calendarApi.batchCreateReviewTopics({
        eventId,
        topics,
        autoSchedule,
      });
      await fetchOverview(true);
      showToast(`已成功导入 ${topics.length} 个考点细点并完成智能考前倒排！`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '批量导入复习考点失败');
      throw err;
    }
  };

  const handleExportIcs = async () => {
    setExporting(true);
    try {
      await calendarApi.downloadIcsFile();
      showToast('已导出 oneterm-calendar.ics，可直接导入手机或系统日历');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '导出 .ics 日历失败');
    } finally {
      setExporting(false);
    }
  };

  const handleNavigateToVisualize = (topic: ReviewTopicDto) => {
    const params = new URLSearchParams({
      topicId: String(topic.id),
      eventId: String(topic.eventId),
      topic: topic.topic,
    });
    navigate(`/visualize?${params.toString()}`);
  };

  const handleLoadDemo = async () => {
    setLoadingDemo(true);
    setErrorMsg(null);
    try {
      const profile = await calendarApi.loadDemoData();
      setCurrentUser(profile);
      await fetchOverview(false);
      showToast('已一键载入标准学期示例数据');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '载入示例数据失败');
    } finally {
      setLoadingDemo(false);
    }
  };

  if (loading && !overview) {
    return (
      <div className="space-y-4">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={6} />
      </div>
    );
  }

  const hasNoEvents = !overview || overview.events.length === 0;
  const conflictCount = overview?.conflicts?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* 顶部现代化操作条：精简分段选项卡与周次切换 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        {/* 视图选项卡 */}
        <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl w-full md:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('weekly')}
            className={`flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'weekly'
                ? 'bg-white text-teal-700 font-semibold shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            周课表
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('workload')}
            className={`flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'workload'
                ? 'bg-white text-teal-700 font-semibold shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            学期热力 & 负载
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('review')}
            className={`flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'review'
                ? 'bg-white text-teal-700 font-semibold shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            考前复习规划
            {overview?.reviewTopics && overview.reviewTopics.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-teal-100 text-teal-800">
                {overview.reviewTopics.length}
              </span>
            )}
          </button>
        </div>

        {/* 右侧：周次快速跳选器与快捷按钮 */}
        <div className="flex flex-wrap items-center justify-end gap-2 w-full md:w-auto text-xs">
          {/* 周次导航器 */}
          {activeTab === 'weekly' && (
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-0.5">
              <button
                type="button"
                onClick={handlePrevWeek}
                className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition-colors"
                title="上一周"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <select
                value={currentWeekNum}
                onChange={(e) => handleSelectWeekNumber(Number(e.target.value))}
                className="bg-transparent text-xs font-bold text-slate-800 py-1 px-2 cursor-pointer focus:outline-none"
              >
                {Array.from({ length: DEFAULT_TOTAL_WEEKS }, (_, i) => i + 1).map((w) => (
                  <option key={w} value={w}>
                    第 {w} 周 {w === 11 ? '(当前学期周)' : ''}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleNextWeek}
                className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition-colors"
                title="下一周"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 冲突预警轻量胶囊 */}
          {conflictCount > 0 && (
            <button
              type="button"
              onClick={() => setShowConflictModal(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-medium hover:bg-amber-100/80 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>{conflictCount} 处冲突</span>
            </button>
          )}

          {/* 导出日历 */}
          <button
            type="button"
            disabled={exporting || hasNoEvents}
            onClick={handleExportIcs}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 text-white font-medium hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-50"
            title="导出 RFC 5545 标准 .ics 日历文件"
          >
            <Download className="w-3.5 h-3.5" />
            <span>.ics 导出</span>
          </button>

          <button
            type="button"
            onClick={() => fetchOverview(true)}
            className="p-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
            title="刷新数据"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 提示消息浮条 */}
      {toastMsg && (
        <div className="rounded-xl bg-teal-50 border border-teal-200 px-3.5 py-2 text-xs text-teal-800 font-medium flex items-center justify-between shadow-sm">
          <span>{toastMsg}</span>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="text-xs text-teal-600 hover:underline"
          >
            关闭
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2 text-xs text-rose-800 font-medium flex items-center justify-between shadow-sm">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs text-rose-600 hover:underline"
          >
            关闭
          </button>
        </div>
      )}

      {/* 空状态引导 */}
      {hasNoEvents ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-sm">
          <EmptyState
            title="当前学期暂无课表日程"
            description="您可以前往「课表导入」上传 .xls / .xlsx 课表或粘贴教务通知，亦可直接点击下方按钮免配置载入标准示例。"
            actionLabel={loadingDemo ? '正在载入示例数据...' : '一键载入标准学期数据体验'}
            onAction={handleLoadDemo}
          />
          <div className="flex justify-center gap-2.5 mt-4">
            <button
              type="button"
              onClick={() => navigate('/extract')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <FileUp className="w-3.5 h-3.5" />
              前往导入课表 / 通知
            </button>
            <button
              type="button"
              onClick={() => navigate('/visualize')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              可视化工坊
            </button>
          </div>
        </div>
      ) : (
        overview && (
          <>
            {/* 标签页 1：周课表视图 */}
            {activeTab === 'weekly' && (
              <WeeklyCalendarView
                events={overview.events}
                reviewTopics={overview.reviewTopics}
                conflicts={overview.conflicts}
                weeklyDensity={overview.weeklyDensity}
                currentWeekMonday={currentWeekMonday}
                onChangeWeekMonday={setCurrentWeekMonday}
                highlightedEventId={highlightedEventId}
                secondaryHighlightedEventId={secondaryHighlightedEventId}
                onSelectEvent={(id) => {
                  setHighlightedEventId(id);
                  setSecondaryHighlightedEventId(null);
                }}
                onToggleReviewTopicDone={(rt) =>
                  handleUpdateTopic(rt.id, { done: !rt.done })
                }
                onNavigateToVisualize={handleNavigateToVisualize}
              />
            )}

            {/* 标签页 2：学期热力图与负载分析 */}
            {activeTab === 'workload' && (
              <SemesterWorkloadCharts
                dailyHeatmap={overview.dailyHeatmap}
                weeklyDensity={overview.weeklyDensity}
                freestDay={overview.freestDay}
                busiestDay={overview.busiestDay}
                busiestWeek={overview.busiestWeek}
                onJumpToWeek={(mondayStr) => {
                  setCurrentWeekMonday(mondayStr);
                  setActiveTab('weekly');
                }}
              />
            )}

            {/* 标签页 3：考前复习路径规划 */}
            {activeTab === 'review' && (
              <ReviewPathPanel
                events={overview.events}
                reviewTopics={overview.reviewTopics}
                scheduling={scheduling}
                onAddTopic={handleAddTopic}
                onBatchAddTopics={handleBatchAddTopics}
                onScheduleAll={handleScheduleAll}
                onUpdateTopic={handleUpdateTopic}
                onDeleteTopic={handleDeleteTopic}
                onNavigateToVisualize={handleNavigateToVisualize}
              />
            )}
          </>
        )
      )}

      {/* 冲突预警轻量弹出层 Modal */}
      {showConflictModal && overview && overview.conflicts.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/50">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  检测到日程冲突（共 {overview.conflicts.length} 处）
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConflictModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 divide-y divide-slate-100">
              {overview.conflicts.map((pair, idx) => {
                const isSelected = selectedConflictIndex === idx;
                const metaA = EVENT_TYPE_META[pair.eventA.type] || EVENT_TYPE_META.notice;
                const metaB = EVENT_TYPE_META[pair.eventB.type] || EVENT_TYPE_META.notice;
                const startA = parseEventDateTimeParts(pair.eventA.startTime);
                const endA = parseEventDateTimeParts(pair.eventA.endTime);
                const startB = parseEventDateTimeParts(pair.eventB.startTime);
                const endB = parseEventDateTimeParts(pair.eventB.endTime);

                return (
                  <div
                    key={idx}
                    className={`pt-3 first:pt-0 p-3 rounded-xl transition-all ${
                      isSelected ? 'bg-amber-50/80 ring-1 ring-amber-400' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded-md">
                        {pair.conflictType === 'FULL_OVERLAP' ? '完全时间冲突' : '部分时间重叠'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSelectConflict(pair, idx)}
                        className="text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline flex items-center gap-1"
                      >
                        定位到日历
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded-lg bg-white border border-slate-200/80">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${metaA.badgeClass}`}>
                            {metaA.label}
                          </span>
                          <span className="font-semibold text-slate-900 truncate">
                            {pair.eventA.title}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 space-y-0.5">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>
                              {startA.dateStr} {startA.timeStr} ~ {endA.timeStr}
                            </span>
                          </div>
                          {pair.eventA.location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              <span>{pair.eventA.location}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="p-2 rounded-lg bg-white border border-slate-200/80">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${metaB.badgeClass}`}>
                            {metaB.label}
                          </span>
                          <span className="font-semibold text-slate-900 truncate">
                            {pair.eventB.title}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 space-y-0.5">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>
                              {startB.dateStr} {startB.timeStr} ~ {endB.timeStr}
                            </span>
                          </div>
                          {pair.eventB.location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              <span>{pair.eventB.location}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowConflictModal(false)}
                className="px-4 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-700 bg-white hover:bg-slate-100"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
