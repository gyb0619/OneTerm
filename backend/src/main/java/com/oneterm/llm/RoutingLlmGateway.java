package com.oneterm.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.oneterm.common.BusinessException;
import com.oneterm.common.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * 统一大模型网关的主路由实现（@Primary）。
 * 负责：
 * 1. 每次调用前校验当前用户今日（Asia/Shanghai 0 点起）Token 额度，超限抛 429 QUOTA_EXCEEDED；
 * 2. 根据 ONETERM_MOCK 及 llm_config 表启用的模型配置决定走真实上游 API 还是回退 MockLlmGateway；
 * 3. 支持读取用户偏好的已启用对话模型（preferred_model_id）；
 * 4. 每次调用完成后记录 prompt_tokens 与 completion_tokens 到 usage_log。
 */
@Primary
@Service
public class RoutingLlmGateway implements LlmGateway {

    public static final ZoneId SHANGHAI_ZONE = ZoneId.of("Asia/Shanghai");
    private static final int DEFAULT_DAILY_TOKEN_LIMIT = 100000;

    // 系统环境变量模型虚拟 ID（负数与数据库自增主键物理隔离）
    public static final long ENV_MODEL_DEEPSEEK_ID = -1L;
    public static final long ENV_MODEL_OPENAI_ID = -2L;
    public static final long ENV_MODEL_VISION_ID = -3L;
    public static final long ENV_MODEL_EMBEDDING_ID = -4L;

    private final JdbcTemplate jdbcTemplate;
    private final MockLlmGateway mockLlmGateway;
    private final AesGcmCrypto aesGcmCrypto;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    private volatile boolean forceMock;

    public RoutingLlmGateway(
            JdbcTemplate jdbcTemplate,
            MockLlmGateway mockLlmGateway,
            AesGcmCrypto aesGcmCrypto,
            ObjectMapper objectMapper,
            @Value("${oneterm.mock:false}") boolean forceMock
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.mockLlmGateway = mockLlmGateway;
        this.aesGcmCrypto = aesGcmCrypto;
        this.objectMapper = objectMapper;
        this.forceMock = forceMock;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .build();
    }

    public void setForceMock(boolean forceMock) {
        this.forceMock = forceMock;
    }

    public boolean isForceMock() {
        return forceMock;
    }

    @Override
    public boolean isMockMode() {
        if (forceMock) {
            return true;
        }
        return findActiveConfigForRole(LlmRole.chat, null).isEmpty();
    }

    @Override
    public boolean hasActiveEmbeddingModel() {
        if (forceMock) {
            return mockLlmGateway.hasActiveEmbeddingModel();
        }
        if (findActiveConfigForRole(LlmRole.embedding, null).isPresent()) {
            return true;
        }
        if (isMockMode()) {
            return mockLlmGateway.hasActiveEmbeddingModel();
        }
        return false;
    }

    @Override
    public ChatResult chat(long userId, String kind, List<ChatMessage> messages) {
        checkQuota(userId);
        String normalizedKind = normalizeKind(kind, "chat");

        if (!forceMock) {
            Optional<LlmConfigRecord> configOpt = resolveChatConfig(userId);
            if (configOpt.isPresent()) {
                ChatResult result = executeRealChat(configOpt.get(), messages);
                recordUsage(userId, normalizedKind, result.usage());
                return result;
            }
        }

        ChatResult mockResult = mockLlmGateway.chat(userId, normalizedKind, messages);
        recordUsage(userId, normalizedKind, mockResult.usage());
        return mockResult;
    }

    @Override
    public void streamChat(long userId, String kind, List<ChatMessage> messages, LlmStreamListener listener) {
        checkQuota(userId);
        String normalizedKind = normalizeKind(kind, "chat");

        LlmStreamListener usageRecordingListener = new LlmStreamListener() {
            @Override
            public void onProgress(String step, int current, int total, String message) {
                listener.onProgress(step, current, total, message);
            }

            @Override
            public void onDelta(String deltaText) {
                listener.onDelta(deltaText);
            }

            @Override
            public void onComplete(ChatResult result) {
                recordUsage(userId, normalizedKind, result.usage());
                listener.onComplete(result);
            }

            @Override
            public void onError(Throwable error) {
                listener.onError(error);
            }
        };

        if (!forceMock) {
            Optional<LlmConfigRecord> configOpt = resolveChatConfig(userId);
            if (configOpt.isPresent()) {
                executeRealStreamChat(configOpt.get(), normalizedKind, messages, usageRecordingListener);
                return;
            }
        }

        mockLlmGateway.streamChat(userId, normalizedKind, messages, usageRecordingListener);
    }

    @Override
    public ChatResult extractTextFromImage(long userId, byte[] imageBytes, String mimeType, String prompt) {
        checkQuota(userId);

        if (!forceMock) {
            Optional<LlmConfigRecord> configOpt = findActiveConfigForRole(LlmRole.vision, null);
            if (configOpt.isPresent()) {
                ChatResult result = executeRealVision(configOpt.get(), imageBytes, mimeType, prompt);
                recordUsage(userId, "vision", result.usage());
                return result;
            }
        }

        ChatResult mockResult = mockLlmGateway.extractTextFromImage(userId, imageBytes, mimeType, prompt);
        recordUsage(userId, "vision", mockResult.usage());
        return mockResult;
    }

    @Override
    public float[] embed(long userId, String text) {
        checkQuota(userId);

        if (!forceMock) {
            Optional<LlmConfigRecord> configOpt = findActiveConfigForRole(LlmRole.embedding, null);
            if (configOpt.isPresent()) {
                EmbeddingCallResult result = executeRealEmbedding(configOpt.get(), text);
                recordUsage(userId, "embedding", result.usage());
                return result.vector();
            }
        }

        float[] vec = mockLlmGateway.embed(userId, text);
        TokenUsage usage = new TokenUsage(TokenUsage.estimateCount(text), 0);
        recordUsage(userId, "embedding", usage);
        return vec;
    }

    /**
     * 统计用户今日（Asia/Shanghai 0 点起）已使用的总 Token 数。
     */
    public int getTodayTokensUsed(long userId) {
        String todayDate = LocalDate.now(SHANGHAI_ZONE).toString();
        Integer sum = jdbcTemplate.queryForObject(
                "SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0) FROM usage_log WHERE user_id = ? AND substr(created_at, 1, 10) = ?",
                Integer.class,
                userId,
                todayDate
        );
        return sum != null ? sum : 0;
    }

    /**
     * 校验用户今日 Token 额度，若已达到或超过 daily_token_limit 则抛出 429 QUOTA_EXCEEDED。
     */
    public void checkQuota(long userId) {
        if (userId <= 0) {
            return;
        }
        List<Integer> limits = jdbcTemplate.query(
                "SELECT daily_token_limit FROM users WHERE id = ?",
                (rs, rowNum) -> rs.getInt("daily_token_limit"),
                userId
        );
        int dailyLimit = limits.isEmpty() ? DEFAULT_DAILY_TOKEN_LIMIT : limits.get(0);
        int todayUsed = getTodayTokensUsed(userId);
        if (todayUsed >= dailyLimit) {
            throw new BusinessException(ErrorCode.QUOTA_EXCEEDED);
        }
    }

    /**
     * 记录单次大模型调用消耗的 Token。
     */
    public void recordUsage(long userId, String kind, TokenUsage usage) {
        if (userId <= 0) {
            return;
        }
        int promptTokens = usage != null ? Math.max(0, usage.promptTokens()) : 0;
        int completionTokens = usage != null ? Math.max(0, usage.completionTokens()) : 0;
        String nowIso = OffsetDateTime.now(SHANGHAI_ZONE)
                .truncatedTo(ChronoUnit.SECONDS)
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        jdbcTemplate.update(
                "INSERT INTO usage_log (user_id, kind, prompt_tokens, completion_tokens, created_at) VALUES (?, ?, ?, ?, ?)",
                userId,
                normalizeKind(kind, "chat"),
                promptTokens,
                completionTokens,
                nowIso
        );
    }

    private Optional<LlmConfigRecord> resolveChatConfig(long userId) {
        Long preferredModelId = null;
        if (userId > 0) {
            List<Long> prefs = jdbcTemplate.query(
                    "SELECT preferred_model_id FROM users WHERE id = ?",
                    (rs, rowNum) -> {
                        long v = rs.getLong("preferred_model_id");
                        return rs.wasNull() ? null : v;
                    },
                    userId
            );
            if (!prefs.isEmpty()) {
                preferredModelId = prefs.get(0);
            }
        }
        return findActiveConfigForRole(LlmRole.chat, preferredModelId);
    }

    private Optional<LlmConfigRecord> findActiveConfigForRole(LlmRole role, Long preferredId) {
        if (preferredId != null) {
            // 优先检查是否为系统环境变量虚拟模型 ID
            if (preferredId == ENV_MODEL_DEEPSEEK_ID) {
                Optional<LlmConfigRecord> envCfg = getDeepSeekEnvConfig();
                if (envCfg.isPresent()) {
                    return envCfg;
                }
            } else if (preferredId == ENV_MODEL_OPENAI_ID) {
                Optional<LlmConfigRecord> envCfg = getOpenAiEnvConfig();
                if (envCfg.isPresent()) {
                    return envCfg;
                }
            } else if (preferredId == ENV_MODEL_VISION_ID) {
                Optional<LlmConfigRecord> envCfg = getVisionEnvConfig();
                if (envCfg.isPresent()) {
                    return envCfg;
                }
            } else if (preferredId == ENV_MODEL_EMBEDDING_ID) {
                Optional<LlmConfigRecord> envCfg = getEmbeddingEnvConfig();
                if (envCfg.isPresent()) {
                    return envCfg;
                }
            } else if (preferredId > 0) {
                List<LlmConfigRecord> preferred = jdbcTemplate.query(
                        "SELECT id, role, name, base_url, model, api_key_encrypted FROM llm_config WHERE id = ? AND role = ? AND enabled = 1",
                        (rs, rowNum) -> new LlmConfigRecord(
                                rs.getLong("id"),
                                rs.getString("role"),
                                rs.getString("name"),
                                rs.getString("base_url"),
                                rs.getString("model"),
                                rs.getString("api_key_encrypted"),
                                false
                        ),
                        preferredId,
                        role.name()
                );
                if (!preferred.isEmpty()) {
                    return Optional.of(preferred.get(0));
                }
            }
        }

        // 默认优先：查找数据库中已启用的模型配置
        List<LlmConfigRecord> configs = jdbcTemplate.query(
                "SELECT id, role, name, base_url, model, api_key_encrypted FROM llm_config WHERE role = ? AND enabled = 1 ORDER BY id ASC LIMIT 1",
                (rs, rowNum) -> new LlmConfigRecord(
                        rs.getLong("id"),
                        rs.getString("role"),
                        rs.getString("name"),
                        rs.getString("base_url"),
                        rs.getString("model"),
                        rs.getString("api_key_encrypted"),
                        false
                ),
                role.name()
        );
        if (!configs.isEmpty()) {
            return Optional.of(configs.get(0));
        }

        // 数据库无启用配置时：自动回退并调用系统环境变量（双支持模式）
        return findEnvConfigForRole(role);
    }

    public Optional<LlmConfigRecord> findEnvConfigForRole(LlmRole role) {
        if (role == LlmRole.chat) {
            Optional<LlmConfigRecord> ds = getDeepSeekEnvConfig();
            if (ds.isPresent()) {
                return ds;
            }
            return getOpenAiEnvConfig();
        }
        if (role == LlmRole.vision) {
            return getVisionEnvConfig();
        }
        if (role == LlmRole.embedding) {
            return getEmbeddingEnvConfig();
        }
        return Optional.empty();
    }

    public Optional<LlmConfigRecord> getDeepSeekEnvConfig() {
        Optional<LlmConfigRecord> dbOverride = findDbConfigById(ENV_MODEL_DEEPSEEK_ID);
        if (dbOverride != null) {
            return dbOverride;
        }
        String key = getEnv("DEEPSEEK_API", "DEEPSEEK_API_KEY");
        if (key == null || key.isBlank()) {
            return Optional.empty();
        }
        String baseUrl = getEnvOrDefault("https://api.deepseek.com", "DEEPSEEK_BASE_URL");
        String model = getEnvOrDefault("deepseek-chat", "DEEPSEEK_MODEL");
        return Optional.of(new LlmConfigRecord(
                ENV_MODEL_DEEPSEEK_ID,
                "chat",
                "DeepSeek (系统环境变量)",
                baseUrl,
                model,
                key.trim(),
                true
        ));
    }

    public Optional<LlmConfigRecord> getOpenAiEnvConfig() {
        Optional<LlmConfigRecord> dbOverride = findDbConfigById(ENV_MODEL_OPENAI_ID);
        if (dbOverride != null) {
            return dbOverride;
        }
        String key = getEnv("OPENAI_API", "OPENAI_API_KEY");
        if (key == null || key.isBlank()) {
            return Optional.empty();
        }
        String baseUrl = getEnvOrDefault("https://api.openai.com/v1", "OPENAI_BASE_URL");
        String model = getEnvOrDefault("gpt-4o-mini", "OPENAI_MODEL");
        return Optional.of(new LlmConfigRecord(
                ENV_MODEL_OPENAI_ID,
                "chat",
                "OpenAI (系统环境变量)",
                baseUrl,
                model,
                key.trim(),
                true
        ));
    }

    public Optional<LlmConfigRecord> getVisionEnvConfig() {
        Optional<LlmConfigRecord> dbOverride = findDbConfigById(ENV_MODEL_VISION_ID);
        if (dbOverride != null) {
            return dbOverride;
        }
        String key = getEnv("VISION_API", "VISION_API_KEY", "OPENAI_API_KEY");
        if (key == null || key.isBlank()) {
            return Optional.empty();
        }
        String baseUrl = getEnvOrDefault("https://api.openai.com/v1", "VISION_BASE_URL", "OPENAI_BASE_URL");
        String model = getEnvOrDefault("gpt-4o-mini", "VISION_MODEL", "OPENAI_MODEL");
        return Optional.of(new LlmConfigRecord(
                ENV_MODEL_VISION_ID,
                "vision",
                "Vision (系统环境变量)",
                baseUrl,
                model,
                key.trim(),
                true
        ));
    }

    public Optional<LlmConfigRecord> getEmbeddingEnvConfig() {
        Optional<LlmConfigRecord> dbOverride = findDbConfigById(ENV_MODEL_EMBEDDING_ID);
        if (dbOverride != null) {
            return dbOverride;
        }
        String key = getEnv("EMBEDDING_API", "EMBEDDING_API_KEY", "OPENAI_API_KEY");
        if (key == null || key.isBlank()) {
            return Optional.empty();
        }
        String baseUrl = getEnvOrDefault("https://api.openai.com/v1", "EMBEDDING_BASE_URL", "OPENAI_BASE_URL");
        String model = getEnvOrDefault("text-embedding-3-small", "EMBEDDING_MODEL");
        return Optional.of(new LlmConfigRecord(
                ENV_MODEL_EMBEDDING_ID,
                "embedding",
                "Embedding (系统环境变量)",
                baseUrl,
                model,
                key.trim(),
                true
        ));
    }

    private Optional<LlmConfigRecord> findDbConfigById(long id) {
        List<LlmConfigRecord> rows = jdbcTemplate.query(
                "SELECT id, role, name, base_url, model, api_key_encrypted, enabled FROM llm_config WHERE id = ?",
                (rs, rowNum) -> {
                    boolean enabled = rs.getInt("enabled") == 1;
                    if (!enabled) return null;
                    return new LlmConfigRecord(
                            rs.getLong("id"),
                            rs.getString("role"),
                            rs.getString("name"),
                            rs.getString("base_url"),
                            rs.getString("model"),
                            rs.getString("api_key_encrypted"),
                            false
                    );
                },
                id
        );
        if (rows.isEmpty()) {
            return null; // 未在数据库中自定义，回退到系统环境变量
        }
        LlmConfigRecord rec = rows.get(0);
        return rec != null ? Optional.of(rec) : Optional.empty();
    }

    public String getRawEnvKeyForVirtualId(long id) {
        if (id == ENV_MODEL_DEEPSEEK_ID) {
            return getEnv("DEEPSEEK_API", "DEEPSEEK_API_KEY");
        }
        if (id == ENV_MODEL_OPENAI_ID) {
            return getEnv("OPENAI_API", "OPENAI_API_KEY");
        }
        if (id == ENV_MODEL_VISION_ID) {
            return getEnv("VISION_API", "VISION_API_KEY", "OPENAI_API_KEY");
        }
        if (id == ENV_MODEL_EMBEDDING_ID) {
            return getEnv("EMBEDDING_API", "EMBEDDING_API_KEY", "OPENAI_API_KEY");
        }
        return null;
    }

    public static String getEnv(String... names) {
        for (String name : names) {
            String val = System.getenv(name);
            if (val != null && !val.isBlank()) {
                return val.trim();
            }
            String prop = System.getProperty(name);
            if (prop != null && !prop.isBlank()) {
                return prop.trim();
            }
        }
        return null;
    }

    public static String getEnvOrDefault(String defaultValue, String... names) {
        String v = getEnv(names);
        return (v != null && !v.isBlank()) ? v : defaultValue;
    }

    private ChatResult executeRealChat(LlmConfigRecord config, List<ChatMessage> messages) {
        String apiKey = config.resolveApiKey(aesGcmCrypto);
        String endpoint = buildEndpointUrl(config.baseUrl(), "/chat/completions");
        String promptText = concatMessages(messages);

        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("model", config.model());
            payload.put("messages", messages.stream()
                    .map(m -> Map.of("role", m.role(), "content", m.content()))
                    .toList());
            payload.put("stream", false);

            String requestBody = objectMapper.writeValueAsString(payload);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint))
                    .timeout(Duration.ofSeconds(60))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new BusinessException(ErrorCode.LLM_UPSTREAM_ERROR, "上游大模型调用失败 (HTTP " + response.statusCode() + ")");
            }

            JsonNode root = objectMapper.readTree(response.body());
            String content = root.path("choices").path(0).path("message").path("content").asText("");
            TokenUsage usage = parseUsageOrEstimate(root.path("usage"), promptText, content);
            return new ChatResult(content, usage, config.model(), false);
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BusinessException(ErrorCode.LLM_UPSTREAM_ERROR, "上游大模型服务调用异常: " + ex.getMessage());
        }
    }

    private void executeRealStreamChat(
            LlmConfigRecord config,
            String kind,
            List<ChatMessage> messages,
            LlmStreamListener listener
    ) {
        String apiKey = config.resolveApiKey(aesGcmCrypto);
        String endpoint = buildEndpointUrl(config.baseUrl(), "/chat/completions");
        String promptText = concatMessages(messages);

        try {
            if ("extract".equals(kind)) {
                listener.onProgress("extracting", 1, 2, "正在请求大模型抽取结构化事件");
            } else if ("qa".equals(kind)) {
                listener.onProgress("generating", 1, 2, "正在结合教务原文生成回答");
            } else if ("visualize".equals(kind)) {
                listener.onProgress("generating", 1, 2, "正在生成知识点交互式可视化代码");
            }

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("model", config.model());
            payload.put("messages", messages.stream()
                    .map(m -> Map.of("role", m.role(), "content", m.content()))
                    .toList());
            payload.put("stream", true);

            String requestBody = objectMapper.writeValueAsString(payload);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint))
                    .timeout(Duration.ofSeconds(90))
                    .header("Content-Type", "application/json")
                    .header("Accept", "text/event-stream")
                    .header("Authorization", "Bearer " + apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new BusinessException(ErrorCode.LLM_UPSTREAM_ERROR, "上游流式大模型调用失败 (HTTP " + response.statusCode() + ")");
            }

            StringBuilder fullContent = new StringBuilder();
            TokenUsage streamUsage = null;

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    String trimmed = line.trim();
                    if (!trimmed.startsWith("data:")) {
                        continue;
                    }
                    String dataPart = trimmed.substring(5).trim();
                    if ("[DONE]".equals(dataPart) || dataPart.isEmpty()) {
                        break;
                    }
                    JsonNode chunk = objectMapper.readTree(dataPart);
                    JsonNode deltaNode = chunk.path("choices").path(0).path("delta").path("content");
                    if (!deltaNode.isMissingNode() && !deltaNode.isNull()) {
                        String deltaText = deltaNode.asText();
                        if (!deltaText.isEmpty()) {
                            fullContent.append(deltaText);
                            listener.onDelta(deltaText);
                        }
                    }
                    JsonNode usageNode = chunk.path("usage");
                    if (usageNode.isObject() && usageNode.has("prompt_tokens")) {
                        streamUsage = new TokenUsage(
                                usageNode.path("prompt_tokens").asInt(0),
                                usageNode.path("completion_tokens").asInt(0)
                        );
                    }
                }
            }

            String finalStr = fullContent.toString();
            TokenUsage finalUsage = streamUsage != null
                    ? streamUsage
                    : TokenUsage.estimate(promptText, finalStr);
            listener.onComplete(new ChatResult(finalStr, finalUsage, config.model(), false));
        } catch (Exception ex) {
            listener.onError(ex);
        }
    }

    private ChatResult executeRealVision(LlmConfigRecord config, byte[] imageBytes, String mimeType, String prompt) {
        String apiKey = config.resolveApiKey(aesGcmCrypto);
        String endpoint = buildEndpointUrl(config.baseUrl(), "/chat/completions");
        String effectiveMime = (mimeType == null || mimeType.isBlank()) ? "image/png" : mimeType;
        String effectivePrompt = (prompt == null || prompt.isBlank())
                ? "请完整准确地识别并输出图片中的所有教务通知、课程表与考试文字内容。"
                : prompt;

        try {
            String base64DataUrl = "data:" + effectiveMime + ";base64," + Base64.getEncoder().encodeToString(imageBytes);
            List<Map<String, Object>> contentList = List.of(
                    Map.of("type", "text", "text", effectivePrompt),
                    Map.of("type", "image_url", "image_url", Map.of("url", base64DataUrl))
            );
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("model", config.model());
            payload.put("messages", List.of(Map.of("role", "user", "content", contentList)));
            payload.put("stream", false);

            String requestBody = objectMapper.writeValueAsString(payload);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint))
                    .timeout(Duration.ofSeconds(60))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new BusinessException(ErrorCode.LLM_UPSTREAM_ERROR, "识图模型服务调用失败 (HTTP " + response.statusCode() + ")");
            }

            JsonNode root = objectMapper.readTree(response.body());
            String content = root.path("choices").path(0).path("message").path("content").asText("");
            TokenUsage usage = parseUsageOrEstimate(root.path("usage"), effectivePrompt + " [image]", content);
            return new ChatResult(content, usage, config.model(), false);
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BusinessException(ErrorCode.LLM_UPSTREAM_ERROR, "识图模型服务调用异常: " + ex.getMessage());
        }
    }

    private EmbeddingCallResult executeRealEmbedding(LlmConfigRecord config, String text) {
        String apiKey = config.resolveApiKey(aesGcmCrypto);
        String endpoint = buildEndpointUrl(config.baseUrl(), "/embeddings");
        String safeText = text == null ? "" : text;

        try {
            Map<String, Object> payload = Map.of(
                    "model", config.model(),
                    "input", safeText
            );
            String requestBody = objectMapper.writeValueAsString(payload);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new BusinessException(ErrorCode.LLM_UPSTREAM_ERROR, "向量模型服务调用失败 (HTTP " + response.statusCode() + ")");
            }

            JsonNode root = objectMapper.readTree(response.body());
            JsonNode embNode = root.path("data").path(0).path("embedding");
            if (!embNode.isArray() || embNode.isEmpty()) {
                throw new BusinessException(ErrorCode.LLM_UPSTREAM_ERROR, "向量模型返回结果为空");
            }
            float[] vec = new float[embNode.size()];
            for (int i = 0; i < embNode.size(); i++) {
                vec[i] = (float) embNode.get(i).asDouble();
            }

            JsonNode usageNode = root.path("usage");
            int promptTokens = usageNode.isObject() && usageNode.has("prompt_tokens")
                    ? usageNode.path("prompt_tokens").asInt(TokenUsage.estimateCount(safeText))
                    : TokenUsage.estimateCount(safeText);
            return new EmbeddingCallResult(vec, new TokenUsage(promptTokens, 0));
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BusinessException(ErrorCode.LLM_UPSTREAM_ERROR, "向量模型服务调用异常: " + ex.getMessage());
        }
    }

    private TokenUsage parseUsageOrEstimate(JsonNode usageNode, String promptText, String completionText) {
        if (usageNode != null && usageNode.isObject()
                && (usageNode.has("prompt_tokens") || usageNode.has("completion_tokens"))) {
            int p = usageNode.path("prompt_tokens").asInt(TokenUsage.estimateCount(promptText));
            int c = usageNode.path("completion_tokens").asInt(TokenUsage.estimateCount(completionText));
            return new TokenUsage(p, c);
        }
        return TokenUsage.estimate(promptText, completionText);
    }

    static String buildEndpointUrl(String rawBaseUrl, String subPath) {
        String base = rawBaseUrl == null ? "" : rawBaseUrl.trim();
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        if (base.endsWith("/chat/completions") || base.endsWith("/embeddings")) {
            return base;
        }
        if (base.endsWith("/v1")) {
            return base + subPath;
        }
        return base + "/v1" + subPath;
    }

    public record EnvModelInfo(
            long id,
            String role,
            String name,
            String baseUrl,
            String model,
            String apiKeyMasked
    ) {}

    public List<EnvModelInfo> getEnvChatModels() {
        List<EnvModelInfo> list = new ArrayList<>();
        getDeepSeekEnvConfig().ifPresent(cfg ->
                list.add(new EnvModelInfo(
                        cfg.id(),
                        cfg.role(),
                        cfg.name(),
                        cfg.baseUrl(),
                        cfg.model(),
                        AesGcmCrypto.maskApiKey(cfg.apiKeyEncrypted())
                ))
        );
        getOpenAiEnvConfig().ifPresent(cfg ->
                list.add(new EnvModelInfo(
                        cfg.id(),
                        cfg.role(),
                        cfg.name(),
                        cfg.baseUrl(),
                        cfg.model(),
                        AesGcmCrypto.maskApiKey(cfg.apiKeyEncrypted())
                ))
        );
        return list;
    }

    public List<EnvModelInfo> getAllEnvModels() {
        List<EnvModelInfo> list = new ArrayList<>(getEnvChatModels());
        getVisionEnvConfig().ifPresent(cfg ->
                list.add(new EnvModelInfo(
                        cfg.id(),
                        cfg.role(),
                        cfg.name(),
                        cfg.baseUrl(),
                        cfg.model(),
                        AesGcmCrypto.maskApiKey(cfg.apiKeyEncrypted())
                ))
        );
        getEmbeddingEnvConfig().ifPresent(cfg ->
                list.add(new EnvModelInfo(
                        cfg.id(),
                        cfg.role(),
                        cfg.name(),
                        cfg.baseUrl(),
                        cfg.model(),
                        AesGcmCrypto.maskApiKey(cfg.apiKeyEncrypted())
                ))
        );
        return list;
    }

    private String concatMessages(List<ChatMessage> messages) {
        if (messages == null || messages.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (ChatMessage msg : messages) {
            sb.append(msg.role()).append(": ").append(msg.content()).append('\n');
        }
        return sb.toString();
    }

    private String normalizeKind(String kind, String fallback) {
        if (kind == null || kind.isBlank()) {
            return fallback;
        }
        return kind.trim().toLowerCase(Locale.ROOT);
    }

    public record LlmConfigRecord(
            long id,
            String role,
            String name,
            String baseUrl,
            String model,
            String apiKeyEncrypted,
            boolean fromEnv
    ) {
        public String resolveApiKey(AesGcmCrypto crypto) {
            if (fromEnv) {
                return apiKeyEncrypted;
            }
            return crypto.decrypt(apiKeyEncrypted);
        }
    }

    private record EmbeddingCallResult(float[] vector, TokenUsage usage) {
    }
}
