package com.oneterm.llm;

public record ChatResult(
        String content,
        TokenUsage usage,
        String modelName,
        boolean mock
) {
}
