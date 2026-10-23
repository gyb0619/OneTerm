package com.oneterm.qa;

import java.util.List;

/**
 * RAG 流式问答 done 事件中的 result 载荷结构。
 */
public record QaAskResultDto(
        String answer,
        String retrievalMode,
        List<QaCitationDto> citations
) {
}
