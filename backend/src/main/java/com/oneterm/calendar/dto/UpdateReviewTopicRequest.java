package com.oneterm.calendar.dto;

/**
 * 更新考前复习知识点请求体。
 */
public record UpdateReviewTopicRequest(
        String topic,
        String plannedDate,
        Boolean done
) {
}
