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
  Loader2,
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

        if (preferVizId != null) {
          const match = vizList.find((v: VisualizationDto) => v.id === preferVizId);
          if (match) {
            setActiveViz(match);
            return;
          }
        }
        if (vizList.length > 0) {
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
    []
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
  const progressPercent = useMemo(() => {
    if (!progress || !progress.total || progress.total <= 0) return 35;
    return Math.min(100, Math.max(10, Math.round((progress.current / progress.total) * 100)));
  }, [progress]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* 极简顶栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-3.5 rounded-xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900">知识点交互式可视化工坊</h1>
            <p className="text-[11px] text-slate-500">算法与计算机网络协议单文件动态仿真演示</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[11px] font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            安全沙箱隔离 (allow-scripts)
          </span>
        </div>
      </div>

      {/* 主体两栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* 左侧控制台与历史列表 */}
        <div className="lg:col-span-4 space-y-4">
          {/* 生成控制面板 */}
          <form onSubmit={handleFormSubmit} className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">生成新考点动画</span>
              <span className="text-[11px] text-slate-400">零外链 · 交互控件</span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
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
                placeholder="例如：冒泡排序、TCP 三次握手..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>

            {/* 推荐考点胶囊 */}
            <div>
              <span className="block text-[11px] text-slate-400 mb-1.5">快捷推荐：</span>
              <div className="grid grid-cols-2 gap-1.5">
                {QUICK_PRESETS.map((p) => {
                  const isActive = topicInput.trim() === p.topic;
                  return (
                    <button
                      key={p.topic}
                      type="button"
                      disabled={streaming}
                      onClick={() => handleQuickPresetClick(p.topic)}
                      className={`text-left p-2 rounded-lg border text-xs transition ${
                        isActive
                          ? 'border-teal-500 bg-teal-50/70 text-teal-900 font-medium'
                          : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="truncate font-semibold">{p.topic}</div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">{p.summary}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={streaming || !topicInput.trim()}
              className="w-full btn-primary bg-teal-600 hover:bg-teal-700 py-2 text-xs flex items-center justify-center gap-1.5"
            >
              {streaming ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              {streaming ? '正在流式生成动画...' : '生成交互式可视化'}
            </button>
          </form>

          {/* 历史记录卡片 */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-teal-600" />
                已生成历史 ({historyList.length})
              </span>
              <button
                type="button"
                onClick={() => loadWorkspaceData(null)}
                disabled={loadingInit || streaming}
                className="text-[11px] text-slate-400 hover:text-teal-700"
              >
                刷新
              </button>
            </div>

            {loadingInit ? (
              <div className="space-y-1.5">
                <SkeletonCard lines={2} />
              </div>
            ) : historyList.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">暂无已保存的可视化</div>
            ) : (
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                {historyList.map((item) => {
                  const isSelected = activeViz?.id === item.id;
                  const itemBytes = calcUtf8Bytes(item.html);
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectHistoryItem(item)}
                      className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition ${
                        isSelected
                          ? 'border-teal-500 bg-teal-50/60 font-medium text-teal-900'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{item.topic}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{formatByteSize(itemBytes)}</span>
                          <span>·</span>
                          <span>{formatCreatedAt(item.createdAt)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                        className="p-1 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 右侧沙箱展示区 */}
        <div className="lg:col-span-8 space-y-3">
          {/* 生成进度 */}
          {streaming && (
            <div className="bg-white rounded-xl border border-teal-200 p-3.5 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-teal-600 animate-spin" />
                  <span className="font-semibold text-slate-800">
                    {progress?.message || '大模型单文件代码流式生成中...'}
                  </span>
                </div>
                <span className="font-mono text-teal-700">{formatByteSize(receivedStreamBytes)}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-600 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {combinedError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{combinedError.message}</span>
              </div>
              <button
                type="button"
                onClick={handleRetryGenerate}
                className="btn-secondary py-1 px-2.5 text-xs text-rose-700 border-rose-300"
              >
                重试
              </button>
            </div>
          )}

          {!activeViz ? (
            <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center text-xs text-slate-400">
              请在左侧选择或输入考点生成交互式可视化页面
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800">{activeViz.topic}</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {formatByteSize(activeHtmlBytes)} · {activeViz.promptVersion}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setViewMode(viewMode === 'sandbox' ? 'source' : 'sandbox')}
                    className="btn-secondary py-1 px-2 text-[11px]"
                  >
                    {viewMode === 'sandbox' ? <Code2 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {viewMode === 'sandbox' ? '源码' : '沙箱'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIframeKey((k) => k + 1)}
                    className="btn-secondary py-1 px-2 text-[11px]"
                    title="重置"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {viewMode === 'sandbox' ? (
                <iframe
                  key={`${activeViz.id}-${iframeKey}`}
                  title={`viz-${activeViz.id}`}
                  sandbox="allow-scripts"
                  srcDoc={activeViz.html}
                  className="w-full h-[560px] border-0 bg-slate-50"
                />
              ) : (
                <pre className="p-4 bg-slate-900 text-slate-100 text-[11px] font-mono h-[560px] overflow-auto whitespace-pre-wrap">
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
