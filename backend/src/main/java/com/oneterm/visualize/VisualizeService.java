package com.oneterm.visualize;

import com.oneterm.common.BusinessException;
import com.oneterm.common.CurrentUserProvider;
import com.oneterm.common.ErrorCode;
import com.oneterm.common.SseEventPublisher;
import com.oneterm.llm.ChatMessage;
import com.oneterm.llm.ChatResult;
import com.oneterm.llm.LlmGateway;
import com.oneterm.llm.LlmStreamListener;
import com.oneterm.llm.TokenUsage;
import com.oneterm.visualize.core.HtmlSandboxValidator;
import com.oneterm.visualize.core.HtmlSandboxValidator.TopicValidationResult;
import com.oneterm.visualize.core.HtmlSandboxValidator.ValidationResult;
import com.oneterm.visualize.dto.GenerateVisualizationRequest;
import com.oneterm.visualize.dto.VisualizationDto;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 知识点可视化工坊业务服务层。
 * 负责提示词加载（v1.0）、关联知识点解析、SSE 流式生成、HtmlSandboxValidator 沙箱安全校验、
 * 校验失败自动重试一次以及持久化与租户隔离查询。
 */
@Service
public class VisualizeService {

    public static final String PROMPT_VERSION = "v1.0";
    private static final String PROMPT_RESOURCE_PATH = "prompts/visualize-v1.txt";
    private static final ZoneId SHANGHAI_ZONE = ZoneId.of("Asia/Shanghai");

    private final VisualizationRepository repository;
    private final LlmGateway llmGateway;
    private final CurrentUserProvider currentUserProvider;
    private final SseEventPublisher sseEventPublisher;
    private final HtmlSandboxValidator validator;
    private final String promptTemplate;

    public VisualizeService(
            VisualizationRepository repository,
            LlmGateway llmGateway,
            CurrentUserProvider currentUserProvider,
            SseEventPublisher sseEventPublisher
    ) {
        this.repository = repository;
        this.llmGateway = llmGateway;
        this.currentUserProvider = currentUserProvider;
        this.sseEventPublisher = sseEventPublisher;
        this.validator = new HtmlSandboxValidator();
        this.promptTemplate = loadPromptTemplate();
    }

    /**
     * SSE 流式生成知识点交互式 HTML。
     * 若首次生成的 HTML 未通过安全沙箱校验，自动触发一次大模型重试；
     * 若重试后仍未通过，推送 SSE error 事件（code = VALIDATION_FAILED）。
     */
    public SseEmitter streamGenerate(GenerateVisualizationRequest request) {
        long userId = currentUserProvider.requireCurrentUserId();
        if (request == null || request.topic() == null || request.topic().isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "知识点名称不能为空");
        }

        TopicValidationResult topicCheck = validator.validateTopic(request.topic());
        if (!topicCheck.valid()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, topicCheck.reason());
        }

        String normalizedTopic = topicCheck.normalizedTopic();
        long resolvedTopicId = repository.resolveOrCreateTopicId(
                userId,
                request.topicId(),
                request.eventId(),
                normalizedTopic
        );
        String contextDesc = repository.findEventContextDescription(userId, request.eventId(), resolvedTopicId);

        SseEmitter emitter = new SseEmitter(180_000L);

        sseEventPublisher.sendProgress(
                emitter,
                "preparing",
                1,
                4,
                "已加载提示词模板 " + PROMPT_VERSION + "，准备生成「" + normalizedTopic + "」交互式可视化"
        );

        List<ChatMessage> firstMessages = buildMessages(normalizedTopic, contextDesc, null);
        AttemptOutcome firstAttempt = executeAttempt(userId, firstMessages, emitter);
        if (firstAttempt.error() != null) {
            handleStreamError(emitter, firstAttempt.error());
            return emitter;
        }

        sseEventPublisher.sendProgress(
                emitter,
                "validating",
                3,
                4,
                "正在执行 HTML 安全沙箱校验（100KB 体积上限与零外部网络请求检测）"
        );
        ValidationResult firstValidation = validator.validateHtml(firstAttempt.content());

        if (firstValidation.valid()) {
            VisualizationDto saved = repository.insert(
                    userId,
                    resolvedTopicId,
                    normalizedTopic,
                    firstValidation.sanitizedHtml(),
                    PROMPT_VERSION,
                    nowShanghaiIso()
            );
            sseEventPublisher.sendProgress(emitter, "completed", 4, 4, "安全沙箱校验通过，可视化已入库");
            sseEventPublisher.sendDone(
                    emitter,
                    saved,
                    firstAttempt.promptTokens(),
                    firstAttempt.completionTokens()
            );
            return emitter;
        }

        // 首次校验未通过，自动重试一次大模型生成
        sseEventPublisher.sendProgress(
                emitter,
                "retrying",
                2,
                4,
                "首次生成未通过安全沙箱校验（" + firstValidation.reason() + "），正在自动重试一次..."
        );

        List<ChatMessage> retryMessages = buildMessages(normalizedTopic, contextDesc, firstValidation.reason());
        AttemptOutcome secondAttempt = executeAttempt(userId, retryMessages, emitter);
        int totalPromptTokens = firstAttempt.promptTokens() + secondAttempt.promptTokens();
        int totalCompletionTokens = firstAttempt.completionTokens() + secondAttempt.completionTokens();

        if (secondAttempt.error() != null) {
            handleStreamError(emitter, secondAttempt.error());
            return emitter;
        }

        sseEventPublisher.sendProgress(
                emitter,
                "validating",
                3,
                4,
                "正在对重试生成的 HTML 执行安全沙箱校验"
        );
        ValidationResult secondValidation = validator.validateHtml(secondAttempt.content());

        if (!secondValidation.valid()) {
            sseEventPublisher.sendError(
                    emitter,
                    ErrorCode.VALIDATION_FAILED,
                    "可视化 HTML 安全沙箱校验未通过（已自动重试一次）：" + secondValidation.reason()
            );
            return emitter;
        }

        VisualizationDto saved = repository.insert(
                userId,
                resolvedTopicId,
                normalizedTopic,
                secondValidation.sanitizedHtml(),
                PROMPT_VERSION,
                nowShanghaiIso()
        );
        sseEventPublisher.sendProgress(emitter, "completed", 4, 4, "重试后安全沙箱校验通过，可视化已入库");
        sseEventPublisher.sendDone(emitter, saved, totalPromptTokens, totalCompletionTokens);
        return emitter;
    }

    /**
     * 获取当前登录用户已生成的可视化列表（支持按 topicId 过滤）。
     */
    public List<VisualizationDto> listVisualizations(Long topicId) {
        long userId = currentUserProvider.requireCurrentUserId();
        return repository.findAllByUserId(userId, topicId);
    }

    /**
     * 获取单条可视化详情（不属于当前用户时返回 404 NOT_FOUND）。
     */
    public VisualizationDto getVisualization(long id) {
        long userId = currentUserProvider.requireCurrentUserId();
        return repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "请求的可视化记录不存在"));
    }

    /**
     * 删除指定可视化记录（不属于当前用户时返回 404 NOT_FOUND）。
     */
    public void deleteVisualization(long id) {
        long userId = currentUserProvider.requireCurrentUserId();
        boolean deleted = repository.deleteByIdAndUserId(id, userId);
        if (!deleted) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "请求的可视化记录不存在");
        }
    }

    private AttemptOutcome executeAttempt(long userId, List<ChatMessage> messages, SseEmitter emitter) {
        StringBuilder deltaBuffer = new StringBuilder();
        AtomicReference<ChatResult> resultRef = new AtomicReference<>();
        AtomicReference<Throwable> errorRef = new AtomicReference<>();
        AtomicBoolean callbackInvoked = new AtomicBoolean(false);

        try {
            llmGateway.streamChat(userId, "visualize", messages, new LlmStreamListener() {
                @Override
                public void onProgress(String step, int current, int total, String message) {
                    sseEventPublisher.sendProgress(emitter, step, current, total, message);
                }

                @Override
                public void onDelta(String deltaText) {
                    callbackInvoked.set(true);
                    if (deltaText != null && !deltaText.isEmpty()) {
                        deltaBuffer.append(deltaText);
                        sseEventPublisher.sendDelta(emitter, deltaText);
                    }
                }

                @Override
                public void onComplete(ChatResult result) {
                    callbackInvoked.set(true);
                    resultRef.set(result);
                }

                @Override
                public void onError(Throwable error) {
                    callbackInvoked.set(true);
                    errorRef.set(error);
                }
            });

            if (!callbackInvoked.get() && resultRef.get() == null && errorRef.get() == null) {
                ChatResult fallbackResult = llmGateway.chat(userId, "visualize", messages);
                if (fallbackResult != null) {
                    if (fallbackResult.content() != null && !fallbackResult.content().isEmpty()) {
                        sseEventPublisher.sendDelta(emitter, fallbackResult.content());
                    }
                    resultRef.set(fallbackResult);
                }
            }
        } catch (Throwable ex) {
            errorRef.set(ex);
        }

        if (errorRef.get() != null) {
            return new AttemptOutcome("", 0, 0, errorRef.get());
        }

        ChatResult finalResult = resultRef.get();
        String content = finalResult != null && finalResult.content() != null
                ? finalResult.content()
                : deltaBuffer.toString();
        TokenUsage usage = finalResult != null && finalResult.usage() != null
                ? finalResult.usage()
                : TokenUsage.estimate(messages.toString(), content);

        return new AttemptOutcome(content, usage.promptTokens(), usage.completionTokens(), null);
    }

    private void handleStreamError(SseEmitter emitter, Throwable error) {
        if (error instanceof BusinessException be) {
            sseEventPublisher.sendError(emitter, be.getErrorCode(), be.getMessage());
        } else {
            String msg = error.getMessage() != null && !error.getMessage().isBlank()
                    ? error.getMessage()
                    : ErrorCode.LLM_UPSTREAM_ERROR.getDefaultMessage();
            sseEventPublisher.sendError(emitter, ErrorCode.LLM_UPSTREAM_ERROR, msg);
        }
    }

    private List<ChatMessage> buildMessages(String topic, String contextDesc, String previousFailureReason) {
        String renderedSystemPrompt = promptTemplate
                .replace("{{topic}}", topic)
                .replace("{{context}}", contextDesc != null ? contextDesc : "通用计算机科学课程");

        List<ChatMessage> messages = new ArrayList<>();
        messages.add(ChatMessage.system(renderedSystemPrompt));

        if (previousFailureReason != null && !previousFailureReason.isBlank()) {
            messages.add(ChatMessage.system(
                    "【安全沙箱重试修正指令】上一次生成的 HTML 未通过安全沙箱校验，具体原因："
                            + previousFailureReason
                            + "。请立即修正并重新输出符合要求的完整单文件 HTML（严禁任何外部链接、fetch、XMLHttpRequest、WebSocket、import()，且体积不超过 100KB）。"
            ));
        }

        messages.add(ChatMessage.user(topic));
        return messages;
    }

    private String loadPromptTemplate() {
        try {
            ClassPathResource resource = new ClassPathResource(PROMPT_RESOURCE_PATH);
            return new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return "# Prompt Version: v1.0\n请为知识点 {{topic}} 生成单文件交互式 <!DOCTYPE html> 页面，带 range 滑块和 button 按钮，严禁外链与网络请求。";
        }
    }

    private String nowShanghaiIso() {
        return OffsetDateTime.now(SHANGHAI_ZONE)
                .truncatedTo(ChronoUnit.SECONDS)
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    private record AttemptOutcome(
            String content,
            int promptTokens,
            int completionTokens,
            Throwable error
    ) {
    }
}
