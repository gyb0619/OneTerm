package com.oneterm.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 统一 SSE 事件发送工具（严格限定为 progress、delta、done、error 四类事件）。
 */
@Component
public class SseEventPublisher {

    private final ObjectMapper objectMapper;

    public SseEventPublisher(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void sendProgress(SseEmitter emitter, String step, int current, int total, String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("step", step);
        payload.put("current", current);
        payload.put("total", total);
        payload.put("message", message);
        sendEvent(emitter, "progress", payload);
    }

    public void sendDelta(SseEmitter emitter, String content) {
        sendEvent(emitter, "delta", Map.of("content", content != null ? content : ""));
    }

    public void sendDone(SseEmitter emitter, Object result, int promptTokens, int completionTokens) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("result", result);
        payload.put("usage", Map.of(
                "promptTokens", promptTokens,
                "completionTokens", completionTokens
        ));
        sendEvent(emitter, "done", payload);
        emitter.complete();
    }

    public void sendError(SseEmitter emitter, ErrorCode code, String message) {
        sendEvent(emitter, "error", Map.of(
                "code", code.name(),
                "message", message != null ? message : code.getDefaultMessage()
        ));
        emitter.complete();
    }

    private void sendEvent(SseEmitter emitter, String eventName, Object data) {
        try {
            String json = objectMapper.writeValueAsString(data);
            emitter.send(SseEmitter.event()
                    .name(eventName)
                    .data(json, MediaType.APPLICATION_JSON));
        } catch (IOException e) {
            emitter.completeWithError(e);
        }
    }
}
