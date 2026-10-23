package com.oneterm.extract.dto;

/**
 * 文件上传解析结果 DTO（对齐 OpenAPI POST /api/extract/file 响应）。
 */
public record FileExtractResponse(
        String fileName,
        String sourceType,
        String extractedText
) {
}
