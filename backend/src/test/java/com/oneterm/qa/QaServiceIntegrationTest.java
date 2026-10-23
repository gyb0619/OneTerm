package com.oneterm.qa;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.oneterm.common.BusinessException;
import com.oneterm.common.CurrentUser;
import com.oneterm.common.ErrorCode;
import org.springframework.web.context.WebApplicationContext;
import com.oneterm.llm.MockLlmGateway;
import com.oneterm.qa.core.Retriever;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * QA 模块集成测试：覆盖切片索引构建、向量与 BM25 降级检索、流式问答引用返回及多租户 user_id 数据隔离。
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-qa.db")
class QaServiceIntegrationTest {

    private static final long USER_A_ID = 9001L;
    private static final long USER_B_ID = 9002L;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private WebApplicationContext webApplicationContext;

    @Autowired
    private QaController qaController;

    @Autowired
    private QaService qaService;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired(required = false)
    private MockLlmGateway mockLlmGateway;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        this.mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext)
                .defaultResponseCharacterEncoding(StandardCharsets.UTF_8)
                .build();

        if (mockLlmGateway != null) {
            mockLlmGateway.setEmbeddingEnabled(true);
        }

        jdbcTemplate.update("DELETE FROM qa_history WHERE user_id IN (?, ?)", USER_A_ID, USER_B_ID);
        jdbcTemplate.update("DELETE FROM chunks WHERE user_id IN (?, ?)", USER_A_ID, USER_B_ID);
        jdbcTemplate.update("DELETE FROM events WHERE user_id IN (?, ?)", USER_A_ID, USER_B_ID);
        jdbcTemplate.update("DELETE FROM users WHERE id IN (?, ?)", USER_A_ID, USER_B_ID);

        jdbcTemplate.update(
                "INSERT INTO users (id, username, password_hash, role, enabled, daily_token_limit) VALUES (?, ?, ?, 'USER', 1, 100000)",
                USER_A_ID, "qa_test_user_a", "$2a$10$dummyhashA"
        );
        jdbcTemplate.update(
                "INSERT INTO users (id, username, password_hash, role, enabled, daily_token_limit) VALUES (?, ?, ?, 'USER', 1, 100000)",
                USER_B_ID, "qa_test_user_b", "$2a$10$dummyhashB"
        );

        seedUserAEvents();
        seedUserBEvents();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        if (mockLlmGateway != null) {
            mockLlmGateway.setEmbeddingEnabled(true);
        }
    }

    @Test
    void shouldRejectUnauthenticatedAccessWith401() {
        SecurityContextHolder.clearContext();
        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> qaController.rebuildIndex()
        );
        assertEquals(ErrorCode.UNAUTHORIZED, ex.getErrorCode());
    }

    @Test
    void shouldIndexEventsWithFloat32BlobAndStreamAnswerWithCitations() throws Exception {
        authenticateAs(USER_A_ID, "qa_test_user_a");

        // 1. 调用 POST /api/qa/index 构建切片与 float32 向量索引
        MvcResult indexResult = mockMvc.perform(post("/api/qa/index")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode indexJson = objectMapper.readTree(indexResult.getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertEquals(6, indexJson.get("chunkCount").asInt());
        assertEquals(Retriever.MODE_EMBEDDING, indexJson.get("mode").asText());

        // 验证 SQLite chunks 表中已写入非空 float32 BLOB
        Integer nonNullBlobs = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM chunks WHERE user_id = ? AND embedding IS NOT NULL AND length(embedding) > 0",
                Integer.class,
                USER_A_ID
        );
        assertEquals(6, nonNullBlobs);

        // 2. 提问「下周三有空吗？」并验证 SSE 流式输出与 Top-4 引用
        MvcResult askWedResult = mockMvc.perform(post("/api/qa/ask/stream")
                        .characterEncoding(StandardCharsets.UTF_8)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"question\":\"下周三有空吗？\"}"))
                .andExpect(status().isOk())
                .andReturn();

        String sseBodyWed = askWedResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertTrue(sseBodyWed.contains("event:progress") || sseBodyWed.contains("event: progress"));
        assertTrue(sseBodyWed.contains("event:delta") || sseBodyWed.contains("event: delta"));
        assertTrue(sseBodyWed.contains("event:done") || sseBodyWed.contains("event: done"));

        JsonNode doneWed = extractDoneEventData(sseBodyWed);
        assertNotNull(doneWed);
        JsonNode resultWed = doneWed.get("result");
        assertEquals(Retriever.MODE_EMBEDDING, resultWed.get("retrievalMode").asText());
        assertTrue(resultWed.get("answer").asText().contains("2026-11-04") && resultWed.get("answer").asText().contains("周三"));

        JsonNode citationsWed = resultWed.get("citations");
        assertNotNull(citationsWed);
        assertEquals(4, citationsWed.size());
        assertTrue(citationsWed.get(0).get("eventId").asLong() > 0);
        assertFalse(citationsWed.get(0).get("eventTitle").asText().isBlank());

        // 3. 提问「期末前哪几门最紧？」验证能够检索出考试与作业截止引用
        MvcResult askTightResult = mockMvc.perform(post("/api/qa/ask/stream")
                        .characterEncoding(StandardCharsets.UTF_8)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"question\":\"期末前哪几门最紧？\"}"))
                .andExpect(status().isOk())
                .andReturn();

        String sseBodyTight = askTightResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode doneTight = extractDoneEventData(sseBodyTight);
        assertNotNull(doneTight);
        JsonNode resultTight = doneTight.get("result");
        assertTrue(resultTight.get("answer").asText().contains("计算机网络"));
        JsonNode citationsTight = resultTight.get("citations");
        assertEquals(4, citationsTight.size());

        List<String> citedTitles = new ArrayList<>();
        for (JsonNode c : citationsTight) {
            citedTitles.add(c.get("eventTitle").asText());
        }
        assertTrue(citedTitles.stream().anyMatch(t -> t.contains("考试") || t.contains("测验") || t.contains("截止")));
    }

    @Test
    void shouldAutoIndexAndDegradeToBm25WhenEmbeddingModelDisabled() throws Exception {
        authenticateAs(USER_A_ID, "qa_test_user_a");
        if (mockLlmGateway != null) {
            mockLlmGateway.setEmbeddingEnabled(false);
        }

        // 此时 chunks 表为空，直接调用 /api/qa/ask/stream 应自动触发切片构建并降级为 bm25 检索
        MvcResult askResult = mockMvc.perform(post("/api/qa/ask/stream")
                        .characterEncoding(StandardCharsets.UTF_8)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"question\":\"期末前哪几门最紧？\"}"))
                .andExpect(status().isOk())
                .andReturn();

        String sseBody = askResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode doneData = extractDoneEventData(sseBody);
        assertNotNull(doneData);

        JsonNode resultNode = doneData.get("result");
        assertEquals(Retriever.MODE_BM25, resultNode.get("retrievalMode").asText());
        assertEquals(4, resultNode.get("citations").size());
    }

    @Test
    void shouldStrictlyIsolateChunksBetweenUsers() throws Exception {
        // 先为用户 B 构建包含机密课程的切片索引
        authenticateAs(USER_B_ID, "qa_test_user_b");
        qaService.indexEventsForCurrentUser();

        // 切换为用户 A 提问用户 B 的专属关键词「量子密码学终极机密考核」
        authenticateAs(USER_A_ID, "qa_test_user_a");
        qaService.indexEventsForCurrentUser();

        MvcResult askResult = mockMvc.perform(post("/api/qa/ask/stream")
                        .characterEncoding(StandardCharsets.UTF_8)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"question\":\"量子密码学终极机密考核在哪个教室？\"}"))
                .andExpect(status().isOk())
                .andReturn();

        String sseBody = askResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode doneData = extractDoneEventData(sseBody);
        assertNotNull(doneData);

        JsonNode citations = doneData.get("result").get("citations");
        for (JsonNode citation : citations) {
            String text = citation.get("text").asText();
            String title = citation.get("eventTitle").asText();
            assertFalse(text.contains("量子密码学"), "用户 A 绝不能检索到用户 B 的原文切片");
            assertFalse(title.contains("量子密码学"), "用户 A 绝不能检索到用户 B 的事件标题");
        }
    }

    @Test
    void shouldPersistAndManageQaHistory() throws Exception {
        authenticateAs(USER_A_ID, "qa_test_user_a");
        qaService.indexEventsForCurrentUser();

        // 1. 发起一次提问并完成 SSE 流式生成
        mockMvc.perform(post("/api/qa/ask/stream")
                        .characterEncoding(StandardCharsets.UTF_8)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"question\":\"下周三上午有什么课？\"}"))
                .andExpect(status().isOk());

        // 2. 查询历史记录 GET /api/qa/history
        MvcResult historyResult = mockMvc.perform(get("/api/qa/history"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode historyArray = objectMapper.readTree(historyResult.getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertTrue(historyArray.isArray());
        assertEquals(1, historyArray.size());
        JsonNode first = historyArray.get(0);
        assertEquals("下周三上午有什么课？", first.get("question").asText());
        assertFalse(first.get("answer").asText().isBlank());
        assertTrue(first.get("citations").isArray());
        long historyId = first.get("id").asLong();

        // 3. 验证用户 B 无法查看到用户 A 的历史记录（多租户隔离）
        authenticateAs(USER_B_ID, "qa_test_user_b");
        MvcResult userBHistory = mockMvc.perform(get("/api/qa/history"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode userBArray = objectMapper.readTree(userBHistory.getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertEquals(0, userBArray.size());

        // 用户 B 尝试删除用户 A 的记录应失败（404）
        assertThrows(BusinessException.class, () -> qaService.deleteHistoryItemForCurrentUser(historyId));

        // 4. 用户 A 删除单条记录
        authenticateAs(USER_A_ID, "qa_test_user_a");
        mockMvc.perform(delete("/api/qa/history/" + historyId))
                .andExpect(status().isOk());

        // 验证已删除
        MvcResult afterDeleteResult = mockMvc.perform(get("/api/qa/history"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode afterDeleteArray = objectMapper.readTree(afterDeleteResult.getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertEquals(0, afterDeleteArray.size());
    }

    private void authenticateAs(long userId, String username) {
        CurrentUser principal = new CurrentUser(userId, username, "USER", 100000);
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                principal,
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    private void seedUserAEvents() {
        insertEvent(USER_A_ID, "course", "《算法设计与分析》课程",
                "2026-11-04T08:00:00+08:00", "2026-11-04T09:40:00+08:00",
                "教学楼 A302", "算法设计与分析",
                "1. 课程名称：《算法设计与分析》 上课时间：2026-11-04 08:00 至 09:40 上课地点：教学楼 A302 备注：主讲林教授，本周讲授冒泡排序。");
        insertEvent(USER_A_ID, "course", "《操作系统》课程",
                "2026-11-04T09:40:00+08:00", "2026-11-04T11:20:00+08:00",
                "教学楼 A302", "操作系统",
                "2. 课程名称：《操作系统》 上课时间：2026-11-04 09:40 至 11:20 上课地点：教学楼 A302 备注：讲授进程同步与死锁避免。");
        insertEvent(USER_A_ID, "course", "《计算机网络》实验课",
                "2026-11-04T14:00:00+08:00", "2026-11-04T16:00:00+08:00",
                "实验楼 B205", "计算机网络",
                "3. 课程名称：《计算机网络》实验课 上课时间：2026-11-04 14:00 至 16:00 上课地点：实验楼 B205 备注：TCP 三次握手连接建立与报文分析。");
        insertEvent(USER_A_ID, "exam", "《算法设计与分析》期中随堂测验",
                "2026-11-04T15:00:00+08:00", "2026-11-04T17:00:00+08:00",
                "教学楼 C101", "算法设计与分析",
                "4. 【教务考试通知】《算法设计与分析》期中随堂测验定于 2026-11-04 15:00 至 17:00 在教学楼 C101 举行。");
        insertEvent(USER_A_ID, "deadline", "《计算机网络》抓包实验分析报告截止",
                "2026-11-12T20:00:00+08:00", "2026-11-12T22:00:00+08:00",
                "课程中心线上提交", "计算机网络",
                "8. 【作业截止提醒】《计算机网络》TCP 三次握手抓包实验分析报告最后提交时段为 2026-11-12 20:00 至 22:00。");
        insertEvent(USER_A_ID, "exam", "《计算机网络》期末考试",
                "2026-11-13T09:00:00+08:00", "2026-11-13T11:00:00+08:00",
                "第一教学楼 A105", "计算机网络",
                "6. 【期末统考预告】《计算机网络》课程期末考试将于 2026-11-13 09:00 至 11:00 在第一教学楼 A105 考场进行。");
    }

    private void seedUserBEvents() {
        insertEvent(USER_B_ID, "exam", "《量子密码学》终极机密考核",
                "2026-11-04T10:00:00+08:00", "2026-11-04T12:00:00+08:00",
                "机密实验室 Z999", "量子密码学",
                "用户 B 专属私有通知：量子密码学终极机密考核定于 2026-11-04 在机密实验室 Z999 举行。");
    }

    private void insertEvent(
            long userId,
            String type,
            String title,
            String startTime,
            String endTime,
            String location,
            String courseName,
            String sourceText
    ) {
        jdbcTemplate.update(
                """
                INSERT INTO events (user_id, type, title, start_time, end_time, location, course_name, source_text)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                userId, type, title, startTime, endTime, location, courseName, sourceText
        );
    }

    private JsonNode extractDoneEventData(String rawSse) throws Exception {
        String[] lines = rawSse.split("\\r?\\n");
        boolean isDoneEvent = false;
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.startsWith("event:")) {
                String eventName = trimmed.substring(6).trim();
                isDoneEvent = "done".equals(eventName);
            } else if (trimmed.startsWith("data:") && isDoneEvent) {
                String jsonStr = trimmed.substring(5).trim();
                return objectMapper.readTree(jsonStr);
            }
        }
        return null;
    }
}
