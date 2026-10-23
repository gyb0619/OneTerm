package com.oneterm.qa;

/**
 * RAG 流式问答请求体 DTO（对应 OpenAPI /api/qa/ask/stream 请求）。
 */
public record QaAskRequest(
        String question
) {
}
