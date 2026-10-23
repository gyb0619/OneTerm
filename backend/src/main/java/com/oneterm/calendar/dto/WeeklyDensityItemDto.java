package com.oneterm.calendar.dto;

/**
 * 每周任务密度数据项 DTO（严格对应 OpenAPI WeeklyDensityItemDto）。
 */
public record WeeklyDensityItemDto(
        String weekStart,
        String weekEnd,
        int totalScore,
        int examCount,
        int deadlineCount,
        int courseCount,
        int activityCount
) {
}
