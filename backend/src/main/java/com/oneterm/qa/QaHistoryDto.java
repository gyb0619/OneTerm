package com.oneterm.qa;

import java.util.List;

/**
 * 历史问答记录 DTO。
 */
public record QaHistoryDto(
        long id,
        String question,
        String answer,
        String retrievalMode,
        List<QaCitationDto> citations,
        String createdAt
) {
}
