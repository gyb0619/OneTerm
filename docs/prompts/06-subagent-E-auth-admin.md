# 阶段 1（子代理 E）：认证安全、管理后台与真实大模型网关迭代记录

## 1. 模块目标与职责范围

负责 `com.oneterm.auth`、`com.oneterm.admin`、真实大模型路由网关 `com.oneterm.llm.RoutingLlmGateway` 与 `AesGcmCrypto`，以及前端 `frontend/src/features/auth/` 和 `frontend/src/features/admin/` 的开发与单元测试：

1. **首次启动自动初始化管理员**：应用启动时通过 `ApplicationRunner` 检查 `users` 表，若无 `ADMIN` 账号则根据 `${oneterm.admin.username}` 与 `${oneterm.admin.password}` 自动初始化首个管理员（BCrypt 加密存储）。
2. **登录与防暴力破解**：连续登录失败达 5 次时写入 `locked_until`（当前 `Asia/Shanghai` 时间 + 10 分钟），锁定期内返回 HTTP `423 ACCOUNT_LOCKED`；登录成功或管理员重置密码时清零计数并解除锁定。
3. **Spring Security 会话与权限**：启用 `HttpOnly` Session Cookie 与 `CookieCsrfTokenRepository.withHttpOnlyFalse()`，未登录访问 `/api/**` 返回 `401 UNAUTHORIZED`，非 `ADMIN` 访问 `/api/admin/**` 返回 `403 FORBIDDEN`。
4. **一键载入示例数据 (`POST /api/auth/demo-load`)**：未登录时自动创建/登录 `demo_student` 账号，并幂等写入 9 条示例事件、9 条带 `float32` BLOB 向量的原文切片、2 条考前复习知识点及 2 个预置交互式可视化 HTML。
5. **AES-256-GCM 密钥加密与每日 Token 额度控制**：使用主密钥 SHA-256 派生 256-bit 密钥与 12 字节随机 IV 加密存储 `llm_config.api_key_encrypted`，所有接口仅返回脱敏尾号（如 `****8f2a`）；每次大模型调用前校验 `Asia/Shanghai` 当日累计 Token 用量，超限返回 `429 QUOTA_EXCEEDED`。

---

## 2. 迭代过程与问题修复记录

### 迭代链 1：Spring Security 6/7 下延迟 CSRF Token 导致首次响应未下发 `XSRF-TOKEN` Cookie
- **初始问题**：
  在配置 `CookieCsrfTokenRepository.withHttpOnlyFalse()` 后，通过测试请求 `/api/auth/login` 发现响应头中并未包含 `Set-Cookie: XSRF-TOKEN=...`，导致前端 SPA 在登录后发起后续 `POST`/`PUT` 请求时无法从 `document.cookie` 读取到 `XSRF-TOKEN`。
- **原因分析与改进建议**：
  Spring Security 6/7 默认启用了延迟加载机制（Deferred `CsrfToken`），只有在请求处理链中显式调用了 `csrfToken.getToken()` 时才会真正生成 Token 并写入响应 Cookie。
- **修复实现**：
  在 `SecurityConfig.java` 中配置 `CsrfTokenRequestAttributeHandler`（将 `csrfRequestAttributeName` 设为 `null`），并在 `BasicAuthenticationFilter` 之后注册自定义的 `CsrfCookieFilter`，在每次请求中主动读取 `CsrfToken` 属性并调用 `csrfToken.getToken()`，确保首次响应即下发可读的 `XSRF-TOKEN` Cookie；同时对 `/api/auth/login` 与 `/api/auth/demo-load` 放行首次无 Cookie 登录请求。

### 迭代链 2：控制器手工设置 `SecurityContext` 在跨请求 Session 中丢失登录态
- **初始问题**：
  在编写 `AuthAndSecurityTest` 时，调用 `POST /api/auth/login` 返回 200 后，携带返回的 `MockHttpSession` 访问 `GET /api/auth/me` 却收到了 `401 UNAUTHORIZED`。
- **原因分析与改进建议**：
  在 Spring Security 6+ 中，`SecurityContextHolderFilter` 默认不再于请求结束时自动将内存中的 `SecurityContextHolder` 写回 `HttpSession`，必须由登录逻辑显式持久化到 `HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY`。
- **修复实现**：
  在 `AuthService.establishSession()` 方法中，构建包含 `CurrentUser` Principal 与 `ROLE_ADMIN`/`ROLE_USER` 权限的 `SecurityContext` 后，显式调用 `httpRequest.getSession(true).setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context)`，确保后续携带 `ONETERM_SESSION` Cookie 的请求能够准确恢复会话上下文。

### 迭代链 3：`demo-load` 重复点击时的幂等性与跨模块联调数据完备性
- **初始问题**：
  早期设计中 `POST /api/auth/demo-load` 仅向 `events` 表插入了 9 条示例事件，导致评委点击「一键载入示例数据」后直接进入问答页或可视化工坊时，因 `chunks`、`review_topics` 和 `visualizations` 表为空而看不到预置效果；且若多次点击会导致重复插入。
- **改进建议与修复实现**：
  在 `AuthService.seedDemoDataIdempotently()` 中按表独立检查当前用户的记录数：
  1. 当 `events` 为空时插入 `MockLlmGateway.loadExpectedEventsJson()` 中的 9 条标准事件；
  2. 当 `chunks` 为空时，遍历用户事件调用 `mockLlmGateway.embed()` 生成 64 维归一化向量并经 `VectorUtils.toFloat32Blob()` 写入 `chunks` 表；
  3. 当 `review_topics` 为空时，自动关联《算法设计与分析》期中测验与《计算机网络》期末考试，插入「冒泡排序」（计划日期 `2026-11-03`）与「TCP 三次握手」（计划日期 `2026-11-10`），并将 `MockVisualizationPresets` 中的两个交互式 HTML 写入 `visualizations` 表；
  4. 在 `AuthAndSecurityTest.demoLoadIdempotentlySeedsEventsChunksReviewTopicsAndVisualizations` 中验证连续调用两次 `POST /api/auth/demo-load`，四张表的记录数严格保持 `9, 9, 2, 2` 不变。
