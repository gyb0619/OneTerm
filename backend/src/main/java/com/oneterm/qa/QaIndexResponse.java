package com.oneterm.qa;

/**
 * 重建切片与向量索引响应 DTO（对应 OpenAPI /api/qa/index 响应）。
 */
public record QaIndexResponse(
        int chunkCount,
        String mode
) {
}
