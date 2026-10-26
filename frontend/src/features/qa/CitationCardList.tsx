import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CalendarArrowUp, Cpu, Search } from 'lucide-react';
import { useAppStore } from '../../shared/store/useAppStore';
import type { QaCitationDto } from '../../shared/types/api';
import type { RetrievalMode } from './api';

interface CitationCardListProps {
  citations: QaCitationDto[];
  retrievalMode?: RetrievalMode;
}

/**
 * 引用的原文片段（Citations）卡片列表组件。
 * 点击任意引用卡片会设置全局 highlightedEventId 并跳转到 /calendar 定位对应事件。
 */
export const CitationCardList: React.FC<CitationCardListProps> = ({
  citations,
  retrievalMode = 'embedding',
}) => {
  const navigate = useNavigate();
  const setHighlightedEventId = useAppStore((state) => state.setHighlightedEventId);

  const handleJumpToEvent = (eventId: number) => {
    if (!eventId || eventId <= 0) return;
    useAppStore.getState().setHighlightedEventId(eventId);
    setHighlightedEventId(eventId);
    navigate('/calendar');
  };

  const isEmbedding = retrievalMode === 'embedding';

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-700">
          <BookOpen className="w-4 h-4 text-teal-600" />
          <span>引用的原文片段（Citations · Top {citations.length}）</span>
        </div>

        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
            isEmbedding
              ? 'bg-teal-50 text-teal-700 border-teal-200'
              : 'bg-sky-50 text-sky-700 border-sky-200'
          }`}
        >
          {isEmbedding ? (
            <>
              <Cpu className="w-3.5 h-3.5" />
              向量余弦检索 (float32)
            </>
          ) : (
            <>
              <Search className="w-3.5 h-3.5" />
              BM25 关键词检索
            </>
          )}
        </span>
      </div>

      {citations.length === 0 ? (
        <div className="rounded-xl bg-slate-50 border border-slate-200/80 px-4 py-3 text-xs sm:text-sm text-slate-500">
          暂无匹配的教务原文切片，请先在「课表导入」页面导入课表或教务通知并入库。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {citations.map((citation, idx) => {
            const eventTitle =
              citation.eventTitle?.trim() || `关联教务事件 #${citation.eventId}`;
            const formattedScore =
              typeof citation.score === 'number' ? citation.score.toFixed(4) : '0.0000';

            return (
              <button
                key={`${citation.chunkId}-${idx}`}
                type="button"
                onClick={() => handleJumpToEvent(citation.eventId)}
                className="group text-left rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-teal-50/50 hover:border-teal-300 p-3.5 transition-all duration-150 flex flex-col justify-between gap-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/30 shadow-2xs"
              >
                <div className="space-y-2 w-full">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-teal-600 text-white text-xs font-semibold">
                        #{idx + 1}
                      </span>
                      <span className="text-sm font-semibold text-slate-900 truncate group-hover:text-teal-700">
                        {eventTitle}
                      </span>
                    </div>
                    <span
                      className="shrink-0 text-xs font-mono px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600"
                      title={isEmbedding ? '余弦相似度分值' : 'BM25 相关性分值'}
                    >
                      {isEmbedding ? 'Sim' : 'BM25'}: {formattedScore}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed line-clamp-3 whitespace-pre-line">
                    {citation.text}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs text-teal-600 font-medium">
                  <span>事件 ID: #{citation.eventId}</span>
                  <span className="inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                    <CalendarArrowUp className="w-3.5 h-3.5" />
                    在日历中定位该事件
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
