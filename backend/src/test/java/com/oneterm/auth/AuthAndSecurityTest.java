package com.oneterm.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-auth-admin.db")
@AutoConfigureMockMvc
class AuthAndSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private AdminInitializer adminInitializer;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        adminInitializer.ensureAdminExists();
        jdbcTemplate.update("UPDATE users SET failed_count = 0, locked_until = NULL, enabled = 1 WHERE username = 'admin'");
    }

    @Test
    void unauthenticatedAccessToBusinessAndAdminEndpointsReturns401() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        mockMvc.perform(get("/api/admin/users"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void adminAutoInitializedAndLoginSetsSessionAndCsrfCookie() throws Exception {
        String loginJson = objectMapper.writeValueAsString(Map.of(
                "username", "admin",
                "password", "AdminTest@123"
        ));

        MvcResult loginResult = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("admin"))
                .andExpect(jsonPath("$.role").value("ADMIN"))
                .andReturn();

        Cookie xsrfCookie = loginResult.getResponse().getCookie("XSRF-TOKEN");
        assertNotNull(xsrfCookie, "XSRF-TOKEN cookie should be issued");
        assertFalse(xsrfCookie.isHttpOnly(), "XSRF-TOKEN cookie must be readable by SPA (HttpOnly=false)");

        MockHttpSession session = (MockHttpSession) loginResult.getRequest().getSession(false);
        assertNotNull(session);

        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("admin"))
                .andExpect(jsonPath("$.role").value("ADMIN"));
    }

    @Test
    void fiveConsecutiveFailedLoginsLockAccountForTenMinutesWith423() throws Exception {
        jdbcTemplate.update("DELETE FROM users WHERE username = 'student_lock_test'");
        jdbcTemplate.update(
                "INSERT INTO users (username, password_hash, role, enabled, daily_token_limit, failed_count) VALUES (?, ?, 'USER', 1, 100000, 0)",
                "student_lock_test",
                passwordEncoder.encode("CorrectPass@123")
        );

        String wrongBody = objectMapper.writeValueAsString(Map.of(
                "username", "student_lock_test",
                "password", "WrongPass@000"
        ));

        // 第 1 ~ 4 次失败返回 401 UNAUTHORIZED
        for (int i = 1; i <= 4; i++) {
            mockMvc.perform(post("/api/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(wrongBody))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

            Integer count = jdbcTemplate.queryForObject(
                    "SELECT failed_count FROM users WHERE username = 'student_lock_test'",
                    Integer.class
            );
            assertEquals(i, count);
        }

        // 第 5 次连续失败返回 423 ACCOUNT_LOCKED，并写入 locked_until
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(wrongBody))
                .andExpect(status().is(423))
                .andExpect(jsonPath("$.code").value("ACCOUNT_LOCKED"));

        String lockedUntil = jdbcTemplate.queryForObject(
                "SELECT locked_until FROM users WHERE username = 'student_lock_test'",
                String.class
        );
        assertNotNull(lockedUntil);

        // 锁定期内即使输入正确密码也返回 423 ACCOUNT_LOCKED
        String rightBody = objectMapper.writeValueAsString(Map.of(
                "username", "student_lock_test",
                "password", "CorrectPass@123"
        ));
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(rightBody))
                .andExpect(status().is(423))
                .andExpect(jsonPath("$.code").value("ACCOUNT_LOCKED"));
    }

    @Test
    void normalUserAccessingAdminEndpointsReturns403() throws Exception {
        jdbcTemplate.update("DELETE FROM users WHERE username = 'normal_student'");
        jdbcTemplate.update(
                "INSERT INTO users (username, password_hash, role, enabled, daily_token_limit, failed_count) VALUES (?, ?, 'USER', 1, 100000, 0)",
                "normal_student",
                passwordEncoder.encode("Student@123")
        );

        MvcResult loginRes = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "username", "normal_student",
                                "password", "Student@123"
                        ))))
                .andExpect(status().isOk())
                .andReturn();

        MockHttpSession userSession = (MockHttpSession) loginRes.getRequest().getSession(false);
        assertNotNull(userSession);

        mockMvc.perform(get("/api/admin/users").session(userSession))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));

        mockMvc.perform(get("/api/admin/llm-configs").session(userSession))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void demoLoadIdempotentlySeedsEventsChunksReviewTopicsAndVisualizations() throws Exception {
        // 清理原有 demo_student 数据
        jdbcTemplate.query(
                "SELECT id FROM users WHERE username = 'demo_student'",
                (rs, rowNum) -> rs.getLong("id")
        ).forEach(uid -> {
            jdbcTemplate.update("DELETE FROM visualizations WHERE user_id = ?", uid);
            jdbcTemplate.update("DELETE FROM review_topics WHERE user_id = ?", uid);
            jdbcTemplate.update("DELETE FROM chunks WHERE user_id = ?", uid);
            jdbcTemplate.update("DELETE FROM events WHERE user_id = ?", uid);
            jdbcTemplate.update("DELETE FROM users WHERE id = ?", uid);
        });

        // 第一次调用 demo-load
        MvcResult firstRes = mockMvc.perform(post("/api/auth/demo-load"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("demo_student"))
                .andExpect(jsonPath("$.role").value("USER"))
                .andReturn();

        JsonNode profile = objectMapper.readTree(firstRes.getResponse().getContentAsString());
        long demoUserId = profile.get("id").asLong();
        MockHttpSession session = (MockHttpSession) firstRes.getRequest().getSession(false);
        assertNotNull(session);

        assertEquals(9, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM events WHERE user_id = ?", Integer.class, demoUserId));
        assertEquals(9, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM chunks WHERE user_id = ? AND embedding IS NOT NULL", Integer.class, demoUserId));
        assertEquals(2, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM review_topics WHERE user_id = ?", Integer.class, demoUserId));
        assertEquals(2, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM visualizations WHERE user_id = ?", Integer.class, demoUserId));

        // 第二次幂等调用 demo-load，数据条数保持不变
        mockMvc.perform(post("/api/auth/demo-load").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(demoUserId));

        assertEquals(9, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM events WHERE user_id = ?", Integer.class, demoUserId));
        assertEquals(9, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM chunks WHERE user_id = ?", Integer.class, demoUserId));
        assertEquals(2, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM review_topics WHERE user_id = ?", Integer.class, demoUserId));
        assertEquals(2, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM visualizations WHERE user_id = ?", Integer.class, demoUserId));
    }
}
