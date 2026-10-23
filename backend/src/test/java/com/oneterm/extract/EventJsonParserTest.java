package com.oneterm.extract;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.oneterm.common.ErrorCode;
import com.oneterm.common.SseEventPublisher;
import com.oneterm.extract.core.EventJsonParser;
import com.oneterm.extract.dto.EventInputDto;
import com.oneterm.extract.service.ExtractService;
import com.oneterm.llm.ChatMessage;
import com.oneterm.llm.ChatResult;
import com.oneterm.llm.LlmGateway;
import com.oneterm.llm.LlmStreamListener;
import com.oneterm.llm.MockLlmGateway;
import com.oneterm.llm.TokenUsage;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

/**
 * EventJsonParser 纯函数与流式抽取自动重试机制单元测试。
 */
class EventJsonParserTest {

    @Test
    void shouldParseNormalJsonArray() {
        String json = """
                [
                  {
                    "type": "course",
                    "title": "《算法设计与分析》课程",
                    "startTime": "2026-11-04T08:00:00+08:00",
                    "endTime": "2026-11-04T09:40:00+08:00",
                    "location": "教学楼 A302",
                    "courseName": "算法设计与分析",
                    "sourceText": "1. 课程名称：《算法设计与分析》 2026-11-04 08:00-09:40"
                  }
                ]
                """;
        List<EventInputDto> events = EventJsonParser.parse(json);
        assertEquals(1, events.size());
        EventInputDto event = events.get(0);
        assertEquals("course", event.type());
        assertEquals("《算法设计与分析》课程", event.title());
        assertEquals("2026-11-04T08:00:00+08:00", event.startTime());
        assertEquals("2026-11-04T09:40:00+08:00", event.endTime());
        assertEquals("教学楼 A302", event.location());
        assertEquals("算法设计与分析", event.courseName());
        assertTrue(event.sourceText().contains("《算法设计与分析》"));
    }

    @Test
    void shouldParseMarkdownCodeBlockWrappedJsonAndNormalizeLocalTime() {
        String markdownWrapped = """
                下面是为您抽取的教务日程 JSON：
                ```json
                [
                  {
                    "type": "EXAM",
                    "title": "《操作系统》期中上机考核",
                    "startTime": "2026-11-06 19:00",
                    "endTime": "2026-11-06 21:00",
                    "location": "信息中心机房 D401",
                    "courseName": "操作系统",
                    "sourceText": "5. 【机考通知】《操作系统》期中上机考核定于 2026-11-06 19:00 至 21:00"
                  }
                ]
                ```
                """;
        List<EventInputDto> events = EventJsonParser.parse(markdownWrapped);
        assertEquals(1, events.size());
        EventInputDto first = events.get(0);
        assertEquals("exam", first.type());
        assertEquals("2026-11-06T19:00:00+08:00", first.startTime());
        assertEquals("2026-11-06T21:00:00+08:00", first.endTime());
        assertFalse(first.sourceText().isBlank());
    }

    @Test
    void shouldExtractAll9SampleEventsWithNonBlankSourceText() {
        String expectedJson = MockLlmGateway.loadExpectedEventsJson();
        List<EventInputDto> events = EventJsonParser.parse(expectedJson);
        assertEquals(9, events.size(), "示例数据应完整抽取全部 9 条事件");

        for (int i = 0; i < events.size(); i++) {
            EventInputDto ev = events.get(i);
            assertNotNull(ev.type(), "第 " + (i + 1) + " 条事件 type 不能为空");
            assertNotNull(ev.title(), "第 " + (i + 1) + " 条事件 title 不能为空");
            assertNotNull(ev.startTime(), "第 " + (i + 1) + " 条事件 startTime 不能为空");
            assertNotNull(ev.endTime(), "第 " + (i + 1) + " 条事件 endTime 不能为空");
            assertNotNull(ev.sourceText(), "第 " + (i + 1) + " 条事件 sourceText 不能为空");
            assertFalse(ev.sourceText().isBlank(), "第 " + (i + 1) + " 条事件必须保留原文片段 sourceText");
        }
    }

    @Test
    void shouldRejectMissingSourceTextOrInvalidEventType() {
        String missingSourceText = """
                [
                  {
                    "type": "course",
                    "title": "缺原文的课程",
                    "startTime": "2026-11-04T08:00:00+08:00",
                    "endTime": "2026-11-04T09:40:00+08:00",
                    "sourceText": "   "
                  }
                ]
                """;
        assertThrows(EventJsonParser.EventParseException.class, () -> EventJsonParser.parse(missingSourceText));

        String invalidType = """
                [
                  {
                    "type": "holiday_party",
                    "title": "非法事件类型",
                    "startTime": "2026-11-04T08:00:00+08:00",
                    "endTime": "2026-11-04T09:40:00+08:00",
                    "sourceText": "原文片段"
                  }
                ]
                """;
        assertThrows(EventJsonParser.EventParseException.class, () -> EventJsonParser.parse(invalidType));
    }

    @Test
    void shouldRetryOnceOnInvalidJsonAndSucceedWhenRetryReturnsValidJson() {
        AtomicInteger chatRetryCalls = new AtomicInteger(0);
        AtomicReference<Object> doneResultRef = new AtomicReference<>();
        List<String> progressSteps = new ArrayList<>();

        LlmGateway stubGateway = new LlmGateway() {
            @Override
            public boolean isMockMode() {
                return true;
            }

            @Override
            public boolean hasActiveEmbeddingModel() {
                return true;
            }

            @Override
            public ChatResult chat(long userId, String kind, List<ChatMessage> messages) {
                chatRetryCalls.incrementAndGet();
                return new ChatResult(
                        MockLlmGateway.loadExpectedEventsJson(),
                        new TokenUsage(100, 200),
                        "mock-retry",
                        true
                );
            }

            @Override
            public void streamChat(long userId, String kind, List<ChatMessage> messages, LlmStreamListener listener) {
                listener.onDelta("{broken json without closing bracket");
                listener.onComplete(new ChatResult(
                        "{broken json without closing bracket",
                        new TokenUsage(50, 20),
                        "mock-stream",
                        true
                ));
            }

            @Override
            public ChatResult extractTextFromImage(long userId, byte[] imageBytes, String mimeType, String prompt) {
                return null;
            }

            @Override
            public float[] embed(long userId, String text) {
                return new float[]{1.0f};
            }
        };

        SseEventPublisher recordingPublisher = new SseEventPublisher(new ObjectMapper()) {
            @Override
            public void sendProgress(SseEmitter emitter, String step, int current, int total, String message) {
                progressSteps.add(step);
                super.sendProgress(emitter, step, current, total, message);
            }

            @Override
            public void sendDone(SseEmitter emitter, Object result, int promptTokens, int completionTokens) {
                doneResultRef.set(result);
                super.sendDone(emitter, result, promptTokens, completionTokens);
            }
        };

        ExtractService service = new ExtractService(stubGateway, recordingPublisher);
        SseEmitter emitter = new SseEmitter();
        service.streamExtract(1L, MockLlmGateway.loadSampleText(), emitter);

        assertEquals(1, chatRetryCalls.get(), "首次 JSON 解析失败时应自动调用 chat 重试且仅重试 1 次");
        assertTrue(progressSteps.contains("retrying"), "应推送 retrying 进度通知");
        assertNotNull(doneResultRef.get(), "重试成功后应发送 done 事件");
        @SuppressWarnings("unchecked")
        List<EventInputDto> extracted = (List<EventInputDto>) doneResultRef.get();
        assertEquals(9, extracted.size());
    }

    @Test
    void shouldSendValidationFailedErrorWhenRetryStillFails() {
        AtomicInteger chatRetryCalls = new AtomicInteger(0);
        AtomicReference<ErrorCode> errorCodeRef = new AtomicReference<>();
        AtomicReference<String> errorMsgRef = new AtomicReference<>();

        LlmGateway alwaysInvalidGateway = new LlmGateway() {
            @Override
            public boolean isMockMode() {
                return true;
            }

            @Override
            public boolean hasActiveEmbeddingModel() {
                return true;
            }

            @Override
            public ChatResult chat(long userId, String kind, List<ChatMessage> messages) {
                chatRetryCalls.incrementAndGet();
                return new ChatResult("仍不是合法的 JSON", new TokenUsage(30, 10), "mock-retry", true);
            }

            @Override
            public void streamChat(long userId, String kind, List<ChatMessage> messages, LlmStreamListener listener) {
                listener.onComplete(new ChatResult("非法 JSON 输出", new TokenUsage(30, 10), "mock-stream", true));
            }

            @Override
            public ChatResult extractTextFromImage(long userId, byte[] imageBytes, String mimeType, String prompt) {
                return null;
            }

            @Override
            public float[] embed(long userId, String text) {
                return new float[]{1.0f};
            }
        };

        SseEventPublisher recordingPublisher = new SseEventPublisher(new ObjectMapper()) {
            @Override
            public void sendError(SseEmitter emitter, ErrorCode code, String message) {
                errorCodeRef.set(code);
                errorMsgRef.set(message);
                super.sendError(emitter, code, message);
            }
        };

        ExtractService service = new ExtractService(alwaysInvalidGateway, recordingPublisher);
        SseEmitter emitter = new SseEmitter();
        service.streamExtract(1L, "测试文本", emitter);

        assertEquals(1, chatRetryCalls.get(), "解析失败应自动重试一次");
        assertEquals(ErrorCode.VALIDATION_FAILED, errorCodeRef.get());
        assertEquals("抽取结果解析失败，已自动重试一次仍未成功，请修改文本或点击重试", errorMsgRef.get());
    }
}
