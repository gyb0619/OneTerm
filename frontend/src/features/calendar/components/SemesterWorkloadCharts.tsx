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
    const weekLabels = weeklyDensity.map(
      (w, idx) => `第${idx + 1}周\n(${w.weekStart.slice(5)}~${w.weekEnd.slice(5)})`
    );

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      legend: {
        top: 0,
        textStyle: { fontSize: 11, color: '#475569' },
        data: ['考试(5分)', '作业截止(3分)', '课程(2分)', '活动(1分)', '周负载总分'],
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '6%',
        top: 38,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: weekLabels,
        axisLabel: { color: '#475569', fontSize: 11 },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
      },
      yAxis: [
        {
          type: 'value',
          name: '事件数量',
          minInterval: 1,
          axisLabel: { color: '#64748b', fontSize: 11 },
          splitLine: { lineStyle: { color: '#f1f5f9' } },
        },
        {
          type: 'value',
          name: '负载总分',
          minInterval: 1,
          axisLabel: { color: '#0f766e', fontSize: 11 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '考试(5分)',
          type: 'bar',
          stack: 'events',
          barMaxWidth: 28,
          itemStyle: { color: '#ef4444', borderRadius: [0, 0, 0, 0] },
          data: weeklyDensity.map((w) => w.examCount),
        },
        {
          name: '作业截止(3分)',
          type: 'bar',
          stack: 'events',
          barMaxWidth: 28,
          itemStyle: { color: '#f59e0b' },
          data: weeklyDensity.map((w) => w.deadlineCount),
        },
        {
          name: '课程(2分)',
          type: 'bar',
          stack: 'events',
          barMaxWidth: 28,
          itemStyle: { color: '#0d9488' },
          data: weeklyDensity.map((w) => w.courseCount),
        },
        {
          name: '活动(1分)',
          type: 'bar',
          stack: 'events',
          barMaxWidth: 28,
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
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [weeklyDensity]);

  return (
    <section className="space-y-4">
      {/* 顶部醒目高亮摘要三卡片：最空的一天、最忙的一天、最忙的一周 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => freestDay && onJumpToWeek(getMondayOfDate(freestDay.date))}
          className="college-card p-4 text-left hover:border-brand-500 transition-colors flex items-start justify-between group"
        >
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200 mb-2">
              <Coffee className="w-3.5 h-3.5" />
              最空的一天
            </div>
            <div className="text-lg font-bold text-slate-900">
              {freestDay ? formatShortDate(freestDay.date) : '--'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {freestDay
                ? `负载权重 ${freestDay.score} 分 · ${freestDay.eventCount} 项日程（推荐安排复习）`
                : '暂无统计数据'}
            </div>
          </div>
          <span className="text-xs font-mono text-brand-600 group-hover:underline">
            {freestDay?.date}
          </span>
        </button>

        <button
          type="button"
          onClick={() => busiestDay && onJumpToWeek(getMondayOfDate(busiestDay.date))}
          className="college-card p-4 text-left hover:border-red-400 transition-colors flex items-start justify-between group"
        >
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200 mb-2">
              <Flame className="w-3.5 h-3.5" />
              最忙的一天
            </div>
            <div className="text-lg font-bold text-slate-900">
              {busiestDay ? formatShortDate(busiestDay.date) : '--'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {busiestDay
                ? `负载权重 ${busiestDay.score} 分 · 共 ${busiestDay.eventCount} 项密集日程`
                : '暂无统计数据'}
            </div>
          </div>
          <span className="text-xs font-mono text-red-600 group-hover:underline">
            {busiestDay?.date}
          </span>
        </button>

        <button
          type="button"
          onClick={() => busiestWeek && onJumpToWeek(busiestWeek.weekStart)}
          className="college-card p-4 text-left hover:border-amber-400 transition-colors flex items-start justify-between group"
        >
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 mb-2">
              <CalendarRange className="w-3.5 h-3.5" />
              最忙的一周
            </div>
            <div className="text-lg font-bold text-slate-900">
              {busiestWeek
                ? `${busiestWeek.weekStart.slice(5)} ~ ${busiestWeek.weekEnd.slice(5)}`
                : '--'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {busiestWeek
                ? `周总负载 ${busiestWeek.totalScore} 分（含 ${busiestWeek.examCount} 场考试、${busiestWeek.deadlineCount} 项截止）`
                : '暂无统计数据'}
            </div>
          </div>
          <span className="text-xs font-mono text-amber-700 group-hover:underline">
            切换该周
          </span>
        </button>
      </div>

      {/* 热力图与 ECharts 周密度图双栏 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 学期每日负载热力图（学院青绿单色渐变） */}
        <div className="college-card p-5 lg:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  学期每日负载热力图（学院青绿单色渐变）
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  权重：考试(5) &gt; 作业截止(3) &gt; 课程/复习(2) &gt; 活动/通知(1)，点击任意日期可切换周历
                </p>
              </div>

              {/* 单色渐变色阶图例 */}
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
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
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-slate-500 mb-1.5">
              <span>周一</span>
              <span>周二</span>
              <span>周三</span>
              <span>周四</span>
              <span>周五</span>
              <span>周六</span>
              <span>周日</span>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
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
                    className={`relative rounded-lg border p-2 text-left transition-transform hover:scale-[1.03] ${
                      isBusiest
                        ? 'ring-2 ring-red-500'
                        : isFreest
                          ? 'ring-2 ring-teal-500'
                          : ''
                    }`}
                    title={`${item.date}：负载 ${item.score} 分（${item.eventCount} 项）`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-mono font-bold">
                        {item.date.slice(5)}
                      </span>
                      {isBusiest && (
                        <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-red-600 text-white">
                          最忙
                        </span>
                      )}
                      {!isBusiest && isFreest && (
                        <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-teal-700 text-white">
                          最空
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs font-extrabold">{item.score} 分</div>
                    <div className="text-[10px] opacity-80">{item.eventCount} 项日程</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ECharts 每周任务密度趋势图 */}
        <div className="college-card p-5 lg:col-span-5 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-brand-600" />
              <h3 className="text-sm font-bold text-slate-900">每周任务密度与分类占比</h3>
            </div>
            {busiestWeek && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                峰值：{busiestWeek.weekStart.slice(5)} 周 ({busiestWeek.totalScore}分)
              </span>
            )}
          </div>
          <div ref={chartContainerRef} className="w-full h-64 flex-1 min-h-[240px]" />
        </div>
      </div>
    </section>
  );
};
