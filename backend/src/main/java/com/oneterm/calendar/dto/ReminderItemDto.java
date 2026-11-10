package com.oneterm.calendar.dto;

/**
 * 智能日程提醒条目 DTO。
 */
public record ReminderItemDto(
        String id,
        String type,
        String title,
        String subtitle,
        String timeDisplay,
        String location,
        String urgencyLevel,
        String targetDate,
        Long relatedEventId,
        Long relatedTopicId
) {
}
