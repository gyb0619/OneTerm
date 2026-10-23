package com.oneterm.calendar.dto;

/**
 * 日历模块事件 DTO（严格对应 OpenAPI EventDto）。
 */
public record CalendarEventDto(
        long id,
        long userId,
        String type,
        String title,
        String startTime,
        String endTime,
        String location,
        String courseName,
        String sourceText
) {
}
