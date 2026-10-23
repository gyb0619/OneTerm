package com.oneterm.calendar.dto;

/**
 * 新增考前复习知识点请求体。
 */
public record CreateReviewTopicRequest(
        Long eventId,
        String topic,
        String plannedDate
) {
}
