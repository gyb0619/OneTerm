package com.oneterm.qa;

/**
 * 问答引用的原文片段 DTO（对应 OpenAPI QaCitationDto）。
 */
public record QaCitationDto(
        long chunkId,
        long eventId,
        String eventTitle,
        String text,
        float score
) {
}
