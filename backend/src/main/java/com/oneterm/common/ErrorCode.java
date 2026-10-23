package com.oneterm.common;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    BAD_REQUEST(HttpStatus.BAD_REQUEST, "请求参数不合法"),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "未登录或会话已过期，请先登录"),
    FORBIDDEN(HttpStatus.FORBIDDEN, "无权限执行该操作"),
    NOT_FOUND(HttpStatus.NOT_FOUND, "请求的资源不存在"),
    CONFLICT(HttpStatus.CONFLICT, "数据已存在或发生冲突"),
    VALIDATION_FAILED(HttpStatus.valueOf(422), "生成内容校验未通过"),
    ACCOUNT_LOCKED(HttpStatus.valueOf(423), "登录失败次数过多，账号已锁定 10 分钟"),
    QUOTA_EXCEEDED(HttpStatus.TOO_MANY_REQUESTS, "今日大模型 Token 额度已用尽，请明日再试或联系管理员调整额度"),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "服务器内部错误，请稍后重试"),
    LLM_UPSTREAM_ERROR(HttpStatus.BAD_GATEWAY, "大模型服务调用异常，请稍后重试");

    private final HttpStatus status;
    private final String defaultMessage;

    ErrorCode(HttpStatus status, String defaultMessage) {
        this.status = status;
        this.defaultMessage = defaultMessage;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getDefaultMessage() {
        return defaultMessage;
    }
}
