import React, { useCallback, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Cpu,
  Database,
  Loader2,
  MessageSquareText,
  Search,
  Send,
  Sparkles,
  Square,
  User,
  RotateCcw,
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
          className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-100 text-teal-800 font-mono text-xs border border-slate-200"
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
    <div className="space-y-1.5 text-xs sm:text-sm text-slate-700 leading-relaxed">
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
    error: _streamHookError,
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
    <div className="space-y-4 max-w-4xl mx-auto">
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
          <button
            type="button"
            onClick={handleRebuildIndex}
            disabled={indexing || streaming}
            className="btn-secondary py-1 px-2.5 text-xs text-slate-600 hover:text-slate-900"
          >
            {indexing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
            ) : (
              <Database className="w-3.5 h-3.5" />
            )}
            <span>{indexing ? '构建中...' : '重建切片索引'}</span>
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

      {/* 对话列表区 */}
      <div className="space-y-4 min-h-[380px]">
        {turns.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">关于学期日程，随时提问</h2>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                可询问具体课程安排、时间冲突排查、考试截止日期以及考前复习建议
              </p>
            </div>

            <div className="pt-2 flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void askQuestion(q)}
                  disabled={streaming}
                  className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-teal-50/80 border border-slate-200 hover:border-teal-300 text-xs text-slate-700 hover:text-teal-900 transition text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn) => {
            const isStreamingThis = turn.status === 'streaming';
            return (
              <div key={turn.id} className="space-y-3">
                {/* 用户提问气泡 */}
                <div className="flex justify-end items-start gap-2">
                  <div className="bg-teal-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-xs max-w-[85%] shadow-sm leading-relaxed">
                    {turn.question}
                  </div>
                  <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 text-xs">
                    <User className="w-4 h-4" />
                  </div>
                </div>

                {/* 助手回答卡片 */}
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-200/60 text-xs">
                    <Bot className="w-4 h-4" />
                  </div>

                  <div className="flex-1 bg-white rounded-2xl rounded-tl-sm border border-slate-200/80 p-4 shadow-sm space-y-3">
                    {isStreamingThis && !turn.answer && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                        <span>正在检索教务切片并生成回答...</span>
                      </div>
                    )}

                    {turn.answer && renderFormattedAnswer(turn.answer)}

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
                        <span>
                          {turn.retrievalMode === 'embedding'
                            ? '余弦向量检索 (float32)'
                            : 'BM25 降级检索'}
                        </span>
                        {turn.promptTokens !== undefined && (
                          <span>
                            Tokens: {turn.promptTokens} + {turn.completionTokens}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

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
