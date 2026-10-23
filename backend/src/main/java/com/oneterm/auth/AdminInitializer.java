package com.oneterm.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * 首次启动自动检查并初始化首个 ADMIN 管理员账号。
 * 账号与密码来自配置/环境变量 oneterm.admin.username 与 oneterm.admin.password。
 */
@Component
public class AdminInitializer implements ApplicationRunner {

    private static final int DEFAULT_ADMIN_TOKEN_LIMIT = 100000;

    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;
    private final String adminUsername;
    private final String adminPassword;

    public AdminInitializer(
            JdbcTemplate jdbcTemplate,
            PasswordEncoder passwordEncoder,
            @Value("${oneterm.admin.username:admin}") String adminUsername,
            @Value("${oneterm.admin.password:Admin@123456}") String adminPassword
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
        this.adminUsername = adminUsername;
        this.adminPassword = adminPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        ensureAdminExists();
    }

    public void ensureAdminExists() {
        Integer adminCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM users WHERE role = 'ADMIN'",
                Integer.class
        );
        if (adminCount != null && adminCount > 0) {
            return;
        }
        String username = (adminUsername == null || adminUsername.isBlank()) ? "admin" : adminUsername.trim();
        String rawPassword = (adminPassword == null || adminPassword.isBlank()) ? "Admin@123456" : adminPassword;
        String passwordHash = passwordEncoder.encode(rawPassword);

        Integer existingSameUsername = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM users WHERE username = ?",
                Integer.class,
                username
        );
        if (existingSameUsername != null && existingSameUsername > 0) {
            jdbcTemplate.update(
                    "UPDATE users SET role = 'ADMIN', enabled = 1, password_hash = ? WHERE username = ?",
                    passwordHash,
                    username
            );
        } else {
            jdbcTemplate.update(
                    "INSERT INTO users (username, password_hash, role, enabled, daily_token_limit, failed_count) VALUES (?, ?, 'ADMIN', 1, ?, 0)",
                    username,
                    passwordHash,
                    DEFAULT_ADMIN_TOKEN_LIMIT
            );
        }
    }
}
