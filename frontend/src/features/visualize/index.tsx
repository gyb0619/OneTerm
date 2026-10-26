import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Code2,
  Cpu,
  Eye,
  FileCode2,
  History,
  Layers,
  Network,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Loader2,
} from 'lucide-react';
import { useSseStream } from '../../shared/hooks/useSseStream';
import { useAppStore } from '../../shared/store/useAppStore';
import { SkeletonCard } from '../../shared/components/SkeletonCard';
import { EmptyState } from '../../shared/components/EmptyState';
import type {
  ApiError,
  EventDto,
  ReviewTopicDto,
  VisualizationDto,
} from '../../shared/types/api';
import { visualizeApi, type GenerateVisualizePayload } from './visualizeApi';

interface QuickPreset {
  topic: string;
  category: '算法与数据结构' | '计算机网络协议';
  summary: string;
}

const QUICK_PRESETS: QuickPreset[] = [
  {
    topic: '冒泡排序',
    category: '算法与数据结构',
    summary: '相邻比较与交换 · O(n²) 稳定排序',
  },
  {
    topic: 'TCP 三次握手',
    category: '计算机网络协议',
    summary: 'SYN / SYN+ACK / ACK 状态机演进',
  },
  {
    topic: '快速排序',
    category: '算法与数据结构',
    summary: '基准划分与分治递归过程',
  },
  {
    topic: '滑动窗口协议',
    category: '计算机网络协议',
    summary: '发送窗口与接收窗口推进控制',
  },
];

const MAX_SANDBOX_BYTES = 100 * 1024;

function calcUtf8Bytes(text: string): number {
  if (!text) return 0;
  try {
    return new TextEncoder().encode(text).length;
  } catch {
    return text.length;
  }
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatCreatedAt(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export const VisualizePage: React.FC = () => {
  const [searchParams] = useSearchParams();

  const [topicInput, setTopicInput] = useState<string>(
    () => searchParams.get('topic') || '冒泡排序'
  );
  const [selectedEventId, setSelectedEventId] = useState<number | null>(() => {
    const p = searchParams.get('eventId');
    return p ? Number(p) : null;
  });
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(() => {
    const p = searchParams.get('topicId');
    return p ? Number(p) : null;
  });

  const [events, setEvents] = useState<EventDto[]>([]);
  const [reviewTopics, setReviewTopics] = useState<ReviewTopicDto[]>([]);
  const [historyList, setHistoryList] = useState<VisualizationDto[]>([]);
  const [activeViz, setActiveViz] = useState<VisualizationDto | null>(null);

  const [loadingInit, setLoadingInit] = useState(false);
  const [loadingDetailId, setLoadingDetailId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [viewMode, setViewMode] = useState<'sandbox' | 'source'>('sandbox');
  const [iframeKey, setIframeKey] = useState<number>(0);

  const [lastPayload, setLastPayload] = useState<GenerateVisualizePayload | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [lastUsage, setLastUsage] = useState<{
    promptTokens: number;
    completionTokens: number;
  } | null>(null);

  const {
    streaming,
    progress,
    accumulatedText,
    error: streamError,
    startStream,
    abortStream,
  } = useSseStream<VisualizationDto>();

  const receivedStreamBytes = useMemo(
    () => calcUtf8Bytes(accumulatedText),
    [accumulatedText]
  );
  const activeHtmlBytes = useMemo(
    () => calcUtf8Bytes(activeViz?.html || ''),
    [activeViz?.html]
  );

  // 流式生成进度平滑递增与智能综合百分比计算，杜绝 0% 卡顿
  const [smoothProgress, setSmoothProgress] = useState<number>(0);

  useEffect(() => {
    if (!streaming) {
      setSmoothProgress(0);
      return;
    }
    setSmoothProgress(14);
    const interval = window.setInterval(() => {
      setSmoothProgress((prev) => {
        if (prev >= 94) return prev;
        const increment = prev < 40 ? 2.5 : prev < 75 ? 1.2 : 0.4;
        return Math.min(94, +(prev + increment).toFixed(1));
      });
    }, 200);

    return () => {
      window.clearInterval(interval);
    };
  }, [streaming]);

  const displayPercent = useMemo(() => {
    if (!streaming) return 0;
    const backendPercent =
      progress && progress.total > 0
        ? Math.round((progress.current / progress.total) * 100)
        : 0;
    const bytePercent = Math.min(
      92,
      Math.round(15 + (receivedStreamBytes / 16384) * 75)
    );
    return Math.min(98, Math.max(12, Math.round(smoothProgress), bytePercent, backendPercent));
  }, [streaming, progress, receivedStreamBytes, smoothProgress]);

  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>('ALL');

  const courseOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const rt of reviewTopics) {
      const raw = rt.courseName || rt.eventTitle || '综合考点';
      const clean = raw.replace(/【.*?】/g, '').replace(/（.*?）/g, '').trim() || raw;
      map.set(clean, (map.get(clean) || 0) + 1);
    }
    return Array.from(map.entries()).map(([course, count]) => ({ course, count }));
  }, [reviewTopics]);

  const filteredReviewTopics = useMemo(() => {
    if (selectedCourseFilter === 'ALL') return reviewTopics;
    return reviewTopics.filter((rt) => {
      const raw = rt.courseName || rt.eventTitle || '综合考点';
      const clean = raw.replace(/【.*?】/g, '').replace(/（.*?）/g, '').trim() || raw;
      return clean === selectedCourseFilter;
    });
  }, [reviewTopics, selectedCourseFilter]);

  const getTopicViz = useCallback(
    (rt: ReviewTopicDto): VisualizationDto | undefined => {
      if (rt.visualizationId) {
        const matchId = historyList.find((h) => h.id === rt.visualizationId);
        if (matchId) return matchId;
      }
      return historyList.find(
        (h) => (h.topic || '').trim().toLowerCase() === (rt.topic || '').trim().toLowerCase()
      );
    },
    [historyList]
  );

  const handleSelectReviewTopic = async (rt: ReviewTopicDto) => {
    setTopicInput(rt.topic);
    setSelectedEventId(rt.eventId);
    setSelectedTopicId(rt.id);
    setActionError(null);

    const existing = getTopicViz(rt);
    if (existing) {
      await handleSelectHistoryItem(existing);
    }
  };

  const handleGenerateFromReviewTopic = (rt: ReviewTopicDto) => {
    setTopicInput(rt.topic);
    setSelectedEventId(rt.eventId);
    setSelectedTopicId(rt.id);
    triggerGenerate({
      topic: rt.topic,
      eventId: rt.eventId,
      topicId: rt.id,
    });
  };

  const loadWorkspaceData = useCallback(
    async (preferVizId?: number | null) => {
      setLoadingInit(true);
      setActionError(null);
      try {
        const [evList, topicList, vizList] = await Promise.all([
          visualizeApi.listEvents(),
          visualizeApi.listReviewTopics(),
          visualizeApi.list(),
        ]);
        setEvents(evList);
        setReviewTopics(topicList);
        setHistoryList(vizList);

        const paramTopic = searchParams.get('topic');
        const paramTopicId = searchParams.get('topicId');
        let matchedViz: VisualizationDto | undefined;

        if (paramTopicId) {
          const tId = Number(paramTopicId);
          const foundTopic = topicList.find((t) => t.id === tId);
          if (foundTopic && foundTopic.visualizationId) {
            matchedViz = vizList.find((v) => v.id === foundTopic.visualizationId);
          }
        }
        if (!matchedViz && paramTopic) {
          matchedViz = vizList.find(
            (v) => (v.topic || '').trim().toLowerCase() === paramTopic.trim().toLowerCase()
          );
        }
        if (!matchedViz && preferVizId != null) {
          matchedViz = vizList.find((v: VisualizationDto) => v.id === preferVizId);
        }

        if (matchedViz) {
          setActiveViz(matchedViz);
        } else if (vizList.length > 0) {
          setActiveViz(vizList[0]);
        }
      } catch (err) {
        setActionError({
          code: 'FETCH_FAILED',
          message: (err as Error).message || '加载工坊初始数据失败',
        });
      } finally {
        setLoadingInit(false);
      }
    },
    [searchParams]
  );

  useEffect(() => {
    void loadWorkspaceData();
  }, [loadWorkspaceData]);

  const triggerGenerate = useCallback(
    async (payload: GenerateVisualizePayload) => {
      if (streaming) return;
      setActionError(null);
      setLastPayload(payload);
      setLastUsage(null);

      await startStream(
        '/api/visualize/generate/stream',
        payload,
        {
          onDone: (doneEvent) => {
            const result = doneEvent.result;
            if (result && result.html) {
              setActiveViz(result);
              setIframeKey((k) => k + 1);
              setViewMode('sandbox');
              setHistoryList((prev) => {
                const filtered = prev.filter((item) => item.id !== result.id);
                return [result, ...filtered];
              });
            }
            if (doneEvent.usage) {
              setLastUsage(doneEvent.usage);
            }
            // 流式生成完成，立即拉取最新 Token 额度
            void useAppStore.getState().refreshCurrentUser();
          },
        }
      );
    },
    [startStream, streaming]
  );

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const topic = topicInput.trim();
    if (!topic || streaming) return;
    triggerGenerate({
      topic,
      eventId: selectedEventId,
      topicId: selectedTopicId,
    });
  };

  const handleQuickPresetClick = (presetTopic: string) => {
    setTopicInput(presetTopic);
    setSelectedTopicId(null);
    setActionError(null);
  };

  const handleRetryGenerate = () => {
    if (lastPayload) {
      triggerGenerate(lastPayload);
    } else {
      triggerGenerate({
        topic: topicInput,
        eventId: selectedEventId,
        topicId: selectedTopicId,
      });
    }
  };

  const handleSelectHistoryItem = async (item: VisualizationDto) => {
    setActionError(null);
    if (item.html && item.html.trim().length > 0) {
      setActiveViz(item);
      setIframeKey((k) => k + 1);
      return;
    }
    setLoadingDetailId(item.id);
    try {
      const full = await visualizeApi.getById(item.id);
      setActiveViz(full);
      setIframeKey((k) => k + 1);
    } catch (err) {
      setActionError({
        code: 'LOAD_FAILED',
        message: (err as Error).message || '加载可视化详情失败',
      });
    } finally {
      setLoadingDetailId(null);
    }
  };

  const handleDeleteHistoryItem = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingId != null) return;
    setDeletingId(id);
    setActionError(null);
    try {
      await visualizeApi.remove(id);
      setHistoryList((prev) => {
        const remaining = prev.filter((item) => item.id !== id);
        if (activeViz?.id === id) {
          setActiveViz(remaining[0] || null);
        }
        return remaining;
      });
    } catch (err) {
      setActionError({
        code: 'DELETE_FAILED',
        message: (err as Error).message || '删除可视化记录失败',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const combinedError = streamError || actionError;

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-6">
      {/* 现代化顶栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">知识点交互式可视化工坊</h1>
            <p className="text-xs text-slate-500 mt-0.5">课程提炼考点动态仿真 · 算法与协议单文件原生沙箱演示</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-xs font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            安全沙箱隔离 (allow-scripts)
          </span>
        </div>
      </div>

      {/* 主体两栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* 左侧：课程提炼考点与控制台 */}
        <div className="lg:col-span-5 space-y-4">
          {/* 1. 课程提炼出来的考点面板（自动呈现，支持按学科筛选与一键仿真联动） */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-teal-600" />
                <h2 className="text-sm sm:text-base font-bold text-slate-900">课程提炼考点</h2>
              </div>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200/70 font-semibold">
                共 {reviewTopics.length} 个考点
              </span>
            </div>

            {/* 学科分段选项卡 */}
            {courseOptions.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedCourseFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
                    selectedCourseFilter === 'ALL'
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200/70 text-slate-600'
                  }`}
                >
                  全部 ({reviewTopics.length})
                </button>
                {courseOptions.map(({ course, count }) => (
                  <button
                    key={course}
                    type="button"
                    onClick={() => setSelectedCourseFilter(course)}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      selectedCourseFilter === course
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200/70 text-slate-600'
                    }`}
                  >
                    《{course}》 ({count})
                  </button>
                ))}
              </div>
            )}

            {/* 考点列表 */}
            {filteredReviewTopics.length === 0 ? (
              <div className="text-center py-8 text-xs sm:text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl space-y-1.5">
                <BookOpen className="w-7 h-7 text-slate-300 mx-auto" />
                <p>暂无相关课程提炼考点</p>
                <p className="text-xs text-slate-400">可在「学期日历 - 考前复习规划」中智能生成，或在下方输入生成</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                {filteredReviewTopics.map((rt) => {
                  const existingViz = getTopicViz(rt);
                  const isCurrentlyActive = activeViz && existingViz && activeViz.id === existingViz.id;
                  const isInputActive = topicInput.trim().toLowerCase() === rt.topic.trim().toLowerCase();

                  return (
                    <div
                      key={`review-topic-${rt.id}`}
                      className={`p-3 rounded-xl border transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-xs flex flex-col justify-between gap-2 shadow-2xs ${
                        isCurrentlyActive || isInputActive
                          ? 'border-teal-400 bg-teal-50/50 shadow-xs'
                          : 'border-slate-200/90 bg-slate-50/50 hover:bg-white hover:border-teal-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 leading-snug">
                            {rt.topic}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span className="text-slate-500 font-medium">
                              《{rt.courseName || rt.eventTitle || '未命名课程'}》
                            </span>
                            {rt.examDate && (
                              <span className="text-rose-600">统考: {rt.examDate}</span>
                            )}
                          </div>
                        </div>

                        {existingViz ? (
                          <button
                            type="button"
                            onClick={() => handleSelectReviewTopic(rt)}
                            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold transition-all duration-150 active:scale-95"
                            title="该考点已有仿真动画，点击立即在右侧沙箱展示"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>已有仿真</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleGenerateFromReviewTopic(rt)}
                            disabled={streaming}
                            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 text-xs font-semibold transition-all duration-150 active:scale-95 disabled:opacity-50"
                            title="点击一键生成该考点的动态交互仿真沙箱"
                          >
                            <Play className="w-3 h-3 text-teal-600" />
                            <span>生成仿真</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. 自定义考点生成控制面板 */}
          <form onSubmit={handleFormSubmit} className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm sm:text-base font-bold text-slate-900">自定义生成仿真</span>
              <span className="text-xs text-slate-400">零外链 · 交互控件</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                知识点名称
              </label>
              <input
                type="text"
                value={topicInput}
                onChange={(e) => {
                  setTopicInput(e.target.value);
                  setSelectedTopicId(null);
                }}
                disabled={streaming}
                placeholder="例如：冒泡排序、TCP 三次握手、红黑树插入旋转..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>

            {/* 推荐考点胶囊 */}
            <div>
              <span className="block text-xs text-slate-400 mb-2">快捷推荐：</span>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_PRESETS.map((p) => {
                  const isActive = topicInput.trim() === p.topic;
                  return (
                    <button
                      key={p.topic}
                      type="button"
                      disabled={streaming}
                      onClick={() => handleQuickPresetClick(p.topic)}
                      className={`text-left p-2.5 rounded-xl border text-xs transition-all duration-150 ease-out active:scale-95 hover:-translate-y-0.5 hover:shadow-2xs ${
                        isActive
                          ? 'border-teal-500 bg-teal-50/70 text-teal-900 font-semibold shadow-xs'
                          : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="truncate font-semibold">{p.topic}</div>
                      <div className="text-xs text-slate-400 truncate mt-0.5">{p.summary}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={streaming || !topicInput.trim()}
              className="w-full btn-primary bg-teal-600 hover:bg-teal-700 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 rounded-xl shadow-xs"
            >
              {streaming ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {streaming ? '正在流式生成动画...' : '生成交互式可视化'}
            </button>
          </form>

          {/* 3. 已生成历史卡片 */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <History className="w-4 h-4 text-teal-600" />
                已生成历史 ({historyList.length})
              </span>
              <button
                type="button"
                onClick={() => loadWorkspaceData(null)}
                disabled={loadingInit || streaming}
                className="text-xs text-slate-400 hover:text-teal-700 font-medium"
              >
                刷新
              </button>
            </div>

            {loadingInit ? (
              <div className="space-y-2">
                <SkeletonCard lines={2} />
              </div>
            ) : historyList.length === 0 ? (
              <div className="text-center py-6 text-xs sm:text-sm text-slate-400">暂无已保存的可视化</div>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {historyList.map((item) => {
                  const isSelected = activeViz?.id === item.id;
                  const itemBytes = calcUtf8Bytes(item.html);
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectHistoryItem(item)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs sm:text-sm cursor-pointer transition ${
                        isSelected
                          ? 'border-teal-500 bg-teal-50/60 font-semibold text-teal-900'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{item.topic}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{formatByteSize(itemBytes)}</span>
                          <span>·</span>
                          <span>{formatCreatedAt(item.createdAt)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 transition"
                        title="删除记录"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：沙箱展示区 */}
        <div className="lg:col-span-7 space-y-4">
          {/* 流式生成高质感进度面板 */}
          {streaming && (
            <div className="bg-gradient-to-b from-teal-50/70 to-white rounded-2xl border border-teal-200/90 p-5 text-xs sm:text-sm space-y-4 shadow-sm animate-in fade-in duration-200">
              {/* 头部：标题与百分比大字 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-teal-100/80 text-teal-700 flex items-center justify-center shrink-0">
                    <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                      正在流式构建仿真沙箱
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-1">
                      {progress?.message ||
                        (displayPercent < 25
                          ? '已加载提示词模板，正在初始化仿真画布...'
                          : displayPercent < 85
                          ? '流式接收仿真脚本与动画逻辑...'
                          : '正在执行 HTML 安全沙箱隔离检测...')}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <span className="text-xl sm:text-2xl font-black text-teal-700 font-mono tracking-tight">
                    {displayPercent}%
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    已传输 {formatByteSize(receivedStreamBytes)}
                  </span>
                </div>
              </div>

              {/* 进度条轨道 */}
              <div className="w-full bg-slate-200/80 h-3 rounded-full overflow-hidden p-0.5 shadow-inner">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-500 via-emerald-400 to-teal-600 transition-all duration-300 ease-out shadow-xs relative"
                  style={{ width: `${displayPercent}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
                </div>
              </div>

              {/* 四阶段指示器 */}
              <div className="grid grid-cols-4 gap-2 pt-1 border-t border-slate-100">
                {[
                  { label: '提示词装载', active: displayPercent >= 10, done: displayPercent >= 25 },
                  { label: '代码流式产出', active: displayPercent >= 25, done: displayPercent >= 85 },
                  { label: '沙箱安全检测', active: displayPercent >= 85, done: displayPercent >= 96 },
                  { label: '渲染沙箱就绪', active: displayPercent >= 96, done: false },
                ].map((st) => (
                  <div key={st.label} className="flex flex-col items-center text-center gap-1">
                    <div
                      className={`w-2 h-2 rounded-full transition-colors ${
                        st.done
                          ? 'bg-emerald-500 ring-2 ring-emerald-200'
                          : st.active
                          ? 'bg-teal-600 ring-2 ring-teal-200 animate-pulse'
                          : 'bg-slate-300'
                      }`}
                    />
                    <span
                      className={`text-[11px] truncate ${
                        st.active ? 'text-teal-900 font-semibold' : 'text-slate-400'
                      }`}
                    >
                      {st.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {combinedError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{combinedError.message}</span>
              </div>
              <button
                type="button"
                onClick={handleRetryGenerate}
                className="btn-secondary py-1 px-3 text-xs text-rose-700 border-rose-300 hover:bg-rose-100 font-medium"
              >
                重试
              </button>
            </div>
          )}

          {!activeViz ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center text-sm text-slate-400 shadow-xs">
              请在左侧选择或输入考点生成交互式可视化页面
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
              <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between text-xs sm:text-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-bold text-slate-900 truncate text-base">{activeViz.topic}</span>
                  <span className="text-xs text-slate-400 font-mono">
                    {formatByteSize(activeHtmlBytes)} · {activeViz.promptVersion}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewMode(viewMode === 'sandbox' ? 'source' : 'sandbox')}
                    className="btn-secondary py-1.5 px-3 text-xs sm:text-sm flex items-center gap-1.5 active:scale-95 transition-all duration-150"
                  >
                    {viewMode === 'sandbox' ? <Code2 className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    <span>{viewMode === 'sandbox' ? '源码' : '沙箱'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIframeKey((k) => k + 1)}
                    className="btn-secondary py-1.5 px-2.5 text-xs sm:text-sm active:scale-90 hover:rotate-180 transition-all duration-300"
                    title="重置刷新"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {viewMode === 'sandbox' ? (
                <iframe
                  key={`${activeViz.id}-${iframeKey}`}
                  title={`viz-${activeViz.id}`}
                  sandbox="allow-scripts"
                  srcDoc={activeViz.html}
                  className="w-full h-[620px] border-0 bg-slate-50 animate-fade-in"
                />
              ) : (
                <pre className="p-5 bg-slate-900 text-slate-100 text-xs sm:text-sm font-mono h-[620px] overflow-auto whitespace-pre-wrap leading-relaxed animate-fade-in">
                  {activeViz.html}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VisualizePage;
