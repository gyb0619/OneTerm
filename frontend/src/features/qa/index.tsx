import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertCircle,
  Bot,
  Database,
  History,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  User,
  X,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { useSseStream } from '../../shared/hooks/useSseStream';
import { useAppStore } from '../../shared/store/useAppStore';
import type { ApiError, QaCitationDto } from '../../shared/types/api';
import {
  getRandomPrompts,
  rebuildQaIndex,
  fetchQaHistory,
  deleteQaHistoryItem,
  clearQaHistory,
  type QaAskDoneResult,
  type QaHistoryItem,
  type QaIndexResponse,
  type RetrievalMode,
} from './api';
import { CitationCardList } from './CitationCardList';

interface QaConversationTurn {
  id: string;
  historyId?: number;
  question: string;
  answer: string;
  retrievalMode?: RetrievalMode;
  citations: QaCitationDto[];
  status: 'streaming' | 'done' | 'error';
  errorMessage?: string;
  promptTokens?: number;
  completionTokens?: number;
  createdAt?: string;
}

function formatDisplayTime(isoString?: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${m}-${day} ${h}:${min}`;
  } catch {
    return isoString;
  }
}

/**
 * 优雅美观的 Markdown 渲染器，支持 GFM 规范（代码块、表格、列表、引用块、链接等）
 */
const MarkdownAnswer: React.FC<{ content: string }> = ({ content }) => {
  if (!content) return null;

  return (
    <div className="qa-markdown-root text-sm sm:text-base text-slate-700 leading-relaxed break-words space-y-2.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ ...props }) => (
            <h1 className="text-lg font-bold text-slate-900 mt-4 mb-2 pb-1 border-b border-slate-100" {...props} />
          ),
          h2: ({ ...props }) => (
            <h2 className="text-base font-bold text-slate-900 mt-3.5 mb-1.5" {...props} />
          ),
          h3: ({ ...props }) => (
            <h3 className="text-sm sm:text-base font-semibold text-slate-800 mt-3 mb-1" {...props} />
          ),
          p: ({ ...props }) => (
            <p className="my-2 leading-relaxed text-slate-700 whitespace-pre-wrap" {...props} />
          ),
          ul: ({ ...props }) => (
            <ul className="list-disc pl-5 my-2 space-y-1 text-slate-700 text-sm sm:text-base" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="list-decimal pl-5 my-2 space-y-1 text-slate-700 text-sm sm:text-base" {...props} />
          ),
          li: ({ ...props }) => (
            <li className="leading-relaxed" {...props} />
          ),
          blockquote: ({ ...props }) => (
            <blockquote className="border-l-4 border-teal-500 bg-teal-50/60 pl-3.5 py-2 my-2.5 text-slate-700 italic rounded-r text-sm" {...props} />
          ),
          pre: ({ ...props }) => (
            <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl overflow-x-auto text-xs sm:text-sm font-mono my-3 border border-slate-800 shadow-inner" {...props} />
          ),
          code: ({ className, children, ...props }: any) => {
            const isCodeBlock = className?.includes('language-') || String(children).includes('\n');
            if (isCodeBlock) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-100 text-teal-800 font-mono text-xs sm:text-sm border border-slate-200" {...props}>
                {children}
              </code>
            );
          },
          table: ({ ...props }) => (
            <div className="overflow-x-auto my-3 border border-slate-200/90 rounded-xl shadow-xs">
              <table className="min-w-full divide-y divide-slate-200 text-xs sm:text-sm text-left" {...props} />
            </div>
          ),
          thead: ({ ...props }) => (
            <thead className="bg-slate-50 text-slate-800 font-semibold" {...props} />
          ),
          tbody: ({ ...props }) => (
            <tbody className="divide-y divide-slate-100 bg-white" {...props} />
          ),
          tr: ({ ...props }) => (
            <tr className="hover:bg-slate-50/70 transition-colors" {...props} />
          ),
          th: ({ ...props }) => (
            <th className="px-3.5 py-2.5 text-slate-800 font-semibold" {...props} />
          ),
          td: ({ ...props }) => (
            <td className="px-3.5 py-2.5 text-slate-700 whitespace-pre-wrap" {...props} />
          ),
          a: ({ ...props }) => (
            <a className="text-teal-600 hover:text-teal-700 underline font-medium" target="_blank" rel="noopener noreferrer" {...props} />
          ),
          strong: ({ ...props }) => (
            <strong className="font-semibold text-slate-900" {...props} />
          ),
          hr: ({ ...props }) => (
            <hr className="my-3.5 border-slate-200" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export const QaPage: React.FC = () => {
  const [questionInput, setQuestionInput] = useState('');
  const [turns, setTurns] = useState<QaConversationTurn[]>([]);
  const [suggestedPrompts, setSuggestedPrompts] = useState(() => getRandomPrompts(3));
  const [historyList, setHistoryList] = useState<QaHistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState<QaIndexResponse | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);

  const handleShufflePrompts = useCallback(() => {
    setSuggestedPrompts(getRandomPrompts(3));
  }, []);

  const turnsEndRef = useRef<HTMLDivElement | null>(null);
  const activeTurnIdRef = useRef<string | null>(null);

  const {
    streaming,
    progress: _progress,
    error: _streamHookError,
    startStream,
    abortStream,
  } = useSseStream<QaAskDoneResult>();

  // 加载问答历史列表
  const loadHistory = useCallback(async (populateChat = false) => {
    try {
      setHistoryLoading(true);
      const list = await fetchQaHistory(50);
      setHistoryList(list);

      // 若为初始加载且当前对话为空，将历史记录填充到聊天视图中
      if (populateChat && list.length > 0) {
        setTurns((prev) => {
          if (prev.length > 0) return prev;
          return list
            .map((item) => ({
              id: `history-${item.id}`,
              historyId: item.id,
              question: item.question,
              answer: item.answer,
              retrievalMode: item.retrievalMode,
              citations: item.citations || [],
              status: 'done' as const,
              createdAt: item.createdAt,
            }))
            .reverse();
        });
      }
    } catch {
      // 忽略历史拉取非致命错误
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory(true);
  }, [loadHistory]);

  const handleRebuildIndex = useCallback(async () => {
    if (indexing || streaming) return;
    setIndexing(true);
    setIndexError(null);
    try {
      const res = await rebuildQaIndex();
      setIndexStatus(res);
    } catch (err) {
      setIndexError((err as Error).message || '重建切片索引失败，请稍后重试');
    } finally {
      setIndexing(false);
    }
  }, [indexing, streaming]);

  // 新开会话：清空当前视口，保留数据库历史
  const handleNewConversation = useCallback(() => {
    if (streaming) return;
    setTurns([]);
    setQuestionInput('');
  }, [streaming]);

  const askQuestion = useCallback(
    async (rawQuestion: string) => {
      const q = rawQuestion.trim();
      if (!q || streaming) return;

      const turnId = `qa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      activeTurnIdRef.current = turnId;
      setQuestionInput('');

      const newTurn: QaConversationTurn = {
        id: turnId,
        question: q,
        answer: '',
        citations: [],
        status: 'streaming',
        createdAt: new Date().toISOString(),
      };

      setTurns((prev) => [...prev, newTurn]);

      await startStream(
        '/api/qa/ask/stream',
        { question: q },
        {
          onDelta: (_delta, accumulated) => {
            setTurns((prev) =>
              prev.map((item) =>
                item.id === turnId
                  ? { ...item, answer: accumulated, status: 'streaming' }
                  : item
              )
            );
          },
          onDone: (doneEvent) => {
            const payload = doneEvent.result;
            setTurns((prev) =>
              prev.map((item) =>
                item.id === turnId
                  ? {
                      ...item,
                      answer: payload?.answer || item.answer,
                      retrievalMode: payload?.retrievalMode || 'embedding',
                      citations: Array.isArray(payload?.citations) ? payload.citations : [],
                      status: 'done',
                      promptTokens: doneEvent.usage?.promptTokens,
                      completionTokens: doneEvent.usage?.completionTokens,
                    }
                  : item
              )
            );
            // 问答完成后刷新历史记录与 Token 额度
            void loadHistory(false);
            void useAppStore.getState().refreshCurrentUser();
          },
          onError: (apiErr: ApiError) => {
            setTurns((prev) =>
              prev.map((item) =>
                item.id === turnId
                  ? {
                      ...item,
                      status: 'error',
                      errorMessage: apiErr.message || '问答流式生成失败，请点击重试',
                    }
                  : item
              )
            );
          },
        }
      );
    },
    [loadHistory, startStream, streaming]
  );

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionInput.trim() || streaming) return;
    void askQuestion(questionInput);
  };

  const handleRetryTurn = (questionToRetry: string) => {
    if (streaming) return;
    void askQuestion(questionToRetry);
  };

  const handleDeleteHistory = async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await deleteQaHistoryItem(id);
      setHistoryList((prev) => prev.filter((item) => item.id !== id));
      setTurns((prev) => prev.filter((turn) => turn.historyId !== id));
    } catch (err) {
      alert((err as Error).message || '删除历史记录失败');
    }
  };

  const handleClearAllHistory = async () => {
    if (!window.confirm('确定要清空全部问答历史记录吗？')) return;
    try {
      await clearQaHistory();
      setHistoryList([]);
      setTurns([]);
      setIsHistoryOpen(false);
    } catch (err) {
      alert((err as Error).message || '清空历史记录失败');
    }
  };

  const handleSelectHistoryItem = (item: QaHistoryItem) => {
    const existingIndex = turns.findIndex((t) => t.historyId === item.id);
    if (existingIndex >= 0) {
      const el = document.getElementById(`turn-${turns[existingIndex].id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      setTurns((prev) => [
        ...prev,
        {
          id: `history-${item.id}`,
          historyId: item.id,
          question: item.question,
          answer: item.answer,
          retrievalMode: item.retrievalMode,
          citations: item.citations || [],
          status: 'done',
          createdAt: item.createdAt,
        },
      ]);
      setTimeout(() => {
        turnsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    }
    setIsHistoryOpen(false);
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto relative pb-4">
      {/* 极简顶栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
            <MessageSquareText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">教务智能问答 (RAG)</h1>
            <p className="text-xs text-slate-500 mt-0.5">基于已录入课表与通知进行原文语义检索与溯源</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {indexStatus && (
            <span className="text-xs text-teal-700 bg-teal-50 px-3 py-1 rounded-lg border border-teal-200/60 hidden sm:inline-block">
              {indexStatus.chunkCount} 个切片 · {indexStatus.mode === 'embedding' ? '向量余弦' : 'BM25'}
            </span>
          )}

          {/* 新开会话按钮 */}
          <button
            type="button"
            onClick={handleNewConversation}
            disabled={streaming}
            className="btn-secondary py-1.5 px-3 text-xs sm:text-sm text-teal-700 bg-teal-50/70 hover:bg-teal-100/70 border-teal-200/80 flex items-center gap-1.5 transition"
            title="开启全新提问对话（历史记录可在侧边栏查看）"
          >
            <Plus className="w-4 h-4 text-teal-600" />
            <span>新会话</span>
          </button>

          <button
            type="button"
            onClick={handleRebuildIndex}
            disabled={indexing || streaming}
            className="btn-secondary py-1.5 px-3 text-xs sm:text-sm text-slate-600 hover:text-slate-900"
            title="重新生成切片与向量索引"
          >
            {indexing ? (
              <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">{indexing ? '构建中...' : '重建切片索引'}</span>
          </button>

          {/* 历史记录按钮 */}
          <button
            type="button"
            onClick={() => setIsHistoryOpen((prev) => !prev)}
            className={`btn-secondary py-1.5 px-3 text-xs sm:text-sm flex items-center gap-1.5 transition ${
              isHistoryOpen
                ? 'bg-teal-50 text-teal-700 border-teal-300'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="查看历史问答记录"
          >
            <History className="w-4 h-4 text-teal-600" />
            <span>历史记录</span>
            {historyList.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-100 text-xs text-slate-600 font-semibold">
                {historyList.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {indexError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{indexError}</span>
          </div>
          <button
            type="button"
            onClick={() => setIndexError(null)}
            className="text-xs text-rose-600 underline font-medium"
          >
            关闭
          </button>
        </div>
      )}

      {/* 侧滑历史记录抽屉 */}
      {isHistoryOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-xs transition-opacity animate-fade-in">
            <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-slide-in-right">
            {/* 抽屉标题栏 */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2 text-slate-800">
                <History className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold">历史问答记录</h3>
                <span className="text-xs text-slate-400">({historyList.length})</span>
              </div>
              <div className="flex items-center gap-2">
                {historyList.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllHistory}
                    className="text-xs text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 font-medium"
                    title="清空全部历史"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    清空
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 抽屉列表内容 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {historyLoading && historyList.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                  <span>正在加载历史记录...</span>
                </div>
              ) : historyList.length === 0 ? (
                <div className="py-20 text-center space-y-2 text-slate-400">
                  <Clock className="w-9 h-9 mx-auto stroke-[1.5] text-slate-300" />
                  <p className="text-sm font-medium">暂无历史问答记录</p>
                  <p className="text-xs text-slate-400">发起提问后，对话内容将自动归档</p>
                </div>
              ) : (
                historyList.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectHistoryItem(item)}
                    className="group p-3.5 rounded-xl border border-slate-200/80 hover:border-teal-300 hover:bg-teal-50/30 transition-all cursor-pointer relative shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800 group-hover:text-teal-900 line-clamp-2 leading-relaxed">
                        {item.question}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteHistory(item.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition shrink-0"
                        title="删除此条记录"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {formatDisplayTime(item.createdAt)}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200/60 font-mono">
                        {item.retrievalMode === 'embedding' ? '向量余弦' : 'BM25'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 对话列表区 */}
      <div className="space-y-5 min-h-[400px]">
        {turns.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-10 text-center space-y-6 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto shadow-inner">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-800">关于学期日程，随时提问</h2>
              <p className="text-sm text-slate-500 mt-1.5 max-w-lg mx-auto leading-relaxed">
                基于已录入课表与通知进行语义检索，可查询课程地点、空闲排查、考试倒计时与核心考点
              </p>
            </div>

            {/* 精选动态提示词（仅保留 1~3 个动态生成带变量的提示词，支持换一换） */}
            <div className="pt-2 max-w-2xl mx-auto space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600">
                  <Sparkles className="w-4 h-4 text-teal-600" />
                  <span>推荐提问（包含动态变量）</span>
                </div>
                <button
                  type="button"
                  onClick={handleShufflePrompts}
                  className="inline-flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-800 px-2.5 py-1 rounded-lg hover:bg-teal-50 transition font-medium"
                  title="随机切换推荐提示词"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-teal-600 transition-transform active:rotate-180" />
                  <span>换一换</span>
                </button>
              </div>

              <div key={suggestedPrompts.map((p) => p.text).join('')} className="space-y-2.5 animate-fade-in">
                {suggestedPrompts.map((item, idx) => (
                  <button
                    key={`${item.category}-${idx}`}
                    type="button"
                    onClick={() => void askQuestion(item.text)}
                    disabled={streaming}
                    className="w-full p-3.5 rounded-xl bg-slate-50/70 hover:bg-teal-50/70 border border-slate-200/90 hover:border-teal-300 text-slate-800 hover:text-teal-950 transition-all duration-150 text-left flex items-center justify-between gap-3 group shadow-2xs cursor-pointer hover:-translate-y-0.5 hover:shadow-xs active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200/70 group-hover:bg-teal-100/80 transition-colors">
                        {item.category}
                      </span>
                      <span className="text-sm sm:text-base font-medium truncate">{item.text}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-teal-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          turns.map((turn) => {
            const isStreamingThis = turn.status === 'streaming';
            return (
              <div key={turn.id} id={`turn-${turn.id}`} className="space-y-3.5 scroll-mt-20 animate-fade-slide-up">
                {/* 用户提问气泡 */}
                <div className="flex justify-end items-start gap-2.5">
                  <div className="bg-teal-600 text-white rounded-2xl rounded-tr-xs px-4 sm:px-5 py-3 text-sm sm:text-base max-w-[85%] shadow-xs leading-relaxed animate-pop-in">
                    {turn.question}
                  </div>
                  <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                </div>

                {/* 助手回答卡片 */}
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-200/60 mt-0.5 shadow-2xs">
                    <Bot className="w-4 h-4" />
                  </div>

                  <div className="flex-1 bg-white rounded-2xl rounded-tl-xs border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-3.5 animate-fade-in">
                    {isStreamingThis && !turn.answer && (
                      <div className="flex items-center gap-2 text-sm text-slate-500 py-1.5 animate-pulse">
                        <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                        <span>正在检索教务切片并生成回答...</span>
                      </div>
                    )}

                    {/* Markdown 渲染支持 */}
                    {turn.answer && (
                      <div className="relative">
                        <MarkdownAnswer content={turn.answer} />
                        {isStreamingThis && (
                          <span className="inline-block w-2 h-4 ml-1 bg-teal-600 animate-pulse rounded-xs align-middle" />
                        )}
                      </div>
                    )}

                    {turn.status === 'error' && (
                      <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-center justify-between">
                        <span>{turn.errorMessage || '问答生成异常'}</span>
                        <button
                          type="button"
                          onClick={() => handleRetryTurn(turn.question)}
                          className="btn-secondary py-1 px-2.5 text-xs text-rose-700 border-rose-300 hover:bg-rose-100 flex items-center gap-1"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          重试
                        </button>
                      </div>
                    )}

                    {/* 引用卡片列表 */}
                    {turn.status === 'done' && turn.citations && turn.citations.length > 0 && (
                      <CitationCardList
                        citations={turn.citations}
                        retrievalMode={turn.retrievalMode}
                      />
                    )}

                    {turn.status === 'done' && (
                      <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-400">
                        <div className="flex items-center gap-2">
                          <span>
                            {turn.retrievalMode === 'embedding'
                              ? '余弦向量检索 (float32)'
                              : 'BM25 关键词检索'}
                          </span>
                          {turn.createdAt && (
                            <span className="text-slate-300">· {formatDisplayTime(turn.createdAt)}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {turn.promptTokens !== undefined && (
                            <span className="font-mono">
                              Tokens: {turn.promptTokens} + {turn.completionTokens}
                            </span>
                          )}
                          {turn.historyId && (
                            <button
                              type="button"
                              onClick={() => handleDeleteHistory(turn.historyId!)}
                              className="text-slate-400 hover:text-rose-500 transition ml-1"
                              title="删除此条记录"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={turnsEndRef} />
      </div>

      {/* 底部追问快捷气泡（对话进行中时提供 2~3 个动态带变量提示词 + 换一换） */}
      {turns.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto py-1 px-1 scrollbar-none text-xs">
          <span className="text-slate-400 shrink-0 mr-0.5">快捷提问:</span>
          {suggestedPrompts.slice(0, 2).map((item, idx) => (
            <button
              key={`${item.text}-${idx}`}
              type="button"
              onClick={() => void askQuestion(item.text)}
              disabled={streaming}
              className="shrink-0 px-3 py-1.5 rounded-full bg-white hover:bg-teal-50 border border-slate-200/80 hover:border-teal-300 text-slate-700 hover:text-teal-900 transition-all duration-150 active:scale-95 hover:scale-[1.02] text-xs shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 font-semibold">
                {item.category}
              </span>
              <span>{item.text}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={handleShufflePrompts}
            className="shrink-0 p-1.5 rounded-full hover:bg-slate-200/60 text-slate-500 hover:text-teal-700 transition-all duration-300 active:scale-90 hover:rotate-180"
            title="换一换提示词"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 底部输入框 */}
      <form
        onSubmit={handleFormSubmit}
        className="sticky bottom-4 bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-md focus-within:ring-2 focus-within:ring-teal-500/30 focus-within:border-teal-500 transition-all duration-200 flex items-center gap-2"
      >
        <input
          type="text"
          value={questionInput}
          onChange={(e) => setQuestionInput(e.target.value)}
          placeholder={streaming ? '正在回答中...' : '输入关于课程、考试、截止时间的疑问...'}
          disabled={streaming}
          className="flex-1 px-4 py-2 text-sm sm:text-base text-slate-800 placeholder:text-slate-400 focus:outline-none bg-transparent"
        />

        {streaming ? (
          <button
            type="button"
            onClick={abortStream}
            className="p-2.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all duration-150 active:scale-95"
            title="停止生成"
          >
            <Square className="w-5 h-5" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!questionInput.trim()}
            className="p-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white transition-all duration-150 active:scale-95 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 shadow-xs"
            title="发送问题"
          >
            <Send className="w-5 h-5" />
          </button>
        )}
      </form>
    </div>
  );
};

export default QaPage;
