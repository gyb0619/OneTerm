package com.oneterm.auth;

public final class AuthDtos {

    private AuthDtos() {
    }

    public record LoginRequest(String username, String password) {
    }

    public record UserProfileResponse(
            long id,
            String username,
            String role,
            boolean enabled,
            int dailyTokenLimit,
            int todayTokensUsed,
            Long preferredModelId,
            boolean mockMode
    ) {
    }

    public record AvailableModelDto(
            long id,
            String role,
            String name,
            String model
    ) {
    }

    public record PreferredModelRequest(Long modelId) {
    }

    public record SimpleSuccessResponse(boolean success, String message) {
    }
}
