package com.oneterm.admin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.oneterm.auth.AdminInitializer;
import com.oneterm.common.BusinessException;
import com.oneterm.common.ErrorCode;
import com.oneterm.llm.AesGcmCrypto;
import com.oneterm.llm.ChatMessage;
import com.oneterm.llm.ChatResult;
import com.oneterm.llm.LlmGateway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-auth-admin.db")
@AutoConfigureMockMvc
class AdminAndQuotaGatewayTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private AesGcmCrypto aesGcmCrypto;

    @Autowired
    private LlmGateway llmGateway;

    @Autowired
    private AdminInitializer adminInitializer;

    @Autowired
    private ObjectMapper objectMapper;

    private MockHttpSession adminSession;

    @BeforeEach
    void setUp() throws Exception {
        adminInitializer.ensureAdminExists();
        jdbcTemplate.update("UPDATE users SET failed_count = 0, locked_until = NULL, enabled = 1 WHERE username = 'admin'");

        MvcResult loginResult = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "username", "admin",
                                "password", "AdminTest@123"
                        ))))
                .andExpect(status().isOk())
                .andReturn();
        adminSession = (MockHttpSession) loginResult.getRequest().getSession(false);
        assertNotNull(adminSession);
    }

    @Test
    void aesGcmEncryptionDecryptionAndMaskingWorkCorrectly() {
        String rawApiKey = "sk-deepseek-prod-secret-99888f2a";
        String encrypted1 = aesGcmCrypto.encrypt(rawApiKey);
        String encrypted2 = aesGcmCrypto.encrypt(rawApiKey);

        assertNotEquals(rawApiKey, encrypted1);
        assertNotEquals(encrypted1, encrypted2, "Random 12-byte IV must produce distinct ciphertexts");
        assertEquals(rawApiKey, aesGcmCrypto.decrypt(encrypted1));
        assertEquals(rawApiKey, aesGcmCrypto.decrypt(encrypted2));

        String masked = aesGcmCrypto.maskEncryptedApiKey(encrypted1);
        assertEquals("****8f2a", masked);
        assertFalse(masked.contains("secret"));
    }

    @Test
    void adminLlmConfigCrudEncryptsApiKeyAndNeverReturnsFullKey() throws Exception {
        jdbcTemplate.update("DELETE FROM llm_config");

        String createBody = objectMapper.writeValueAsString(Map.of(
                "role", "chat",
                "name", "DeepSeek 对话主力模型",
                "baseUrl", "https://api.deepseek.com",
                "model", "deepseek-chat",
                "apiKey", "sk-live-secret-key-8f2a",
                "enabled", true
        ));

        MvcResult createRes = mockMvc.perform(post("/api/admin/llm-configs")
                        .session(adminSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("DeepSeek 对话主力模型"))
                .andExpect(jsonPath("$.apiKeyMasked").value("****8f2a"))
                .andReturn();

        String responseBody = createRes.getResponse().getContentAsString();
        assertFalse(responseBody.contains("sk-live-secret-key-8f2a"), "Full API Key must never appear in response");

        long configId = objectMapper.readTree(responseBody).get("id").asLong();

        // 验证数据库中保存的是 AES-256-GCM 密文而非明文
        String storedCipher = jdbcTemplate.queryForObject(
                "SELECT api_key_encrypted FROM llm_config WHERE id = ?",
                String.class,
                configId
        );
        assertNotNull(storedCipher);
        assertNotEquals("sk-live-secret-key-8f2a", storedCipher);
        assertEquals("sk-live-secret-key-8f2a", aesGcmCrypto.decrypt(storedCipher));

        // 用户可选模型列表只暴露 id/role/name/model，不暴露 baseUrl 和 apiKey
        mockMvc.perform(get("/api/auth/models").session(adminSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(configId))
                .andExpect(jsonPath("$[0].name").value("DeepSeek 对话主力模型"))
                .andExpect(jsonPath("$[0].apiKeyMasked").doesNotExist());

        // 用户切换偏好对话模型
        mockMvc.perform(put("/api/auth/preferred-model")
                        .session(adminSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("modelId", configId))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.preferredModelId").value(configId));

        // 更新模型配置但 apiKey 留空，应保留原加密 Key
        String updateBody = objectMapper.writeValueAsString(Map.of(
                "role", "chat",
                "name", "DeepSeek V3",
                "baseUrl", "https://api.deepseek.com/v1",
                "model", "deepseek-chat",
                "apiKey", "",
                "enabled", true
        ));
        mockMvc.perform(put("/api/admin/llm-configs/" + configId)
                        .session(adminSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("DeepSeek V3"))
                .andExpect(jsonPath("$.apiKeyMasked").value("****8f2a"));

        // 删除配置
        mockMvc.perform(delete("/api/admin/llm-configs/" + configId).session(adminSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void adminUserManagementAndDailyTokenQuotaExceededThrows429() throws Exception {
        jdbcTemplate.update("DELETE FROM users WHERE username = 'quota_student'");

        String createUserJson = objectMapper.writeValueAsString(Map.of(
                "username", "quota_student",
                "password", "QuotaPass@123",
                "role", "USER",
                "dailyTokenLimit", 20
        ));

        MvcResult createdRes = mockMvc.perform(post("/api/admin/users")
                        .session(adminSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createUserJson))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.username").value("quota_student"))
                .andExpect(jsonPath("$.dailyTokenLimit").value(20))
                .andReturn();

        JsonNode createdNode = objectMapper.readTree(createdRes.getResponse().getContentAsString());
        long userId = createdNode.get("id").asLong();

        // 重名创建返回 409 CONFLICT
        mockMvc.perform(post("/api/admin/users")
                        .session(adminSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createUserJson))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));

        // 首次调用大模型网关（未超限），成功返回并写入 usage_log
        ChatResult firstCall = llmGateway.chat(userId, "qa", List.of(ChatMessage.user("周三有空吗？")));
        assertNotNull(firstCall);
        assertTrue(firstCall.usage().totalTokens() >= 20, "First call should consume at least 20 tokens");

        // 第二次调用因今日累计消耗已达上限 20，抛出 429 QUOTA_EXCEEDED
        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> llmGateway.chat(userId, "qa", List.of(ChatMessage.user("期末哪几门最紧？")))
        );
        assertEquals(ErrorCode.QUOTA_EXCEEDED, ex.getErrorCode());
        assertEquals(429, ex.getErrorCode().getStatus().value());

        // 管理员在后台上调该用户每日额度至 100000 后，立即可恢复调用
        mockMvc.perform(put("/api/admin/users/" + userId)
                        .session(adminSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("dailyTokenLimit", 100000))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dailyTokenLimit").value(100000));

        ChatResult secondCall = llmGateway.chat(userId, "qa", List.of(ChatMessage.user("期末哪几门最紧？")));
        assertNotNull(secondCall);

        // 管理员查询 usage-logs 可见该用户的调用记录
        mockMvc.perform(get("/api/admin/usage-logs")
                        .param("userId", String.valueOf(userId))
                        .session(adminSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].userId").value(userId))
                .andExpect(jsonPath("$[0].kind").value("qa"));
    }
}
