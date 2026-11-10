package com.oneterm.calendar.dto;

import java.util.List;

/**
 * 智能日程提醒汇总响应 DTO。
 */
public record RemindersSummaryResponse(
        int totalCount,
        int urgentCount,
        String referenceDate,
        List<ReminderItemDto> todayEvents,
        List<ReminderItemDto> upcomingExams,
        List<ReminderItemDto> upcomingDeadlines,
        List<ReminderItemDto> conflictAlerts,
        List<ReminderItemDto> todayReviewTopics
) {
}
