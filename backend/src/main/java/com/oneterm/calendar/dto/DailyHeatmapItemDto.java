package com.oneterm.calendar.dto;

/**
 * 每日热力图数据项 DTO（严格对应 OpenAPI DailyHeatmapItemDto）。
 *
 * @param date       日期（YYYY-MM-DD）
 * @param score      当日负载权重总分（exam=5, deadline=3, course=2, activity=1, notice=1, review=2）
 * @param eventCount 当日事件与已排期复习任务总数
 */
public record DailyHeatmapItemDto(
        String date,
        int score,
        int eventCount
) {
}
