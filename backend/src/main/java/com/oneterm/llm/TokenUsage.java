package com.oneterm.llm;

public record TokenUsage(int promptTokens, int completionTokens) {

    public int totalTokens() {
        return promptTokens + completionTokens;
    }

    public static TokenUsage estimate(String promptText, String completionText) {
        int p = estimateCount(promptText);
        int c = estimateCount(completionText);
        return new TokenUsage(p, c);
    }

    public static int estimateCount(String text) {
        if (text == null || text.isEmpty()) {
            return 0;
        }
        return Math.max(1, (int) Math.ceil(text.length() * 0.6));
    }
}
