import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  RefreshCw,
  Calendar as CalendarIcon,
  FileUp,
  Sparkles,
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
import { getMondayOfDate, parseEventDateTimeParts } from './dateUtils';
import { ConflictAlertSection } from './components/ConflictAlertSection';
import { WeeklyCalendarView } from './components/WeeklyCalendarView';
import { SemesterWorkloadCharts } from './components/SemesterWorkloadCharts';
import { ReviewPathPanel } from './components/ReviewPathPanel';

export const CalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    highlightedEventId,
    setHighlightedEventId,
    setCurrentUser,
  } = useAppStore();

  const [overview, setOverview] = useState<CalendarOverviewResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [currentWeekMonday, setCurrentWeekMonday] = useState<string>('2026-11-02');
  const [selectedConflictIndex, setSelectedConflictIndex] = useState<number | null>(null);
  const [secondaryHighlightedEventId, setSecondaryHighlightedEventId] = useState<number | null>(
    null
  );
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

  // 当从智能问答引用或外部跳入并携带 highlightedEventId 时，自动切换周视图并滚动到目标事件卡片
  useEffect(() => {
    if (!highlightedEventId || !overview?.events?.length) return;
    const targetEvent = overview.events.find((e) => e.id === highlightedEventId);
    if (!targetEvent) return;

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

  const handleSelectConflict = (pair: ConflictPairDto, index: number) => {
    setSelectedConflictIndex(index);
    setHighlightedEventId(pair.eventA.id);
    setSecondaryHighlightedEventId(pair.eventB.id);

    const conflictDate = parseEventDateTimeParts(pair.overlapStart).dateStr;
    setCurrentWeekMonday(getMondayOfDate(conflictDate));

    window.setTimeout(() => {
      const el = document.getElementById(`calendar-event-${pair.eventA.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);
  };

  const handleJumpToWeek = (mondayStr: string) => {
    setCurrentWeekMonday(mondayStr);
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
        <SkeletonCard lines={3} />
        <SkeletonCard lines={5} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  const hasNoEvents = !overview || overview.events.length === 0;

  return (
    <div className="space-y-6">
      {/* 页面顶栏：标题、刷新与右上角一键导出 .ics 日历按钮 */}
      <div className="college-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-brand-600" />
            <h1 className="text-xl font-bold text-slate-900">
              学期日历、冲突预警与负载热力图
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            一学期，一张图：自动识别日程重叠冲突，量化每周任务密度，考前复习路径倒排写回日历并支持一键导出 .ics。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => fetchOverview(true)}
            className="btn-secondary py-2 px-3 text-xs sm:text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            刷新数据
          </button>

          <button
            type="button"
            disabled={exporting || hasNoEvents}
            onClick={handleExportIcs}
            className="btn-primary py-2 px-4 text-xs sm:text-sm"
          >
            <Download className="w-4 h-4" />
            {exporting ? '正在生成 .ics...' : '一键导出 .ics 日历'}
          </button>
        </div>
      </div>

      {/* 状态反馈提示条 */}
      {toastMsg && (
        <div className="rounded-xl bg-brand-50 border border-brand-200 px-4 py-2.5 text-xs sm:text-sm text-brand-800 font-medium flex items-center justify-between">
          <span>{toastMsg}</span>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="text-xs text-brand-600 hover:underline"
          >
            知道了
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs sm:text-sm text-red-700 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => fetchOverview(true)}
            className="text-xs font-semibold text-red-700 underline"
          >
            点击重试
          </button>
        </div>
      )}

      {hasNoEvents ? (
        <div className="space-y-4">
          <EmptyState
            title="当前学期日历暂无日程事件"
            description="您可以前往「导入与抽取」粘贴课表、教务通知或上传文件，也可以直接点击下方按钮一键载入标准学期示例数据体验完整链路。"
            actionLabel={loadingDemo ? '正在载入示例数据...' : '一键载入示例数据体验'}
            onAction={handleLoadDemo}
          />
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/extract')}
              className="btn-secondary text-xs"
            >
              <FileUp className="w-4 h-4" />
              前往导入教务通知 / 课表
            </button>
            <button
              type="button"
              onClick={() => navigate('/visualize')}
              className="btn-secondary text-xs"
            >
              <Sparkles className="w-4 h-4" />
              浏览知识点可视化工坊
            </button>
          </div>
        </div>
      ) : (
        overview && (
          <>
            {/* 1. 冲突预警卡片区（点击自动跳转周次并高亮冲突事件） */}
            <ConflictAlertSection
              conflicts={overview.conflicts}
              selectedConflictIndex={selectedConflictIndex}
              onSelectConflict={handleSelectConflict}
            />

            {/* 2. 学期负载摘要卡片（最空的一天、最忙的一天、最忙的一周）+ 单色渐变热力图 + ECharts 周密度图 */}
            <SemesterWorkloadCharts
              dailyHeatmap={overview.dailyHeatmap}
              weeklyDensity={overview.weeklyDensity}
              freestDay={overview.freestDay}
              busiestDay={overview.busiestDay}
              busiestWeek={overview.busiestWeek}
              onJumpToWeek={handleJumpToWeek}
            />

            {/* 3. 周视图日历（语义分色、周次切换、支持外部问答与冲突卡片高亮定位） */}
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

            {/* 4. 考前复习路径规划面板（新增知识点、自动倒排写回日历、调整日期、标记完成、跳转可视化） */}
            <ReviewPathPanel
              events={overview.events}
              reviewTopics={overview.reviewTopics}
              scheduling={scheduling}
              onAddTopic={handleAddTopic}
              onScheduleAll={handleScheduleAll}
              onUpdateTopic={handleUpdateTopic}
              onDeleteTopic={handleDeleteTopic}
              onNavigateToVisualize={handleNavigateToVisualize}
            />
          </>
        )
      )}
    </div>
  );
};

export default CalendarPage;
