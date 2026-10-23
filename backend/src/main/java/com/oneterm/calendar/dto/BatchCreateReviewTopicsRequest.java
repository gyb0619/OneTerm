package com.oneterm.calendar.dto;

import java.util.List;

/**
 * 批量创建考前复习知识点请求 DTO。
 */
public record BatchCreateReviewTopicsRequest(
        Long eventId,
        List<String> topics,
        boolean autoSchedule
) {
}
