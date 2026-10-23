package com.oneterm.visualize.dto;

/**
 * 知识点可视化响应数据传输对象（严格对齐 OpenAPI VisualizationDto）。
 */
public record VisualizationDto(
        long id,
        long userId,
        long topicId,
        String topic,
        String html,
        String promptVersion,
        String createdAt
) {
}
