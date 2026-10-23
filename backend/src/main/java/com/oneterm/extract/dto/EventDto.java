package com.oneterm.extract.dto;

/**
 * 已持久化事件响应 DTO（对齐 OpenAPI EventDto）。
 */
public record EventDto(
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
