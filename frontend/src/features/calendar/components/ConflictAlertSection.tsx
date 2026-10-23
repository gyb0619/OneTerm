import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, MapPin, ArrowUpRight } from 'lucide-react';
import type { ConflictPairDto } from '../../../shared/types/api';
import { EVENT_TYPE_META, formatTimeRange, parseEventDateTimeParts } from '../dateUtils';

interface ConflictAlertSectionProps {
  conflicts: ConflictPairDto[];
  selectedConflictIndex: number | null;
  onSelectConflict: (pair: ConflictPairDto, index: number) => void;
}

export const ConflictAlertSection: React.FC<ConflictAlertSectionProps> = ({
  conflicts,
  selectedConflictIndex,
  onSelectConflict,
}) => {
  if (conflicts.length === 0) {
    return (
      <div className="college-card p-4 border-emerald-200 bg-emerald-50/60 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-emerald-900">日程无时间冲突</h3>
          <p className="text-xs text-emerald-700">
            当前所有课程、考试、作业与活动均未发生时间重叠（首尾相接日程已自动豁免）。
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-3" aria-label="日程时间冲突预警">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600">
            <AlertTriangle className="w-4 h-4" />
          </span>
          <h2 className="text-base font-bold text-slate-900">
            日程冲突预警
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
              检出 {conflicts.length} 处冲突
            </span>
          </h2>
        </div>
        <span className="text-xs text-slate-500">
          点击任意冲突卡片可自动切换至对应周次并高亮定位冲突日程
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {conflicts.map((pair, idx) => {
          const isSelected = selectedConflictIndex === idx;
          const isFull = pair.conflictType === 'FULL_OVERLAP';
          const metaA = EVENT_TYPE_META[pair.eventA.type] || EVENT_TYPE_META.notice;
          const metaB = EVENT_TYPE_META[pair.eventB.type] || EVENT_TYPE_META.notice;
          const startA = parseEventDateTimeParts(pair.eventA.startTime);
          const endA = parseEventDateTimeParts(pair.eventA.endTime);
          const startB = parseEventDateTimeParts(pair.eventB.startTime);
          const endB = parseEventDateTimeParts(pair.eventB.endTime);

          return (
            <button
              key={`${pair.eventA.id}-${pair.eventB.id}-${idx}`}
              type="button"
              onClick={() => onSelectConflict(pair, idx)}
              className={`text-left rounded-xl border p-4 transition-all duration-150 shadow-sm group ${
                isSelected
                  ? 'bg-red-50/90 border-red-400 ring-2 ring-red-400/40'
                  : 'bg-white border-red-200 hover:border-red-300 hover:bg-red-50/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                      isFull
                        ? 'bg-red-600 text-white'
                        : 'bg-amber-500 text-white'
                    }`}
                  >
                    {isFull ? '完全重叠 (FULL_OVERLAP)' : '部分重叠 (PARTIAL_OVERLAP)'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                    <Clock className="w-3.5 h-3.5" />
                    重叠时段：{formatTimeRange(pair.overlapStart, pair.overlapEnd)}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 group-hover:translate-x-0.5 transition-transform">
                  定位日历
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="rounded-lg bg-slate-50/90 border border-slate-200/80 p-2.5">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span
                      className={`text-[11px] px-1.5 py-0.5 rounded border font-medium ${metaA.badgeClass}`}
                    >
                      {metaA.label}
                    </span>
                    <span className="text-xs font-mono text-slate-600">
                      {startA.timeStr} - {endA.timeStr}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {pair.eventA.title}
                  </div>
                  {pair.eventA.location && (
                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-1 truncate">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {pair.eventA.location}
                    </div>
                  )}
                </div>

                <div className="rounded-lg bg-slate-50/90 border border-slate-200/80 p-2.5">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span
                      className={`text-[11px] px-1.5 py-0.5 rounded border font-medium ${metaB.badgeClass}`}
                    >
                      {metaB.label}
                    </span>
                    <span className="text-xs font-mono text-slate-600">
                      {startB.timeStr} - {endB.timeStr}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {pair.eventB.title}
                  </div>
                  {pair.eventB.location && (
                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-1 truncate">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {pair.eventB.location}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
