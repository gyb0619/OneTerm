package com.oneterm.common;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 基于 Spring SecurityContext 的默认 CurrentUserProvider 实现。
 * 支持直接存储 CurrentUser Principal，或通过用户名从 users 表解析当前登录用户。
 */
@Component
public class SecurityCurrentUserProvider implements CurrentUserProvider {

    private final JdbcTemplate jdbcTemplate;

    public SecurityCurrentUserProvider(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public CurrentUser requireCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        Object principal = auth.getPrincipal();
        if (principal instanceof CurrentUser currentUser) {
            return currentUser;
        }
        String username = auth.getName();
        if (username == null || username.isBlank()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        List<CurrentUser> users = jdbcTemplate.query(
                "SELECT id, username, role, daily_token_limit FROM users WHERE username = ? AND enabled = 1",
                (rs, rowNum) -> new CurrentUser(
                        rs.getLong("id"),
                        rs.getString("username"),
                        rs.getString("role"),
                        rs.getInt("daily_token_limit")
                ),
                username
        );
        if (!users.isEmpty()) {
            return users.get(0);
        }
        throw new BusinessException(ErrorCode.UNAUTHORIZED);
    }
}
