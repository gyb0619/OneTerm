package com.oneterm.llm;

public interface LlmStreamListener {

    default void onProgress(String step, int current, int total, String message) {
    }

    void onDelta(String deltaText);

    void onComplete(ChatResult result);

    void onError(Throwable error);
}
