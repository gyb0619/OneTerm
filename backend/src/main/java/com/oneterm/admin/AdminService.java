package com.oneterm.admin;

import com.oneterm.admin.AdminDtos.AdminUserDto;
import com.oneterm.admin.AdminDtos.CreateUserRequest;
import com.oneterm.admin.AdminDtos.LlmConfigDto;
import com.oneterm.admin.AdminDtos.ResetPasswordRequest;
import com.oneterm.admin.AdminDtos.SaveLlmConfigRequest;
import com.oneterm.admin.AdminDtos.UpdateUserRequest;
import com.oneterm.admin.AdminDtos.UsageLogDto;
import com.oneterm.common.BusinessException;
import com.oneterm.common.ErrorCode;
import com.oneterm.llm.AesGcmCrypto;
import com.oneterm.llm.RoutingLlmGateway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class AdminService {

    private static final ZoneId SHANGHAI_ZONE = ZoneId.of("Asia/Shanghai");
    private static final Set<String> VALID_ROLES = Set.of("ADMIN", "USER");
    private static final Set<String> VALID_LLM_ROLES = Set.of("chat", "vision", "embedding");
    private static final int DEFAULT_DAILY_LIMIT = 100000;

    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;
    private final AesGcmCrypto aesGcmCrypto;
    private final RoutingLlmGateway routingLlmGateway;

    public AdminService(
            JdbcTemplate jdbcTemplate,
            PasswordEncoder passwordEncoder,
            AesGcmCrypto aesGcmCrypto,
            RoutingLlmGateway routingLlmGateway
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
        this.aesGcmCrypto = aesGcmCrypto;
        this.routingLlmGateway = routingLlmGateway;
    }

    public List<AdminUserDto> listUsers() {
        return jdbcTemplate.query(
                "SELECT id, username, role, enabled, daily_token_limit, failed_count, locked_until, preferred_model_id FROM users ORDER BY id ASC",
                (rs, rowNum) -> {
                    long id = rs.getLong("id");
                    long prefId = rs.getLong("preferred_model_id");
                    Long preferredModelId = rs.wasNull() ? null : prefId;
                    int todayUsed = routingLlmGateway.getTodayTokensUsed(id);
                    return new AdminUserDto(
                            id,
                            rs.getString("username"),
                            rs.getString("role"),
                            rs.getInt("enabled") == 1,
                            rs.getInt("daily_token_limit"),
                            todayUsed,
                            rs.getInt("failed_count"),
                            rs.getString("locked_until"),
                            preferredModelId
                    );
                }
        );
    }

    @Transactional
    public AdminUserDto createUser(CreateUserRequest request) {
        if (request == null || request.username() == null || request.username().isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "用户名不能为空");
        }
        if (request.password() == null || request.password().length() < 6) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "密码长度至少为 6 位");
        }
        String normalizedRole = request.role() == null ? "USER" : request.role().trim().toUpperCase(Locale.ROOT);
        if (!VALID_ROLES.contains(normalizedRole)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "角色必须为 ADMIN 或 USER");
        }
        int limit = request.dailyTokenLimit() == null ? DEFAULT_DAILY_LIMIT : request.dailyTokenLimit();
        if (limit < 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "每日 Token 额度不能为负数");
        }

        String username = request.username().trim();
        Integer existing = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM users WHERE username = ?",
                Integer.class,
                username
        );
        if (existing != null && existing > 0) {
            throw new BusinessException(ErrorCode.CONFLICT, "用户名已存在: " + username);
        }

        String passwordHash = passwordEncoder.encode(request.password());
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO users (username, password_hash, role, enabled, daily_token_limit, failed_count) VALUES (?, ?, ?, 1, ?, 0)",
                    Statement.RETURN_GENERATED_KEYS
            );
            ps.setString(1, username);
            ps.setString(2, passwordHash);
            ps.setString(3, normalizedRole);
            ps.setInt(4, limit);
            return ps;
        }, keyHolder);

        long id = keyHolder.getKey() != null ? keyHolder.getKey().longValue() : 0L;
        return getUserByIdOrThrow(id);
    }

    @Transactional
    public AdminUserDto updateUser(long id, UpdateUserRequest request) {
        AdminUserDto existing = getUserByIdOrThrow(id);
        if (request == null) {
            return existing;
        }

        boolean newEnabled = request.enabled() != null ? request.enabled() : existing.enabled();
        String newRole = existing.role();
        if (request.role() != null && !request.role().isBlank()) {
            newRole = request.role().trim().toUpperCase(Locale.ROOT);
            if (!VALID_ROLES.contains(newRole)) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "角色必须为 ADMIN 或 USER");
            }
        }
        int newLimit = request.dailyTokenLimit() != null ? request.dailyTokenLimit() : existing.dailyTokenLimit();
        if (newLimit < 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "每日 Token 额度不能为负数");
        }

        if (Boolean.TRUE.equals(request.enabled())) {
            jdbcTemplate.update(
                    "UPDATE users SET enabled = ?, role = ?, daily_token_limit = ?, failed_count = 0, locked_until = NULL WHERE id = ?",
                    newEnabled ? 1 : 0,
                    newRole,
                    newLimit,
                    id
            );
        } else {
            jdbcTemplate.update(
                    "UPDATE users SET enabled = ?, role = ?, daily_token_limit = ? WHERE id = ?",
                    newEnabled ? 1 : 0,
                    newRole,
                    newLimit,
                    id
            );
        }

        return getUserByIdOrThrow(id);
    }

    @Transactional
    public void resetPassword(long id, ResetPasswordRequest request) {
        if (request == null || request.newPassword() == null || request.newPassword().length() < 6) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "新密码长度至少为 6 位");
        }
        getUserByIdOrThrow(id);
        String passwordHash = passwordEncoder.encode(request.newPassword());
        jdbcTemplate.update(
                "UPDATE users SET password_hash = ?, failed_count = 0, locked_until = NULL WHERE id = ?",
                passwordHash,
                id
        );
    }

    public List<LlmConfigDto> listLlmConfigs() {
        List<LlmConfigDto> list = new java.util.ArrayList<>(jdbcTemplate.query(
                "SELECT id, role, name, base_url, model, api_key_encrypted, enabled, updated_at FROM llm_config ORDER BY id ASC",
                (rs, rowNum) -> new LlmConfigDto(
                        rs.getLong("id"),
                        rs.getString("role"),
                        rs.getString("name"),
                        rs.getString("base_url"),
                        rs.getString("model"),
                        aesGcmCrypto.maskEncryptedApiKey(rs.getString("api_key_encrypted")),
                        rs.getInt("enabled") == 1,
                        rs.getString("updated_at")
                )
        ));
        for (RoutingLlmGateway.EnvModelInfo envModel : routingLlmGateway.getAllEnvModels()) {
            list.add(new LlmConfigDto(
                    envModel.id(),
                    envModel.role(),
                    envModel.name(),
                    envModel.baseUrl(),
                    envModel.model(),
                    envModel.apiKeyMasked(),
                    true,
                    "系统环境变量"
            ));
        }
        return list;
    }

    @Transactional
    public LlmConfigDto createLlmConfig(SaveLlmConfigRequest request) {
        validateLlmConfigRequest(request, true);
        String role = request.role().trim().toLowerCase(Locale.ROOT);
        String encryptedKey = aesGcmCrypto.encrypt(request.apiKey().trim());
        boolean enabled = request.enabled() == null || request.enabled();
        String nowIso = nowShanghaiIso();

        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO llm_config (role, name, base_url, model, api_key_encrypted, enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS
            );
            ps.setString(1, role);
            ps.setString(2, request.name().trim());
            ps.setString(3, request.baseUrl().trim());
            ps.setString(4, request.model().trim());
            ps.setString(5, encryptedKey);
            ps.setInt(6, enabled ? 1 : 0);
            ps.setString(7, nowIso);
            return ps;
        }, keyHolder);

        long id = keyHolder.getKey() != null ? keyHolder.getKey().longValue() : 0L;
        return getLlmConfigByIdOrThrow(id);
    }

    @Transactional
    public LlmConfigDto updateLlmConfig(long id, SaveLlmConfigRequest request) {
        if (id < 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "系统环境变量模型由系统环境自动管理，无法直接在此修改");
        }
        validateLlmConfigRequest(request, false);
        List<String> existingKeys = jdbcTemplate.query(
                "SELECT api_key_encrypted FROM llm_config WHERE id = ?",
                (rs, rowNum) -> rs.getString("api_key_encrypted"),
                id
        );
        if (existingKeys.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "模型配置不存在");
        }

        String encryptedKey = existingKeys.get(0);
        if (request.apiKey() != null && !request.apiKey().isBlank()) {
            encryptedKey = aesGcmCrypto.encrypt(request.apiKey().trim());
        }

        String role = request.role().trim().toLowerCase(Locale.ROOT);
        boolean enabled = request.enabled() == null || request.enabled();
        String nowIso = nowShanghaiIso();

        jdbcTemplate.update(
                "UPDATE llm_config SET role = ?, name = ?, base_url = ?, model = ?, api_key_encrypted = ?, enabled = ?, updated_at = ? WHERE id = ?",
                role,
                request.name().trim(),
                request.baseUrl().trim(),
                request.model().trim(),
                encryptedKey,
                enabled ? 1 : 0,
                nowIso,
                id
        );

        if (!enabled) {
            jdbcTemplate.update(
                    "UPDATE users SET preferred_model_id = NULL WHERE preferred_model_id = ?",
                    id
            );
        }

        return getLlmConfigByIdOrThrow(id);
    }

    @Transactional
    public void deleteLlmConfig(long id) {
        if (id < 0) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "系统环境变量模型由系统环境自动管理，无法直接删除");
        }
        getLlmConfigByIdOrThrow(id);
        jdbcTemplate.update("UPDATE users SET preferred_model_id = NULL WHERE preferred_model_id = ?", id);
        jdbcTemplate.update("DELETE FROM llm_config WHERE id = ?", id);
    }

    public List<UsageLogDto> listUsageLogs(Long userId) {
        if (userId != null) {
            return jdbcTemplate.query(
                    """
                    SELECT l.id, l.user_id, COALESCE(u.username, '') AS username, l.kind, l.prompt_tokens, l.completion_tokens, l.created_at
                    FROM usage_log l
                    LEFT JOIN users u ON l.user_id = u.id
                    WHERE l.user_id = ?
                    ORDER BY l.id DESC
                    LIMIT 200
                    """,
                    this::mapUsageLog,
                    userId
            );
        }
        return jdbcTemplate.query(
                """
                SELECT l.id, l.user_id, COALESCE(u.username, '') AS username, l.kind, l.prompt_tokens, l.completion_tokens, l.created_at
                FROM usage_log l
                LEFT JOIN users u ON l.user_id = u.id
                ORDER BY l.id DESC
                LIMIT 200
                """,
                this::mapUsageLog
        );
    }

    private UsageLogDto mapUsageLog(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
        return new UsageLogDto(
                rs.getLong("id"),
                rs.getLong("user_id"),
                rs.getString("username"),
                rs.getString("kind"),
                rs.getInt("prompt_tokens"),
                rs.getInt("completion_tokens"),
                rs.getString("created_at")
        );
    }

    private void validateLlmConfigRequest(SaveLlmConfigRequest request, boolean requireApiKey) {
        if (request == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "模型配置参数不能为空");
        }
        String role = request.role() == null ? "" : request.role().trim().toLowerCase(Locale.ROOT);
        if (!VALID_LLM_ROLES.contains(role)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "模型角色必须为 chat、vision 或 embedding");
        }
        if (request.name() == null || request.name().isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "模型配置名称不能为空");
        }
        if (request.baseUrl() == null || request.baseUrl().isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "模型接口地址 baseUrl 不能为空");
        }
        if (request.model() == null || request.model().isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "模型标识 model 不能为空");
        }
        if (requireApiKey && (request.apiKey() == null || request.apiKey().isBlank())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "新增模型配置时 API Key 不能为空");
        }
    }

    private AdminUserDto getUserByIdOrThrow(long id) {
        List<AdminUserDto> rows = jdbcTemplate.query(
                "SELECT id, username, role, enabled, daily_token_limit, failed_count, locked_until, preferred_model_id FROM users WHERE id = ?",
                (rs, rowNum) -> {
                    long uid = rs.getLong("id");
                    long prefId = rs.getLong("preferred_model_id");
                    Long preferredModelId = rs.wasNull() ? null : prefId;
                    int todayUsed = routingLlmGateway.getTodayTokensUsed(uid);
                    return new AdminUserDto(
                            uid,
                            rs.getString("username"),
                            rs.getString("role"),
                            rs.getInt("enabled") == 1,
                            rs.getInt("daily_token_limit"),
                            todayUsed,
                            rs.getInt("failed_count"),
                            rs.getString("locked_until"),
                            preferredModelId
                    );
                },
                id
        );
        if (rows.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "指定的用户不存在");
        }
        return rows.get(0);
    }

    private LlmConfigDto getLlmConfigByIdOrThrow(long id) {
        List<LlmConfigDto> rows = jdbcTemplate.query(
                "SELECT id, role, name, base_url, model, api_key_encrypted, enabled, updated_at FROM llm_config WHERE id = ?",
                (rs, rowNum) -> new LlmConfigDto(
                        rs.getLong("id"),
                        rs.getString("role"),
                        rs.getString("name"),
                        rs.getString("base_url"),
                        rs.getString("model"),
                        aesGcmCrypto.maskEncryptedApiKey(rs.getString("api_key_encrypted")),
                        rs.getInt("enabled") == 1,
                        rs.getString("updated_at")
                ),
                id
        );
        if (rows.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "指定的模型配置不存在");
        }
        return rows.get(0);
    }

    private String nowShanghaiIso() {
        return OffsetDateTime.now(SHANGHAI_ZONE)
                .truncatedTo(ChronoUnit.SECONDS)
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }
}
