import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Code2,
  Cpu,
  Eye,
  FileCode2,
  History,
  Network,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useSseStream } from '../../shared/hooks/useSseStream';
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
    summary: '相邻比较与交换 · O(n²) 稳定排序动画',
  },
  {
    topic: 'TCP 三次握手',
    category: '计算机网络协议',
    summary: 'SYN / SYN+ACK / ACK 双端状态机演进',
  },
  {
    topic: '快速排序',
    category: '算法与数据结构',
    summary: '基准划分 (Partition) 与分治递归过程',
  },
  {
    topic: '滑动窗口协议',
    category: '计算机网络协议',
    summary: '发送窗口与接收窗口推进及确认控制',
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
  if (bytes < 1024) {
    return `${bytes} B`;
  }
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

/**
 * 知识点交互式可视化工坊页（归属：子代理 D）
 */
export const VisualizePage: React.FC = () => {
  const [searchParams] = useSearchParams();

  const [topicInput, setTopicInput] = useState<string>(
    () => searchParams.get('topic') || '冒泡排序'
  );
  const [selectedEventId, setSelectedEventId] = useState<number | null>(() => {
    const raw = searchParams.get('eventId');
    return raw ? Number(raw) : null;
  });
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(() => {
    const raw = searchParams.get('topicId');
    return raw ? Number(raw) : null;
  });

  const [events, setEvents] = useState<EventDto[]>([]);
  const [reviewTopics, setReviewTopics] = useState<ReviewTopicDto[]>([]);
  const [historyList, setHistoryList] = useState<VisualizationDto[]>([]);
  const [activeViz, setActiveViz] = useState<VisualizationDto | null>(null);

  const [loadingInit, setLoadingInit] = useState<boolean>(true);
  const [loadingDetailId, setLoadingDetailId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [viewMode, setViewMode] = useState<'sandbox' | 'source'>('sandbox');
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [lastPayload, setLastPayload] = useState<GenerateVisualizePayload | null>(null);
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

  const loadWorkspaceData = useCallback(async (focusTopicId?: number | null) => {
    setLoadingInit(true);
    try {
      const [vizList, eventList, topicList] = await Promise.all([
        visualizeApi.list().catch(() => [] as VisualizationDto[]),
        visualizeApi.listEvents().catch(() => [] as EventDto[]),
        visualizeApi.listReviewTopics().catch(() => [] as ReviewTopicDto[]),
      ]);

      setHistoryList(vizList);
      setEvents(
        eventList.filter((ev) => ev.type === 'exam' || ev.type === 'course')
      );
      setReviewTopics(topicList);

      if (vizList.length > 0) {
        const matchedByTopicId =
          focusTopicId != null
            ? vizList.find((v) => v.topicId === focusTopicId)
            : undefined;
        setActiveViz((prev) => matchedByTopicId || prev || vizList[0]);
      }
    } finally {
      setLoadingInit(false);
    }
  }, []);

  useEffect(() => {
    const queryTopicId = searchParams.get('topicId');
    loadWorkspaceData(queryTopicId ? Number(queryTopicId) : null);
  }, [loadWorkspaceData, searchParams]);

  const receivedStreamBytes = useMemo(
    () => calcUtf8Bytes(accumulatedText),
    [accumulatedText]
  );

  const activeHtmlBytes = useMemo(
    () => (activeViz ? calcUtf8Bytes(activeViz.html) : 0),
    [activeViz]
  );

  const triggerGenerate = useCallback(
    async (payload: GenerateVisualizePayload) => {
      const trimmedTopic = payload.topic.trim();
      if (!trimmedTopic) {
        setActionError({
          code: 'BAD_REQUEST',
          message: '请输入要生成可视化的知识点名称（例如：冒泡排序、TCP 三次握手）',
        });
        return;
      }

      setActionError(null);
      setLastUsage(null);
      const normalizedPayload: GenerateVisualizePayload = {
        topic: trimmedTopic,
        eventId: payload.eventId ?? null,
        topicId: payload.topicId ?? null,
      };
      setLastPayload(normalizedPayload);

      await startStream('/api/visualize/generate/stream', normalizedPayload, {
        onDone: (doneEvent) => {
          const generated = doneEvent.result;
          if (doneEvent.usage) {
            setLastUsage(doneEvent.usage);
          }
          if (generated && generated.id) {
            setActiveViz(generated);
            setViewMode('sandbox');
            setIframeKey((k) => k + 1);
            setHistoryList((prev) => [
              generated,
              ...prev.filter((item) => item.id !== generated.id),
            ]);
          }
        },
      });
    },
    [startStream]
  );

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    triggerGenerate({
      topic: topicInput,
      eventId: selectedEventId,
      topicId: selectedTopicId,
    });
  };

  const handleQuickPresetClick = (presetTopic: string, autoStart = false) => {
    setTopicInput(presetTopic);
    setSelectedTopicId(null);
    setActionError(null);
    if (autoStart && !streaming) {
      triggerGenerate({
        topic: presetTopic,
        eventId: selectedEventId,
        topicId: null,
      });
    }
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
  const progressPercent = useMemo(() => {
    if (!progress || !progress.total || progress.total <= 0) return 35;
    return Math.min(100, Math.max(10, Math.round((progress.current / progress.total) * 100)));
  }, [progress]);

  return (
    <div className="space-y-6">
      {/* 顶部模块标题与安全沙箱状态栏 */}
      <div className="college-card p-6 bg-gradient-to-r from-white via-teal-50/40 to-sky-50/40">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-600 text-white">
                <Sparkles className="w-4 h-4" />
              </span>
              <h1 className="text-xl font-bold text-slate-900">
                知识点交互式可视化工坊
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2.5 py-0.5 text-xs font-medium text-teal-700">
                Prompt {activeViz?.promptVersion || 'v1.0'}
              </span>
            </div>
            <p className="text-sm text-slate-600">
              输入算法与数据结构或计算机网络协议考点，生成带进度滑块与控制按钮的单文件交互动画，并在零外链安全沙箱中隔离运行。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 font-medium text-emerald-800">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              安全沙箱已启用 (sandbox=&quot;allow-scripts&quot;)
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 border border-slate-200 px-3 py-1.5 font-medium text-slate-700">
              体积上限 ≤ 100KB · 零外链校验
            </span>
          </div>
        </div>
      </div>

      {/* 主体双栏布局：左侧输入与历史列表 / 右侧流式进度与沙箱舞台 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 左侧控制面板与历史记录 */}
        <div className="lg:col-span-4 space-y-6">
          {/* 知识点生成表单 */}
          <form onSubmit={handleFormSubmit} className="college-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-brand-600" />
                生成交互式可视化
              </h2>
              <span className="text-xs text-slate-400">支持算法 / 网络协议</span>
            </div>

            {/* 关联考试/课程事件选择 */}
            <div>
              <label
                htmlFor="visualize-event-select"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                关联考试 / 课程事件（可选）
              </label>
              <select
                id="visualize-event-select"
                value={selectedEventId ?? ''}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : null;
                  setSelectedEventId(val);
                  setSelectedTopicId(null);
                }}
                disabled={streaming}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100"
              >
                <option value="">不限定特定事件（自动归入复习知识点）</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    [{ev.type === 'exam' ? '考试' : '课程'}] {ev.title}
                  </option>
                ))}
              </select>
            </div>

            {/* 已有复习知识点快捷关联（若存在） */}
            {reviewTopics.length > 0 && (
              <div>
                <label
                  htmlFor="visualize-topic-select"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  从考前复习清单选择知识点（可选）
                </label>
                <select
                  id="visualize-topic-select"
                  value={selectedTopicId ?? ''}
                  onChange={(e) => {
                    const tid = e.target.value ? Number(e.target.value) : null;
                    setSelectedTopicId(tid);
                    if (tid != null) {
                      const found = reviewTopics.find((t) => t.id === tid);
                      if (found) {
                        setTopicInput(found.topic);
                        if (found.eventId) {
                          setSelectedEventId(found.eventId);
                        }
                      }
                    }
                  }}
                  disabled={streaming}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100"
                >
                  <option value="">手动输入新知识点...</option>
                  {reviewTopics.map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {rt.topic}
                      {rt.courseName ? `（${rt.courseName}）` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 知识点名称输入 */}
            <div>
              <label
                htmlFor="visualize-topic-input"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                知识点名称 <span className="text-red-500">*</span>
              </label>
              <input
                id="visualize-topic-input"
                type="text"
                value={topicInput}
                onChange={(e) => {
                  setTopicInput(e.target.value);
                  setSelectedTopicId(null);
                }}
                disabled={streaming}
                placeholder="例如：冒泡排序、TCP 三次握手、快速排序..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100"
              />
            </div>

            {/* 快捷推荐考点卡片 */}
            <div>
              <div className="text-xs font-medium text-slate-600 mb-2">
                快捷推荐考点（点击填入，双击直接生成）：
              </div>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_PRESETS.map((preset) => {
                  const isActive = topicInput.trim() === preset.topic;
                  return (
                    <button
                      key={preset.topic}
                      type="button"
                      disabled={streaming}
                      onClick={() => handleQuickPresetClick(preset.topic, false)}
                      onDoubleClick={() => handleQuickPresetClick(preset.topic, true)}
                      className={`text-left rounded-lg border p-2.5 transition-all ${
                        isActive
                          ? 'border-brand-600 bg-teal-50/70 text-teal-900 shadow-sm'
                          : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100/80 text-slate-700'
                      } disabled:opacity-50`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="text-xs font-semibold truncate">
                          {preset.topic}
                        </span>
                        {preset.category === '计算机网络协议' ? (
                          <Network className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        ) : (
                          <Cpu className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-1">
                        {preset.summary}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-1 flex items-center gap-2">
              <button
                type="submit"
                disabled={streaming || !topicInput.trim()}
                className="btn-primary w-full py-2.5"
              >
                {streaming ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    正在流式生成可视化...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    生成交互式可视化
                  </>
                )}
              </button>
              {streaming && (
                <button
                  type="button"
                  onClick={abortStream}
                  className="btn-secondary shrink-0 py-2.5 px-3 text-xs"
                >
                  取消
                </button>
              )}
            </div>
          </form>

          {/* 已生成的可视化历史记录列表 */}
          <div className="college-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <History className="w-4 h-4 text-brand-600" />
                已生成历史记录
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {historyList.length}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => loadWorkspaceData(null)}
                disabled={loadingInit || streaming}
                className="text-xs text-slate-500 hover:text-brand-600 inline-flex items-center gap-1"
                title="刷新列表"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingInit ? 'animate-spin' : ''}`} />
                刷新
              </button>
            </div>

            {loadingInit ? (
              <div className="space-y-2">
                <SkeletonCard lines={2} />
                <SkeletonCard lines={2} />
              </div>
            ) : historyList.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center">
                <p className="text-xs text-slate-500">
                  暂无已保存的可视化记录。点击上方「冒泡排序」或「TCP 三次握手」即可快速生成体验。
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {historyList.map((item) => {
                  const isSelected = activeViz?.id === item.id;
                  const itemBytes = calcUtf8Bytes(item.html);
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectHistoryItem(item)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          handleSelectHistoryItem(item);
                        }
                      }}
                      className={`group flex items-center justify-between gap-2 rounded-lg border p-3 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-brand-600 bg-teal-50/60 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 truncate">
                            {item.topic || `知识点 #${item.topicId}`}
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 shrink-0">
                            {item.promptVersion}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                          <span>{formatByteSize(itemBytes)}</span>
                          <span>·</span>
                          <span>{formatCreatedAt(item.createdAt)}</span>
                          {loadingDetailId === item.id && (
                            <span className="text-brand-600">加载中...</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                        disabled={deletingId === item.id}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="删除该可视化记录"
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

        {/* 右侧流式状态、错误重试与安全沙箱渲染舞台 */}
        <div className="lg:col-span-8 space-y-4">
          {/* SSE 流式生成进度与实时字节数监控卡片 */}
          {streaming && (
            <div className="college-card p-5 border-brand-500/40 bg-teal-50/30 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-brand-600 animate-spin" />
                  <span className="text-sm font-semibold text-slate-900">
                    {progress?.message || '正在流式生成单文件交互式 HTML...'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="rounded-md bg-white border border-teal-200 px-2.5 py-1 font-mono font-medium text-teal-800">
                    已接收: {receivedStreamBytes.toLocaleString()} Bytes ({formatByteSize(receivedStreamBytes)})
                  </span>
                  <span className="text-slate-500">
                    阶段 {progress?.current ?? 1}/{progress?.total ?? 4}
                  </span>
                </div>
              </div>

              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-600 transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {accumulatedText && (
                <div className="rounded-lg bg-slate-900 text-slate-200 p-3 font-mono text-xs max-h-28 overflow-hidden relative">
                  <div className="text-[11px] text-teal-400 mb-1 flex items-center justify-between">
                    <span>实时 HTML 代码流预览</span>
                    <span>上限 100 KB (102,400 Bytes)</span>
                  </div>
                  <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed opacity-85">
                    {accumulatedText.slice(-360)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* 错误提示与明确的重试生成入口 */}
          {combinedError && (
            <div
              role="alert"
              className="college-card p-4 border-red-200 bg-red-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-red-900">
                    生成或操作未成功（{combinedError.code}）
                  </div>
                  <p className="text-xs text-red-700 mt-0.5">
                    {combinedError.message}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRetryGenerate}
                disabled={streaming}
                className="btn-primary bg-red-600 hover:bg-red-700 shrink-0 text-xs px-3.5 py-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                重试生成
              </button>
            </div>
          )}

          {/* 沙箱展示舞台或空状态引导 */}
          {!activeViz ? (
            <EmptyState
              title="尚未选择或生成知识点可视化"
              description="请在左侧输入算法或网络协议知识点（如「冒泡排序」「TCP 三次握手」），系统将自动生成包含进度滑块与交互控制按钮的单文件动画页面。"
              actionLabel="立即生成「冒泡排序」演示"
              onAction={() =>
                triggerGenerate({
                  topic: '冒泡排序',
                  eventId: selectedEventId,
                  topicId: null,
                })
              }
            />
          ) : (
            <div className="college-card overflow-hidden">
              {/* 沙箱顶部工具栏与安全审计元信息 */}
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-brand-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    {activeViz.topic || `知识点可视化 #${activeViz.id}`}
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100/80 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    sandbox=&quot;allow-scripts&quot;
                  </span>
                  <span className="inline-flex items-center rounded-md bg-teal-100/70 px-2 py-0.5 text-[11px] font-medium text-teal-800">
                    模板版本: {activeViz.promptVersion}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-slate-200/80 px-2 py-0.5 text-[11px] font-mono text-slate-700">
                    {formatByteSize(activeHtmlBytes)} / 100 KB (
                    {Math.min(100, Math.round((activeHtmlBytes / MAX_SANDBOX_BYTES) * 100))}
                    %)
                  </span>
                  {lastUsage && (
                    <span className="inline-flex items-center rounded-md bg-sky-100/70 px-2 py-0.5 text-[11px] text-sky-800">
                      Token: {lastUsage.promptTokens + lastUsage.completionTokens}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('sandbox')}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      viewMode === 'sandbox'
                        ? 'bg-brand-600 text-white'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    交互沙箱
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('source')}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      viewMode === 'source'
                        ? 'bg-brand-600 text-white'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    HTML 源码
                  </button>
                  <button
                    type="button"
                    onClick={() => setIframeKey((k) => k + 1)}
                    className="btn-secondary px-2.5 py-1.5 text-xs"
                    title="重载沙箱状态"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    重载沙箱
                  </button>
                </div>
              </div>

              {/* 严格沙箱 iframe 渲染区：仅设置 sandbox="allow-scripts"，绝不添加 allow-same-origin */}
              {viewMode === 'sandbox' ? (
                <div className="bg-slate-50">
                  <iframe
                    key={`${activeViz.id}-${iframeKey}`}
                    title={`visualize-sandbox-${activeViz.id}`}
                    sandbox="allow-scripts"
                    srcDoc={activeViz.html}
                    className="w-full h-[540px] border-0 bg-slate-50 block"
                  />
                </div>
              ) : (
                <div className="bg-slate-900 text-slate-100 p-4 max-h-[540px] overflow-auto">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-2 pb-2 border-b border-slate-800">
                    <span>
                      单文件内联 HTML 源码（已通过 HtmlSandboxValidator 零外链与体积校验）
                    </span>
                    <span className="font-mono">{activeHtmlBytes} UTF-8 Bytes</span>
                  </div>
                  <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-all">
                    {activeViz.html}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VisualizePage;
