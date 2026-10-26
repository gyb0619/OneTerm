import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { Flame, Coffee, BarChart3, CalendarRange } from 'lucide-react';
import type {
  DailyHeatmapItemDto,
  WeeklyDensityItemDto,
} from '../../../shared/types/api';
import { formatShortDate, getMondayOfDate } from '../dateUtils';

interface SemesterWorkloadChartsProps {
  dailyHeatmap: DailyHeatmapItemDto[];
  weeklyDensity: WeeklyDensityItemDto[];
  freestDay?: DailyHeatmapItemDto | null;
  busiestDay?: DailyHeatmapItemDto | null;
  busiestWeek?: WeeklyDensityItemDto | null;
  onJumpToWeek: (mondayDateStr: string) => void;
}

/**
 * 将当日负载分数映射为清爽学院风单色渐变（由浅到深学院青绿）
 */
function getHeatmapColorStyle(score: number): {
  bg: string;
  text: string;
  border: string;
  levelLabel: string;
} {
  if (score <= 0) {
    return {
      bg: 'var(--heatmap-0, #f1f5f9)',
      text: '#64748b',
      border: '#e2e8f0',
      levelLabel: '空闲 (0分)',
    };
  }
  if (score <= 2) {
    return {
      bg: 'var(--heatmap-1, #ccfbf1)',
      text: '#115e59',
      border: '#99f6e4',
      levelLabel: '轻松 (1-2分)',
    };
  }
  if (score <= 5) {
    return {
      bg: 'var(--heatmap-2, #5eead4)',
      text: '#134e4a',
      border: '#2dd4bf',
      levelLabel: '适中 (3-5分)',
    };
  }
  if (score <= 8) {
    return {
      bg: 'var(--heatmap-3, #14b8a6)',
      text: '#ffffff',
      border: '#0d9488',
      levelLabel: '繁忙 (6-8分)',
    };
  }
  return {
    bg: 'var(--heatmap-4, #0f766e)',
    text: '#ffffff',
    border: '#115e59',
    levelLabel: '高密高压 (9分+)',
  };
}

export const SemesterWorkloadCharts: React.FC<SemesterWorkloadChartsProps> = ({
  dailyHeatmap,
  weeklyDensity,
  freestDay,
  busiestDay,
  busiestWeek,
  onJumpToWeek,
}) => {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el || weeklyDensity.length === 0) return;

    const chart = echarts.init(el);
    const weekLabels = weeklyDensity.map((_, idx) => `第${idx + 1}周`);

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(255, 255, 255, 0.98)',
        borderColor: '#cbd5e1',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: '#0f172a', fontSize: 12 },
        extraCssText: 'box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1); border-radius: 12px; z-index: 50;',
        formatter: (params: unknown) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const dataIndex = params[0].dataIndex as number;
          const item = weeklyDensity[dataIndex];
          if (!item) return '';
          let html = `<div style="font-weight:700;margin-bottom:6px;font-size:13px;color:#0f172a;">第 ${dataIndex + 1} 周 (${item.weekStart} ~ ${item.weekEnd})</div>`;
          html += `<div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:6px;font-weight:700;color:#0f766e;"><span>周总负载分数</span><span>${item.totalScore} 分</span></div>`;
          html += `<div style="border-top:1px dashed #e2e8f0;margin:6px 0;"></div>`;
          params.forEach((p: { seriesName: string; color: string; value: number }) => {
            if (p.seriesName !== '周负载总分') {
              html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:12px;margin:3px 0;">
                <span style="display:flex;align-items:center;gap:6px;">
                  <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color};"></span>
                  <span style="color:#64748b;">${p.seriesName}</span>
                </span>
                <span style="font-weight:600;color:#1e293b;">${p.value} 个</span>
              </div>`;
            }
          });
          return html;
        },
      },
      legend: {
        top: 4,
        right: 12,
        itemGap: 14,
        textStyle: { fontSize: 12, color: '#475569' },
        icon: 'roundRect',
        data: ['考试(5分)', '作业截止(3分)', '课程(2分)', '活动(1分)', '周负载总分'],
      },
      grid: {
        left: 35,
        right: 35,
        bottom: 35,
        top: 48,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: weekLabels,
        axisLabel: {
          color: '#475569',
          fontSize: 11,
          interval: weeklyDensity.length > 18 ? 'auto' : 0,
        },
        axisTick: { alignWithLabel: true },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
      },
      yAxis: [
        {
          type: 'value',
          name: '事件数量',
          minInterval: 1,
          nameTextStyle: { color: '#64748b', fontSize: 11 },
          axisLabel: { color: '#64748b', fontSize: 11 },
          splitLine: { lineStyle: { color: '#f1f5f9' } },
        },
        {
          type: 'value',
          name: '负载总分',
          minInterval: 1,
          nameTextStyle: { color: '#0f766e', fontSize: 11 },
          axisLabel: { color: '#0f766e', fontSize: 11 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '考试(5分)',
          type: 'bar',
          stack: 'events',
          barMaxWidth: 26,
          itemStyle: { color: '#ef4444' },
          data: weeklyDensity.map((w) => w.examCount),
        },
        {
          name: '作业截止(3分)',
          type: 'bar',
          stack: 'events',
          barMaxWidth: 26,
          itemStyle: { color: '#f59e0b' },
          data: weeklyDensity.map((w) => w.deadlineCount),
        },
        {
          name: '课程(2分)',
          type: 'bar',
          stack: 'events',
          barMaxWidth: 26,
          itemStyle: { color: '#0d9488' },
          data: weeklyDensity.map((w) => w.courseCount),
        },
        {
          name: '活动(1分)',
          type: 'bar',
          stack: 'events',
          barMaxWidth: 26,
          itemStyle: { color: '#0284c7', borderRadius: [4, 4, 0, 0] },
          data: weeklyDensity.map((w) => w.activityCount),
        },
        {
          name: '周负载总分',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbolSize: 8,
          itemStyle: { color: '#0f766e' },
          lineStyle: { width: 3, color: '#0f766e' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(13, 148, 136, 0.25)' },
              { offset: 1, color: 'rgba(13, 148, 136, 0.02)' },
            ]),
          },
          data: weeklyDensity.map((w) => w.totalScore),
        },
      ],
    };

    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(el);

    const t1 = window.setTimeout(handleResize, 100);
    const t2 = window.setTimeout(handleResize, 350);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      chart.dispose();
    };
  }, [weeklyDensity]);

  return (
    <section className="space-y-4">
      {/* 顶部醒目高亮摘要三卡片：最空的一天、最忙的一天、最忙的一周 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => freestDay && onJumpToWeek(getMondayOfDate(freestDay.date))}
          className="bg-white rounded-xl border border-slate-200/80 p-3.5 text-left hover:border-teal-400 shadow-sm transition-all flex items-start justify-between group"
        >
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200 mb-1.5">
              <Coffee className="w-3 h-3" />
              最空的一天
            </div>
            <div className="text-base font-bold text-slate-900">
              {freestDay ? formatShortDate(freestDay.date) : '--'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {freestDay
                ? `负载 ${freestDay.score} 分 · ${freestDay.eventCount} 项日程`
                : '暂无统计数据'}
            </div>
          </div>
          <span className="text-[11px] font-mono text-teal-600 group-hover:underline">
            {freestDay?.date}
          </span>
        </button>

        <button
          type="button"
          onClick={() => busiestDay && onJumpToWeek(getMondayOfDate(busiestDay.date))}
          className="bg-white rounded-xl border border-slate-200/80 p-3.5 text-left hover:border-rose-400 shadow-sm transition-all flex items-start justify-between group"
        >
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 mb-1.5">
              <Flame className="w-3 h-3" />
              最忙的一天
            </div>
            <div className="text-base font-bold text-slate-900">
              {busiestDay ? formatShortDate(busiestDay.date) : '--'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {busiestDay
                ? `负载 ${busiestDay.score} 分 · ${busiestDay.eventCount} 项日程`
                : '暂无统计数据'}
            </div>
          </div>
          <span className="text-[11px] font-mono text-rose-600 group-hover:underline">
            {busiestDay?.date}
          </span>
        </button>

        <button
          type="button"
          onClick={() => busiestWeek && onJumpToWeek(busiestWeek.weekStart)}
          className="bg-white rounded-xl border border-slate-200/80 p-3.5 text-left hover:border-amber-400 shadow-sm transition-all flex items-start justify-between group"
        >
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 mb-1.5">
              <CalendarRange className="w-3 h-3" />
              最忙的一周
            </div>
            <div className="text-base font-bold text-slate-900">
              {busiestWeek
                ? `${busiestWeek.weekStart.slice(5)} ~ ${busiestWeek.weekEnd.slice(5)}`
                : '--'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {busiestWeek
                ? `周总负载 ${busiestWeek.totalScore} 分 (${busiestWeek.examCount}场考试, ${busiestWeek.deadlineCount}项截止)`
                : '暂无统计数据'}
            </div>
          </div>
          <span className="text-[11px] font-mono text-amber-700 group-hover:underline">
            切换该周
          </span>
        </button>
      </div>

      {/* 1. ECharts 每周任务密度趋势图（全宽独立卡片，充足横向空间彻底消除数据堆叠） */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-5 flex flex-col space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">每周任务密度与分类</h3>
              <p className="text-xs text-slate-500">
                学期各周次考试、作业、课程、活动负荷堆叠与总分变化趋势
              </p>
            </div>
          </div>
          {busiestWeek && (
            <span className="text-xs px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-medium self-start sm:self-auto">
              峰值周：第 {weeklyDensity.findIndex((w) => w.weekStart === busiestWeek.weekStart) + 1} 周 ({busiestWeek.weekStart.slice(5)} 周，{busiestWeek.totalScore} 分)
            </span>
          )}
        </div>
        <div ref={chartContainerRef} className="w-full h-80 min-h-[320px]" />
      </div>

      {/* 2. 学期每日负载热力分布（全宽独立卡片，大格位平铺呈现日期与日程项） */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">学期每日负载热力分布</h3>
            <p className="text-xs text-slate-500">
              考试(5分) · 作业(3分) · 课程(2分) · 活动(1分)，点击任意日期跳转至对应周历
            </p>
          </div>

          {/* 单色渐变色阶图例 */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 self-start sm:self-auto">
            <span>轻松</span>
            {[0, 2, 4, 7, 10].map((sampleScore) => {
              const style = getHeatmapColorStyle(sampleScore);
              return (
                <span
                  key={sampleScore}
                  className="w-4 h-4 rounded border"
                  style={{ backgroundColor: style.bg, borderColor: style.border }}
                  title={style.levelLabel}
                />
              );
            })}
            <span>繁忙</span>
          </div>
        </div>

        {/* 按周分组展示 7 列网格 */}
        <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-600 mb-1">
          <span>周一</span>
          <span>周二</span>
          <span>周三</span>
          <span>周四</span>
          <span>周五</span>
          <span>周六</span>
          <span>周日</span>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {dailyHeatmap.map((item) => {
            const style = getHeatmapColorStyle(item.score);
            const isFreest = freestDay?.date === item.date;
            const isBusiest = busiestDay?.date === item.date && item.score > 0;

            return (
              <button
                key={item.date}
                type="button"
                onClick={() => onJumpToWeek(getMondayOfDate(item.date))}
                style={{
                  backgroundColor: style.bg,
                  color: style.text,
                  borderColor: style.border,
                }}
                className={`relative rounded-xl border p-2.5 text-left transition-all duration-150 hover:scale-[1.03] active:scale-95 shadow-2xs ${
                  isBusiest
                    ? 'ring-2 ring-red-500 font-bold'
                    : isFreest
                      ? 'ring-2 ring-teal-500 font-bold'
                      : ''
                }`}
                title={`${item.date}：负载 ${item.score} 分（${item.eventCount} 项日程）`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-mono font-bold">
                    {item.date.slice(5)}
                  </span>
                  {isBusiest && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-600 text-white">
                      最忙
                    </span>
                  )}
                  {!isBusiest && isFreest && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-teal-700 text-white">
                      最空
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs font-extrabold">{item.score} 分</div>
                <div className="text-[11px] opacity-85 truncate">{item.eventCount} 项日程</div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
