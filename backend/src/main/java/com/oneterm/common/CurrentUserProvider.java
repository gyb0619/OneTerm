package com.oneterm.common;

/**
 * 统一当前登录用户上下文提供器接口。
 * 各业务模块通过该接口获取当前登录用户 ID 以执行 user_id 强制隔离，避免直接耦合 auth 包内部实现。
 */
public interface CurrentUserProvider {

    /**
     * 获取当前已登录用户信息；未登录时抛出 401 UNAUTHORIZED BusinessException。
     */
    CurrentUser requireCurrentUser();

    /**
     * 获取当前已登录用户的 user_id；未登录时抛出 401 UNAUTHORIZED BusinessException。
     */
    default long requireCurrentUserId() {
        return requireCurrentUser().id();
    }
}
