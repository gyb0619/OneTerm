import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import type { ApiError, QaCitationDto } from '../../shared/types/api';
import {
  QUICK_QUESTIONS,
  QUICK_QUESTION_GROUPS,
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
    <div className="qa-markdown-root text-xs sm:text-sm text-slate-700 leading-relaxed break-words space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ ...props }) => (
            <h1 className="text-base font-bold text-slate-900 mt-4 mb-2 pb-1 border-b border-slate-100" {...props} />
          ),
          h2: ({ ...props }) => (
            <h2 className="text-sm font-bold text-slate-900 mt-3 mb-1.5" {...props} />
          ),
          h3: ({ ...props }) => (
            <h3 className="text-xs sm:text-sm font-semibold text-slate-800 mt-2.5 mb-1" {...props} />
          ),
          p: ({ ...props }) => (
            <p className="my-1.5 leading-relaxed text-slate-700 whitespace-pre-wrap" {...props} />
          ),
          ul: ({ ...props }) => (
            <ul className="list-disc pl-5 my-2 space-y-1 text-slate-700" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="list-decimal pl-5 my-2 space-y-1 text-slate-700" {...props} />
          ),
          li: ({ ...props }) => (
            <li className="leading-relaxed" {...props} />
          ),
          blockquote: ({ ...props }) => (
            <blockquote className="border-l-3 border-teal-500 bg-teal-50/50 pl-3.5 py-1.5 my-2 text-slate-700 italic rounded-r text-xs sm:text-sm" {...props} />
          ),
          pre: ({ ...props }) => (
            <pre className="bg-slate-900 text-slate-100 p-3.5 rounded-xl overflow-x-auto text-xs font-mono my-2.5 border border-slate-800 shadow-inner" {...props} />
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
              <code className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-100 text-teal-800 font-mono text-xs border border-slate-200" {...props}>
                {children}
              </code>
            );
          },
          table: ({ ...props }) => (
            <div className="overflow-x-auto my-3 border border-slate-200/90 rounded-xl shadow-xs">
              <table className="min-w-full divide-y divide-slate-200 text-xs text-left" {...props} />
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
            <th className="px-3 py-2 text-slate-800 font-semibold" {...props} />
          ),
          td: ({ ...props }) => (
            <td className="px-3 py-2 text-slate-700 whitespace-pre-wrap" {...props} />
          ),
          a: ({ ...props }) => (
            <a className="text-teal-600 hover:text-teal-700 underline font-medium" target="_blank" rel="noopener noreferrer" {...props} />
          ),
          strong: ({ ...props }) => (
            <strong className="font-semibold text-slate-900" {...props} />
          ),
          hr: ({ ...props }) => (
            <hr className="my-3 border-slate-200" {...props} />
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
  const [historyList, setHistoryList] = useState<QaHistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState<QaIndexResponse | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);

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
            // 问答完成后刷新历史记录
            void loadHistory(false);
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
    <div className="space-y-4 max-w-4xl mx-auto relative">
      {/* 极简顶栏 */}
      <div className="flex items-center justify-between bg-white px-5 py-3.5 rounded-xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
            <MessageSquareText className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900">教务智能问答 (RAG)</h1>
            <p className="text-[11px] text-slate-500">基于已录入课表与通知进行原文语义检索与溯源</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {indexStatus && (
            <span className="text-[11px] text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200/60 hidden sm:inline-block">
              {indexStatus.chunkCount} 个切片 · {indexStatus.mode === 'embedding' ? '向量余弦' : 'BM25'}
            </span>
          )}

          {/* 新开会话按钮 */}
          <button
            type="button"
            onClick={handleNewConversation}
            disabled={streaming}
            className="btn-secondary py-1 px-2.5 text-xs text-teal-700 bg-teal-50/70 hover:bg-teal-100/70 border-teal-200/80 flex items-center gap-1.5 transition"
            title="开启全新提问对话（历史记录可在侧边栏查看）"
          >
            <Plus className="w-3.5 h-3.5 text-teal-600" />
            <span>新会话</span>
          </button>

          <button
            type="button"
            onClick={handleRebuildIndex}
            disabled={indexing || streaming}
            className="btn-secondary py-1 px-2.5 text-xs text-slate-600 hover:text-slate-900"
            title="重新生成切片与向量索引"
          >
            {indexing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
            ) : (
              <Database className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">{indexing ? '构建中...' : '重建切片索引'}</span>
          </button>

          {/* 历史记录按钮 */}
          <button
            type="button"
            onClick={() => setIsHistoryOpen((prev) => !prev)}
            className={`btn-secondary py-1 px-2.5 text-xs flex items-center gap-1.5 transition ${
              isHistoryOpen
                ? 'bg-teal-50 text-teal-700 border-teal-300'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="查看历史问答记录"
          >
            <History className="w-3.5 h-3.5 text-teal-600" />
            <span>历史记录</span>
            {historyList.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-slate-100 text-[10px] text-slate-600 font-semibold">
                {historyList.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {indexError && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{indexError}</span>
          </div>
          <button
            type="button"
            onClick={() => setIndexError(null)}
            className="text-xs text-rose-600 underline"
          >
            关闭
          </button>
        </div>
      )}

      {/* 侧滑历史记录抽屉 */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-xs transition-opacity animate-in fade-in">
          <div className="w-full max-w-sm bg-white h-full shadow-2xl flex flex-col border-l border-slate-200">
            {/* 抽屉标题栏 */}
            <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2 text-slate-800">
                <History className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-bold">历史问答记录</h3>
                <span className="text-[11px] text-slate-400">({historyList.length})</span>
              </div>
              <div className="flex items-center gap-2">
                {historyList.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllHistory}
                    className="text-[11px] text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1"
                    title="清空全部历史"
                  >
                    <Trash2 className="w-3 h-3" />
                    清空
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(false)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 抽屉列表内容 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {historyLoading && historyList.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                  <span>正在加载历史记录...</span>
                </div>
              ) : historyList.length === 0 ? (
                <div className="py-16 text-center space-y-2 text-slate-400">
                  <Clock className="w-8 h-8 mx-auto stroke-[1.5] text-slate-300" />
                  <p className="text-xs">暂无历史问答记录</p>
                  <p className="text-[11px] text-slate-400">发起提问后，对话内容将自动归档</p>
                </div>
              ) : (
                historyList.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectHistoryItem(item)}
                    className="group p-3 rounded-xl border border-slate-200/80 hover:border-teal-300 hover:bg-teal-50/30 transition-all cursor-pointer relative"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-800 group-hover:text-teal-900 line-clamp-2 leading-snug">
                        {item.question}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteHistory(item.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition shrink-0"
                        title="删除此条记录"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {formatDisplayTime(item.createdAt)}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200/60">
                        {item.retrievalMode === 'embedding' ? '向量余弦' : 'BM25'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 对话列表区 */}
      <div className="space-y-4 min-h-[380px]">
        {turns.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 text-center space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">关于学期日程，随时提问</h2>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                基于已录入课表与通知进行智能问答，可查询课程安排、冲突排查、考试截止与复习建议
              </p>
            </div>

            {/* 分组式建议提问 */}
            <div className="pt-2 space-y-4 max-w-2xl mx-auto text-left">
              {QUICK_QUESTION_GROUPS.map((group) => (
                <div key={group.tag} className="space-y-1.5">
                  <div className="flex items-center gap-1.5 px-1 text-[11px] font-semibold text-slate-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                    <span>{group.tag}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.questions.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => void askQuestion(q)}
                        disabled={streaming}
                        className="p-2.5 rounded-xl bg-slate-50/80 hover:bg-teal-50/80 border border-slate-200/80 hover:border-teal-300 text-xs text-slate-700 hover:text-teal-900 transition text-left flex items-center justify-between group shadow-2xs"
                      >
                        <span className="truncate pr-2">{q}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn) => {
            const isStreamingThis = turn.status === 'streaming';
            return (
              <div key={turn.id} id={`turn-${turn.id}`} className="space-y-3 scroll-mt-20">
                {/* 用户提问气泡 */}
                <div className="flex justify-end items-start gap-2">
                  <div className="bg-teal-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-xs max-w-[85%] shadow-xs leading-relaxed">
                    {turn.question}
                  </div>
                  <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 text-xs">
                    <User className="w-4 h-4" />
                  </div>
                </div>

                {/* 助手回答卡片 */}
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-200/60 text-xs mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>

                  <div className="flex-1 bg-white rounded-2xl rounded-tl-sm border border-slate-200/80 p-4 shadow-xs space-y-3">
                    {isStreamingThis && !turn.answer && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                        <span>正在检索教务切片并生成回答...</span>
                      </div>
                    )}

                    {/* Markdown 渲染支持 */}
                    {turn.answer && <MarkdownAnswer content={turn.answer} />}

                    {turn.status === 'error' && (
                      <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
                        <span>{turn.errorMessage || '问答生成异常'}</span>
                        <button
                          type="button"
                          onClick={() => handleRetryTurn(turn.question)}
                          className="btn-secondary py-1 px-2 text-xs text-rose-700 border-rose-300 hover:bg-rose-100 flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
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
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-400">
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
                            <span>
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
                              <Trash2 className="w-3 h-3" />
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

      {/* 底部追问快捷气泡（对话进行中时提供） */}
      {turns.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-1 scrollbar-none text-[11px]">
          <span className="text-slate-400 shrink-0 text-[10px] mr-1">快捷提问:</span>
          {QUICK_QUESTIONS.slice(0, 6).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void askQuestion(q)}
              disabled={streaming}
              className="shrink-0 px-2.5 py-1 rounded-full bg-white hover:bg-teal-50 border border-slate-200/80 hover:border-teal-300 text-slate-600 hover:text-teal-900 transition text-[11px] shadow-2xs"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* 底部输入框 */}
      <form
        onSubmit={handleFormSubmit}
        className="sticky bottom-4 bg-white p-2 rounded-2xl border border-slate-200 shadow-md flex items-center gap-2"
      >
        <input
          type="text"
          value={questionInput}
          onChange={(e) => setQuestionInput(e.target.value)}
          placeholder={streaming ? '正在回答中...' : '输入关于课程、考试、截止时间的疑问...'}
          disabled={streaming}
          className="flex-1 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none bg-transparent"
        />

        {streaming ? (
          <button
            type="button"
            onClick={abortStream}
            className="p-2 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition"
            title="停止生成"
          >
            <Square className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!questionInput.trim()}
            className="p-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white transition disabled:opacity-40 disabled:hover:bg-teal-600"
            title="发送问题"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </form>
    </div>
  );
};

export default QaPage;
