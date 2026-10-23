package com.oneterm.calendar.dto;

import java.util.List;

/**
 * 学期日历全景响应 DTO（严格对应 OpenAPI CalendarOverviewResponse）。
 */
public record CalendarOverviewResponse(
        List<CalendarEventDto> events,
        List<ReviewTopicDto> reviewTopics,
        List<ConflictPairDto> conflicts,
        List<DailyHeatmapItemDto> dailyHeatmap,
        List<WeeklyDensityItemDto> weeklyDensity,
        DailyHeatmapItemDto freestDay,
        DailyHeatmapItemDto busiestDay,
        WeeklyDensityItemDto busiestWeek
) {
}
