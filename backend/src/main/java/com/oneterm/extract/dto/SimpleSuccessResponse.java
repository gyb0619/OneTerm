package com.oneterm.extract.dto;

/**
 * 通用成功响应 DTO（对齐 OpenAPI SimpleSuccessResponse）。
 */
public record SimpleSuccessResponse(
        boolean success,
        String message
) {
}
