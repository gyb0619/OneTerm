package com.oneterm.extract.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * 批量确认入库请求体 DTO（对齐 OpenAPI POST /api/events/batch 请求）。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record BatchEventRequest(
        List<EventInputDto> events
) {
}
