package com.oneterm.extract.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * 流式抽取请求体 DTO（对齐 OpenAPI POST /api/extract/stream 请求）。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record StreamExtractRequest(
        String text
) {
}
