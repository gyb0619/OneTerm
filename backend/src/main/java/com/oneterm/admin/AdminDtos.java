package com.oneterm.admin;

public final class AdminDtos {

    private AdminDtos() {
    }

    public record AdminUserDto(
            long id,
            String username,
            String role,
            boolean enabled,
            int dailyTokenLimit,
            int todayTokensUsed,
            int failedCount,
            String lockedUntil,
            Long preferredModelId
    ) {
    }

    public record CreateUserRequest(
            String username,
            String password,
            String role,
            Integer dailyTokenLimit
    ) {
    }

    public record UpdateUserRequest(
            Boolean enabled,
            String role,
            Integer dailyTokenLimit
    ) {
    }

    public record ResetPasswordRequest(String newPassword) {
    }

    public record LlmConfigDto(
            long id,
            String role,
            String name,
            String baseUrl,
            String model,
            String apiKeyMasked,
            boolean enabled,
            String updatedAt
    ) {
    }

    public record SaveLlmConfigRequest(
            String role,
            String name,
            String baseUrl,
            String model,
            String apiKey,
            Boolean enabled
    ) {
    }

    public record UsageLogDto(
            long id,
            long userId,
            String username,
            String kind,
            int promptTokens,
            int completionTokens,
            String createdAt
    ) {
    }

    public record SimpleSuccessResponse(boolean success, String message) {
    }
}
