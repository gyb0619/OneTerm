package com.oneterm.llm;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class MockLlmGatewayTest {

    private final MockLlmGateway gateway = new MockLlmGateway();

    @Test
    void shouldStreamExtractEventsWithProgressAndDeltas() {
        List<String> progresses = new ArrayList<>();
        StringBuilder deltaCollector = new StringBuilder();
        AtomicReference<ChatResult> finalResult = new AtomicReference<>();

        gateway.streamChat(
                1L,
                "extract",
                List.of(ChatMessage.user("请抽取事件并返回包含 sourceText 的 JSON")),
                new LlmStreamListener() {
                    @Override
                    public void onProgress(String step, int current, int total, String message) {
                        progresses.add(message);
                    }

                    @Override
                    public void onDelta(String deltaText) {
                        deltaCollector.append(deltaText);
                    }

                    @Override
                    public void onComplete(ChatResult result) {
                        finalResult.set(result);
                    }

                    @Override
                    public void onError(Throwable error) {
                        fail("Unexpected error: " + error.getMessage());
                    }
                }
        );

        assertEquals(9, progresses.size());
        assertTrue(progresses.get(0).contains("正在识别第 1 条事件"));
        assertNotNull(finalResult.get());
        assertEquals(deltaCollector.toString(), finalResult.get().content());
        assertTrue(finalResult.get().content().contains("sourceText"));
        assertTrue(finalResult.get().content().contains("算法设计与分析"));
    }

    @Test
    void shouldGenerateValidInteractiveHtmlForBubbleSortAndTcpHandshake() {
        ChatResult bubbleResult = gateway.chat(1L, "visualize", List.of(ChatMessage.user("冒泡排序")));
        String bubbleHtml = bubbleResult.content();
        assertTrue(bubbleHtml.getBytes(StandardCharsets.UTF_8).length <= 100 * 1024);
        assertFalse(bubbleHtml.contains("http://"));
        assertFalse(bubbleHtml.contains("https://"));
        assertFalse(bubbleHtml.contains("fetch("));
        assertTrue(bubbleHtml.contains("type=\"range\""));
        assertTrue(bubbleHtml.contains("<button"));

        ChatResult tcpResult = gateway.chat(1L, "visualize", List.of(ChatMessage.user("TCP 三次握手")));
        String tcpHtml = tcpResult.content();
        assertTrue(tcpHtml.getBytes(StandardCharsets.UTF_8).length <= 100 * 1024);
        assertFalse(tcpHtml.contains("http://"));
        assertFalse(tcpHtml.contains("https://"));
        assertTrue(tcpHtml.contains("SYN_SENT"));
        assertTrue(tcpHtml.contains("ESTABLISHED"));
    }

    @Test
    void shouldProduceNormalizedEmbeddingsWithHigherSimilarityForRelatedTexts() {
        float[] queryVec = gateway.embed(1L, "下周三有空吗");
        float[] wedCourseVec = gateway.embed(1L, "2026-11-04 周三 《算法设计与分析》 上课");
        float[] unrelatedVec = gateway.embed(1L, "其他无关通知内容");

        double simRelated = cosine(queryVec, wedCourseVec);
        double simUnrelated = cosine(queryVec, unrelatedVec);
        assertTrue(simRelated > simUnrelated, "Related chunk should have higher cosine similarity");
    }

    private double cosine(float[] a, float[] b) {
        double dot = 0.0;
        for (int i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
        }
        return dot;
    }
}
