# 管理后台与大模型网关模块 (`com.oneterm.admin` & `com.oneterm.llm`)

## 1. 模块职责
本模块面向 `ADMIN` 角色提供系统级管理后台能力，并配合 `com.oneterm.llm` 中的 `AesGcmCrypto` 与 `RoutingLlmGateway` 实现 API Key 加密存储、真实大模型网关路由及每日 Token 额度管控。

## 2. 核心组件说明
- **`AesGcmCrypto` (`com.oneterm.llm`)**：
  - 从环境变量 `ONETERM_SECRET_KEY`（`oneterm.secret-key`）读取主密钥，经 SHA-256 派生为 32 字节（256-bit）密钥，结合 12 字节随机 IV 执行 `AES/GCM/NoPadding` 加密与解密。
  - 提供脱敏方法 `maskEncryptedApiKey`，任何后台接口均只返回 `****` 加末 4 位尾号（如 `****8f2a`），绝不返回完整 API Key。
- **`RoutingLlmGateway` (`com.oneterm.llm`)**：
  - 作为 `@Primary` 的 `LlmGateway` 实现，统一拦截对话、事件抽取、RAG 问答、可视化生成、识图（`vision`）与向量（`embedding`）调用。
  - **每日额度校验**：每次调用前汇总当前用户在 `Asia/Shanghai` 当日 0 点起的 `prompt_tokens + completion_tokens`；若已达或超过 `users.daily_token_limit`（默认 100,000），立即抛出 `ErrorCode.QUOTA_EXCEEDED`（HTTP `429`）。
  - **自动回退与真实调用**：当 `ONETERM_MOCK=true` 或数据库中无对应角色的已启用配置时，委托给 `MockLlmGateway`；当存在已启用配置时，解密 Key 并使用 `HttpClient` 调用上游兼容接口，调用完成后将 Token 消耗写入 `usage_log`。
- **`AdminService` & `AdminController`**：
  - 用户管理：`GET /api/admin/users`、`POST /api/admin/users`（重名返回 `409 CONFLICT`）、`PUT /api/admin/users/{id}`（启停账号、调整每日额度）、`POST /api/admin/users/{id}/reset-password`（重置密码并解除锁定）。
  - 模型配置管理：`GET /api/admin/llm-configs`、`POST /api/admin/llm-configs`、`PUT /api/admin/llm-configs/{id}`、`DELETE /api/admin/llm-configs/{id}`。
  - 用量统计：`GET /api/admin/usage-logs`。
