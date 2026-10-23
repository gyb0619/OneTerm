package com.oneterm.visualize.dto;

/**
 * 流式生成知识点可视化请求参数。
 */
public record GenerateVisualizationRequest(
        Long topicId,
        Long eventId,
        String topic
) {
}
