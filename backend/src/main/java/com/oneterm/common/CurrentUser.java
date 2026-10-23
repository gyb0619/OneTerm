package com.oneterm.common;

public record CurrentUser(long id, String username, String role, int dailyTokenLimit) {

    public boolean isAdmin() {
        return "ADMIN".equalsIgnoreCase(role);
    }
}
