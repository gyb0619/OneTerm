import React, { useCallback, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Cpu,
  Database,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Square,
  User,
} from 'lucide-react';
import { useSseStream } from '../../shared/hooks/useSseStream';
import type { ApiError, QaCitationDto } from '../../shared/types/api';
import {
  QUICK_QUESTIONS,
  rebuildQaIndex,
  type QaAskDoneResult,
  type QaIndexResponse,
  type RetrievalMode,
} from './api';
import { CitationCardList } from './CitationCardList';

interface QaConversationTurn {
  id: string;
  question: string;
  answer: string;
  retrievalMode?: RetrievalMode;
  citations: QaCitationDto[];
  status: 'streaming' | 'done' | 'error';
  errorMessage?: string;
  promptTokens?: number;
  completionTokens?: number;
}

/**
 * 轻量级 Markdown 行内加粗与代码高亮渲染辅助函数
 */
function renderFormattedLine(line: string, keyPrefix: string): React.ReactNode {
  const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-${idx}`} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={`${keyPrefix}-${idx}`}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-teal-50 text-teal-800 font-mono text-xs border border-teal-200/70"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={`${keyPrefix}-${idx}`}>{part}</React.Fragment>;
  });
}

function renderFormattedAnswer(text: string): React.ReactNode {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  return (
    <div className="space-y-1.5 text-sm text-slate-700 leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }
        return (
          <p key={idx} className="whitespace-pre-wrap">
            {renderFormattedLine(line, `line-${idx}`)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * 教务智能问答 (RAG) 页面（归属：子代理 C）
 * - 提供快捷提问胶囊按钮与自然语言输入框
 * - 使用 useSseStream 实时展示流式生成进度、增量回答、检索模式标签及失败重试入口
 * - 在每条回答下方展示「引用的原文片段（Citations）」卡片列表，点击可跳转到 /calendar 定位关联事件
 */
export const QaPage: React.FC = () => {
  const [questionInput, setQuestionInput] = useState('');
  const [turns, setTurns] = useState<QaConversationTurn[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState<QaIndexResponse | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);

  const activeTurnIdRef = useRef<string | null>(null);

  const {
    streaming,
    progress,
    error: streamHookError,
    startStream,
    abortStream,
  } = useSseStream<QaAskDoneResult>();

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
    [startStream, streaming]
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

  return (
    <div className="space-y-5">
      {/* 顶部功能栏与索引状态 */}
      <div className="college-card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                <MessageSquareText className="w-4 h-4" />
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">
                教务智能问答 (RAG)
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
                <Sparkles className="w-3 h-3" />
                Top-4 原文溯源
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500">
              基于已导入的课表、考试与作业通知原文按段切片检索（优先 float32 余弦相似度，未配置向量模型时自动降级 BM25），点击引用卡片即可跳转日历定位事件。
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRebuildIndex}
              disabled={indexing || streaming}
              className="btn-secondary text-xs py-2 px-3"
            >
              {indexing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
              ) : (
                <Database className="w-3.5 h-3.5 text-teal-600" />
              )}
              <span>{indexing ? '正在构建切片...' : '重建切片与向量索引'}</span>
            </button>
          </div>
        </div>

        {/* 索引状态反馈条 */}
        {indexStatus && (
          <div className="mt-3.5 rounded-lg bg-teal-50/80 border border-teal-200 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-teal-800">
            <span>
              已完成事件原文切片构建：共生成 <strong>{indexStatus.chunkCount}</strong> 条高密度检索片段。
            </span>
            <span className="inline-flex items-center gap-1 font-medium">
              {indexStatus.mode === 'embedding' ? (
                <>
                  <Cpu className="w-3.5 h-3.5" />
                  当前索引模式：向量余弦检索 (float32 BLOB)
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  当前索引模式：BM25 关键词降级检索
                </>
              )}
            </span>
          </div>
        )}

        {indexError && (
          <div className="mt-3.5 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2 flex items-center justify-between gap-2 text-xs text-red-700">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{indexError}</span>
            </div>
            <button
              type="button"
              onClick={handleRebuildIndex}
              className="font-medium underline hover:text-red-800"
            >
              重试
            </button>
          </div>
        )}

        {/* 快捷提问胶囊按钮 */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 mr-1">快捷提问：</span>
          {QUICK_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              disabled={streaming}
              onClick={() => void askQuestion(q)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300 border border-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-3 h-3 text-teal-600" />
              <span>{q}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 对话问答历史流 */}
      {turns.length === 0 ? (
        <div className="college-card p-8 sm:p-10 text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mb-3">
            <Bot className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-slate-900 mb-1">
            有什么关于本学期课表、考试或作业截止的问题？
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-lg mb-5">
            点击上方胶囊按钮或直接输入自然语言问题，系统将检索最相关的前 4 条教务通知原文并流式生成解答，同时支持一键跳转日历定位对应事件。
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={streaming}
                onClick={() => void askQuestion(q)}
                className="btn-secondary text-xs py-2 px-3.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span>试问：「{q}」</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {turns.map((turn) => {
            const isCurrentStreaming =
              streaming && activeTurnIdRef.current === turn.id && turn.status === 'streaming';
            const mode = turn.retrievalMode || 'embedding';

            return (
              <div key={turn.id} className="space-y-3">
                {/* 用户提问气泡 */}
                <div className="flex justify-end">
                  <div className="inline-flex items-start gap-2.5 max-w-2xl rounded-2xl rounded-tr-sm bg-teal-600 text-white px-4 py-2.5 shadow-sm">
                    <User className="w-4 h-4 mt-0.5 shrink-0 opacity-90" />
                    <span className="text-sm font-medium">{turn.question}</span>
                  </div>
                </div>

                {/* 助手回答与引用溯源卡片 */}
                <div className="college-card p-5">
                  {/* 状态头：检索模式标签与流式进度 */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-50 text-teal-600">
                        <Bot className="w-3.5 h-3.5" />
                      </span>
                      <span className="text-xs font-semibold text-slate-800">
                        一学期教务助手
                      </span>
                      {turn.status === 'done' && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            mode === 'embedding'
                              ? 'bg-teal-50 text-teal-700 border border-teal-200'
                              : 'bg-sky-50 text-sky-700 border border-sky-200'
                          }`}
                        >
                          {mode === 'embedding' ? (
                            <>
                              <Cpu className="w-3 h-3" />
                              向量余弦检索
                            </>
                          ) : (
                            <>
                              <Search className="w-3 h-3" />
                              BM25 关键词检索
                            </>
                          )}
                        </span>
                      )}
                    </div>

                    {isCurrentStreaming && progress && (
                      <div className="inline-flex items-center gap-1.5 text-xs text-teal-600 font-medium">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{progress.message}</span>
                      </div>
                    )}

                    {turn.status === 'done' &&
                      typeof turn.promptTokens === 'number' &&
                      typeof turn.completionTokens === 'number' && (
                        <span className="text-[11px] text-slate-400 font-mono">
                          Tokens: {turn.promptTokens + turn.completionTokens} (P:{turn.promptTokens} / C:
                          {turn.completionTokens})
                        </span>
                      )}
                  </div>

                  {/* 回答正文区域 */}
                  {turn.answer ? (
                    <div>
                      {renderFormattedAnswer(turn.answer)}
                      {isCurrentStreaming && (
                        <span className="inline-block w-2 h-4 ml-1 align-middle bg-teal-600 animate-pulse" />
                      )}
                    </div>
                  ) : isCurrentStreaming ? (
                    <div className="py-4 flex items-center gap-2 text-xs text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                      <span>{progress?.message || '正在检索教务原文切片并组织回答...'}</span>
                    </div>
                  ) : null}

                  {/* 错误状态与重试按钮 */}
                  {(turn.status === 'error' ||
                    (isCurrentStreaming && streamHookError)) && (
                    <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-red-700">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>
                          {turn.errorMessage ||
                            streamHookError?.message ||
                            '流式问答请求失败，请点击重试'}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={streaming}
                        onClick={() => handleRetryTurn(turn.question)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-300 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>重试提问</span>
                      </button>
                    </div>
                  )}

                  {/* 引用的原文片段（Citations）卡片列表 */}
                  {turn.status === 'done' && (
                    <CitationCardList
                      citations={turn.citations}
                      retrievalMode={turn.retrievalMode}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 底部自然语言提问输入框 */}
      <form onSubmit={handleFormSubmit} className="college-card p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <input
            type="text"
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            placeholder="输入你的教务日程问题，例如：下周三有空吗？期末前哪几门最紧？"
            disabled={streaming}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
          />
          <div className="flex items-center gap-2 shrink-0">
            {streaming ? (
              <button
                type="button"
                onClick={abortStream}
                className="btn-secondary text-red-600 border-red-200 hover:bg-red-50 w-full sm:w-auto"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>停止生成</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!questionInput.trim()}
                className="btn-primary bg-teal-600 hover:bg-teal-700 w-full sm:w-auto"
              >
                <Send className="w-4 h-4" />
                <span>发送提问</span>
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

export default QaPage;
