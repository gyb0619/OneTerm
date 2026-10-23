package com.oneterm.auth;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.oneterm.auth.AuthDtos.AvailableModelDto;
import com.oneterm.auth.AuthDtos.LoginRequest;
import com.oneterm.auth.AuthDtos.PreferredModelRequest;
import com.oneterm.auth.AuthDtos.UserProfileResponse;
import com.oneterm.common.BusinessException;
import com.oneterm.common.CurrentUser;
import com.oneterm.common.CurrentUserProvider;
import com.oneterm.common.ErrorCode;
import com.oneterm.common.VectorUtils;
import com.oneterm.llm.LlmGateway;
import com.oneterm.llm.MockLlmGateway;
import com.oneterm.llm.MockVisualizationPresets;
import com.oneterm.llm.RoutingLlmGateway;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class AuthService {

    public static final ZoneId SHANGHAI_ZONE = ZoneId.of("Asia/Shanghai");
    public static final String DEMO_USERNAME = "demo_student";
    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final int LOCK_MINUTES = 10;
    private static final int DEFAULT_DAILY_LIMIT = 100000;

    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;
    private final CurrentUserProvider currentUserProvider;
    private final LlmGateway llmGateway;
    private final RoutingLlmGateway routingLlmGateway;
    private final MockLlmGateway mockLlmGateway;
    private final ObjectMapper objectMapper;

    public AuthService(
            JdbcTemplate jdbcTemplate,
            PasswordEncoder passwordEncoder,
            CurrentUserProvider currentUserProvider,
            LlmGateway llmGateway,
            RoutingLlmGateway routingLlmGateway,
            MockLlmGateway mockLlmGateway,
            ObjectMapper objectMapper
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
        this.currentUserProvider = currentUserProvider;
        this.llmGateway = llmGateway;
        this.routingLlmGateway = routingLlmGateway;
        this.mockLlmGateway = mockLlmGateway;
        this.objectMapper = objectMapper;
    }

    public UserProfileResponse login(LoginRequest request, HttpServletRequest httpRequest) {
        if (request == null
                || request.username() == null || request.username().isBlank()
                || request.password() == null || request.password().isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "用户名与密码不能为空");
        }

        String username = request.username().trim();
        Optional<UserRow> userOpt = findUserByUsername(username);
        if (userOpt.isEmpty()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "用户名或密码错误");
        }

        UserRow user = userOpt.get();
        OffsetDateTime now = OffsetDateTime.now(SHANGHAI_ZONE);

        // 1. 校验是否处于锁定期内
        boolean lockExpired = false;
        if (user.lockedUntil() != null && !user.lockedUntil().isBlank()) {
            OffsetDateTime lockedUntilTime = parseShanghaiTime(user.lockedUntil());
            if (lockedUntilTime != null && lockedUntilTime.isAfter(now)) {
                throw new BusinessException(ErrorCode.ACCOUNT_LOCKED, "登录失败次数过多，账号已锁定 10 分钟");
            }
            lockExpired = true;
        }

        // 2. 校验密码
        if (!passwordEncoder.matches(request.password(), user.passwordHash())) {
            int baseFailed = lockExpired ? 0 : user.failedCount();
            int newFailedCount = baseFailed + 1;
            if (newFailedCount >= MAX_FAILED_ATTEMPTS) {
                String lockedUntilIso = now.plusMinutes(LOCK_MINUTES)
                        .truncatedTo(ChronoUnit.SECONDS)
                        .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
                jdbcTemplate.update(
                        "UPDATE users SET failed_count = ?, locked_until = ? WHERE id = ?",
                        newFailedCount,
                        lockedUntilIso,
                        user.id()
                );
                throw new BusinessException(ErrorCode.ACCOUNT_LOCKED, "连续登录失败满 5 次，账号已锁定 10 分钟");
            } else {
                jdbcTemplate.update(
                        "UPDATE users SET failed_count = ?, locked_until = NULL WHERE id = ?",
                        newFailedCount,
                        user.id()
                );
                throw new BusinessException(ErrorCode.UNAUTHORIZED, "用户名或密码错误（已连续失败 " + newFailedCount + "/5 次）");
            }
        }

        // 3. 校验账号是否启用
        if (!user.enabled()) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "该账号已被停用，请联系管理员");
        }

        // 4. 登录成功，清零失败计数与锁定时间
        jdbcTemplate.update(
                "UPDATE users SET failed_count = 0, locked_until = NULL WHERE id = ?",
                user.id()
        );

        CurrentUser currentUser = new CurrentUser(user.id(), user.username(), user.role(), user.dailyTokenLimit());
        establishSession(currentUser, httpRequest);
        return buildUserProfileResponse(user.id());
    }

    public void logout(HttpServletRequest httpRequest) {
        if (httpRequest != null) {
            HttpSession session = httpRequest.getSession(false);
            if (session != null) {
                session.invalidate();
            }
        }
        SecurityContextHolder.clearContext();
    }

    public UserProfileResponse getMe() {
        CurrentUser current = currentUserProvider.requireCurrentUser();
        return buildUserProfileResponse(current.id());
    }

    public List<AvailableModelDto> getAvailableModels() {
        currentUserProvider.requireCurrentUser();
        List<AvailableModelDto> list = new java.util.ArrayList<>(jdbcTemplate.query(
                "SELECT id, role, name, model FROM llm_config WHERE enabled = 1 AND role = 'chat' ORDER BY id ASC",
                (rs, rowNum) -> new AvailableModelDto(
                        rs.getLong("id"),
                        rs.getString("role"),
                        rs.getString("name"),
                        rs.getString("model")
                )
        ));
        java.util.Set<Long> existingIds = list.stream().map(AvailableModelDto::id).collect(java.util.stream.Collectors.toSet());
        for (RoutingLlmGateway.EnvModelInfo envModel : routingLlmGateway.getEnvChatModels()) {
            if (!existingIds.contains(envModel.id())) {
                list.add(new AvailableModelDto(
                        envModel.id(),
                        envModel.role(),
                        envModel.name(),
                        envModel.model()
                ));
            }
        }
        return list;
    }

    public UserProfileResponse updatePreferredModel(PreferredModelRequest request) {
        CurrentUser current = currentUserProvider.requireCurrentUser();
        if (request == null || request.modelId() == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "请选择有效的模型 ID");
        }
        long modelId = request.modelId();
        if (modelId < 0) {
            boolean envExists = routingLlmGateway.getEnvChatModels().stream().anyMatch(m -> m.id() == modelId);
            if (!envExists) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "所选环境变量模型不存在");
            }
            jdbcTemplate.update(
                    "UPDATE users SET preferred_model_id = ? WHERE id = ?",
                    modelId,
                    current.id()
            );
            return buildUserProfileResponse(current.id());
        }

        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM llm_config WHERE id = ? AND enabled = 1 AND role = 'chat'",
                Integer.class,
                modelId
        );
        if (count == null || count == 0) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "所选对话模型不存在或未启用");
        }
        jdbcTemplate.update(
                "UPDATE users SET preferred_model_id = ? WHERE id = ?",
                modelId,
                current.id()
        );
        return buildUserProfileResponse(current.id());
    }

    @Transactional
    public UserProfileResponse demoLoad(HttpServletRequest httpRequest) {
        long userId;
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated() && !(auth instanceof AnonymousAuthenticationToken)) {
            CurrentUser current = currentUserProvider.requireCurrentUser();
            userId = current.id();
        } else {
            UserRow demoUser = getOrCreateDemoStudent();
            userId = demoUser.id();
            CurrentUser currentUser = new CurrentUser(
                    demoUser.id(),
                    demoUser.username(),
                    demoUser.role(),
                    demoUser.dailyTokenLimit()
            );
            establishSession(currentUser, httpRequest);
        }

        seedDemoDataIdempotently(userId);
        return buildUserProfileResponse(userId);
    }

    private UserRow getOrCreateDemoStudent() {
        Optional<UserRow> existing = findUserByUsername(DEMO_USERNAME);
        if (existing.isPresent()) {
            UserRow row = existing.get();
            if (!row.enabled() || row.failedCount() > 0 || row.lockedUntil() != null) {
                jdbcTemplate.update(
                        "UPDATE users SET enabled = 1, failed_count = 0, locked_until = NULL WHERE id = ?",
                        row.id()
                );
            }
            return findUserById(row.id()).orElseThrow();
        }

        String passwordHash = passwordEncoder.encode("Demo@123456");
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO users (username, password_hash, role, enabled, daily_token_limit, failed_count) VALUES (?, ?, 'USER', 1, ?, 0)",
                    Statement.RETURN_GENERATED_KEYS
            );
            ps.setString(1, DEMO_USERNAME);
            ps.setString(2, passwordHash);
            ps.setInt(3, DEFAULT_DAILY_LIMIT);
            return ps;
        }, keyHolder);

        long id = keyHolder.getKey() != null ? keyHolder.getKey().longValue() : 0L;
        return findUserById(id).orElseThrow();
    }

    private void seedDemoDataIdempotently(long userId) {
        Integer existingEventsCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM events WHERE user_id = ?",
                Integer.class,
                userId
        );

        if (existingEventsCount == null || existingEventsCount == 0) {
            try {
                String json = MockLlmGateway.loadExpectedEventsJson();
                List<Map<String, String>> rawEvents = objectMapper.readValue(json, new TypeReference<>() {});
                for (Map<String, String> item : rawEvents) {
                    jdbcTemplate.update(
                            "INSERT INTO events (user_id, type, title, start_time, end_time, location, course_name, source_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                            userId,
                            item.getOrDefault("type", "course"),
                            item.getOrDefault("title", ""),
                            item.getOrDefault("startTime", ""),
                            item.getOrDefault("endTime", ""),
                            item.getOrDefault("location", ""),
                            item.getOrDefault("courseName", ""),
                            item.getOrDefault("sourceText", "")
                    );
                }
            } catch (Exception ex) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR, "载入示例事件数据失败: " + ex.getMessage());
            }
        }

        List<SeededEvent> userEvents = jdbcTemplate.query(
                "SELECT id, type, title, start_time, end_time, location, course_name, source_text FROM events WHERE user_id = ? ORDER BY id ASC",
                (rs, rowNum) -> new SeededEvent(
                        rs.getLong("id"),
                        rs.getString("type"),
                        rs.getString("title"),
                        rs.getString("start_time"),
                        rs.getString("end_time"),
                        rs.getString("location"),
                        rs.getString("course_name"),
                        rs.getString("source_text")
                ),
                userId
        );

        Integer existingChunksCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM chunks WHERE user_id = ?",
                Integer.class,
                userId
        );
        if ((existingChunksCount == null || existingChunksCount == 0) && !userEvents.isEmpty()) {
            for (SeededEvent ev : userEvents) {
                String chunkText = ev.sourceText();
                float[] embedding = mockLlmGateway.embed(userId, ev.title() + " " + ev.startTime() + " " + chunkText);
                byte[] blob = VectorUtils.toFloat32Blob(embedding);
                jdbcTemplate.update(
                        "INSERT INTO chunks (user_id, text, embedding, event_id) VALUES (?, ?, ?, ?)",
                        userId,
                        chunkText,
                        blob,
                        ev.id()
                );
            }
        }

        Integer existingTopicsCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM review_topics WHERE user_id = ?",
                Integer.class,
                userId
        );
        if ((existingTopicsCount == null || existingTopicsCount == 0) && !userEvents.isEmpty()) {
            Long algExamId = userEvents.stream()
                    .filter(e -> "exam".equalsIgnoreCase(e.type()) && e.title().contains("算法"))
                    .map(SeededEvent::id)
                    .findFirst()
                    .orElse(userEvents.get(0).id());

            Long netExamId = userEvents.stream()
                    .filter(e -> "exam".equalsIgnoreCase(e.type()) && e.title().contains("计算机网络"))
                    .map(SeededEvent::id)
                    .findFirst()
                    .orElse(userEvents.get(userEvents.size() - 1).id());

            long bubbleTopicId = insertReviewTopic(userId, algExamId, "冒泡排序", "2026-11-03");
            long tcpTopicId = insertReviewTopic(userId, netExamId, "TCP 三次握手", "2026-11-10");

            Integer existingVisCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM visualizations WHERE user_id = ?",
                    Integer.class,
                    userId
            );
            if (existingVisCount == null || existingVisCount == 0) {
                String nowIso = OffsetDateTime.now(SHANGHAI_ZONE)
                        .truncatedTo(ChronoUnit.SECONDS)
                        .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
                jdbcTemplate.update(
                        "INSERT INTO visualizations (user_id, topic_id, html, prompt_version, created_at) VALUES (?, ?, ?, 'v1.0', ?)",
                        userId,
                        bubbleTopicId,
                        MockVisualizationPresets.BUBBLE_SORT_HTML,
                        nowIso
                );
                jdbcTemplate.update(
                        "INSERT INTO visualizations (user_id, topic_id, html, prompt_version, created_at) VALUES (?, ?, ?, 'v1.0', ?)",
                        userId,
                        tcpTopicId,
                        MockVisualizationPresets.TCP_HANDSHAKE_HTML,
                        nowIso
                );
            }
        }
    }

    private long insertReviewTopic(long userId, long eventId, String topic, String plannedDate) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO review_topics (user_id, event_id, topic, planned_date, done) VALUES (?, ?, ?, ?, 0)",
                    Statement.RETURN_GENERATED_KEYS
            );
            ps.setLong(1, userId);
            ps.setLong(2, eventId);
            ps.setString(3, topic);
            ps.setString(4, plannedDate);
            return ps;
        }, keyHolder);
        return keyHolder.getKey() != null ? keyHolder.getKey().longValue() : 0L;
    }

    public UserProfileResponse buildUserProfileResponse(long userId) {
        UserRow user = findUserById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED));
        if (!user.enabled()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "账号已被停用");
        }
        int todayTokensUsed = routingLlmGateway.getTodayTokensUsed(userId);
        return new UserProfileResponse(
                user.id(),
                user.username(),
                user.role(),
                user.enabled(),
                user.dailyTokenLimit(),
                todayTokensUsed,
                user.preferredModelId(),
                llmGateway.isMockMode()
        );
    }

    private void establishSession(CurrentUser currentUser, HttpServletRequest httpRequest) {
        UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                currentUser,
                null,
                List.of(
                        new SimpleGrantedAuthority("ROLE_" + currentUser.role().toUpperCase()),
                        new SimpleGrantedAuthority(currentUser.role().toUpperCase())
                )
        );
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authToken);
        SecurityContextHolder.setContext(context);

        if (httpRequest != null) {
            HttpSession session = httpRequest.getSession(true);
            session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
        }
    }

    private Optional<UserRow> findUserByUsername(String username) {
        List<UserRow> rows = jdbcTemplate.query(
                "SELECT id, username, password_hash, role, enabled, daily_token_limit, failed_count, locked_until, preferred_model_id FROM users WHERE username = ?",
                this::mapUserRow,
                username
        );
        return rows.stream().findFirst();
    }

    private Optional<UserRow> findUserById(long id) {
        List<UserRow> rows = jdbcTemplate.query(
                "SELECT id, username, password_hash, role, enabled, daily_token_limit, failed_count, locked_until, preferred_model_id FROM users WHERE id = ?",
                this::mapUserRow,
                id
        );
        return rows.stream().findFirst();
    }

    private UserRow mapUserRow(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
        long prefId = rs.getLong("preferred_model_id");
        Long preferredModelId = rs.wasNull() ? null : prefId;
        return new UserRow(
                rs.getLong("id"),
                rs.getString("username"),
                rs.getString("password_hash"),
                rs.getString("role"),
                rs.getInt("enabled") == 1,
                rs.getInt("daily_token_limit"),
                rs.getInt("failed_count"),
                rs.getString("locked_until"),
                preferredModelId
        );
    }

    private OffsetDateTime parseShanghaiTime(String timeStr) {
        if (timeStr == null || timeStr.isBlank()) {
            return null;
        }
        try {
            return OffsetDateTime.parse(timeStr.trim());
        } catch (Exception ignored) {
            try {
                LocalDateTime ldt = LocalDateTime.parse(timeStr.trim());
                return ldt.atZone(SHANGHAI_ZONE).toOffsetDateTime();
            } catch (Exception ex) {
                return null;
            }
        }
    }

    private record UserRow(
            long id,
            String username,
            String passwordHash,
            String role,
            boolean enabled,
            int dailyTokenLimit,
            int failedCount,
            String lockedUntil,
            Long preferredModelId
    ) {
    }

    private record SeededEvent(
            long id,
            String type,
            String title,
            String startTime,
            String endTime,
            String location,
            String courseName,
            String sourceText
    ) {
    }
}
