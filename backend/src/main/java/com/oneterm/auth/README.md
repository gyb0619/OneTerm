# 认证与安全模块 (`com.oneterm.auth`)

## 1. 模块职责
本模块负责「一学期 OneTerm」的账号初始化、登录认证、防暴力破解、HttpOnly Session + CSRF 安全防线、用户可选对话模型切换以及评委「一键载入示例数据」全链路初始化。

## 2. 核心组件说明
- **`AdminInitializer`**：实现 `ApplicationRunner`，在应用首次启动时检查 `users` 表是否存在 `ADMIN` 账号；若不存在，则读取 `${oneterm.admin.username}` 与 `${oneterm.admin.password}` 自动创建首个管理员账号（密码经 `BCryptPasswordEncoder` 加密入库）。
- **`SecurityConfig`**：
  - 启用 `HttpOnly` Session Cookie 与基于 `CookieCsrfTokenRepository.withHttpOnlyFalse()` 的 `XSRF-TOKEN` Cookie 下发机制。
  - 未登录访问任何 `/api/**` 业务接口（除 `/api/auth/login`、`/api/auth/demo-load` 外）统一返回 HTTP `401 UNAUTHORIZED`。
  - 非 `ADMIN` 角色访问 `/api/admin/**` 统一返回 HTTP `403 FORBIDDEN`。
- **`AuthService`**：
  - **防暴力破解登录**：校验 BCrypt 密码；连续失败 5 次设置 `locked_until = 当前 Asia/Shanghai 时间 + 10 分钟`，锁定期内拒绝登录并返回 HTTP `423 ACCOUNT_LOCKED`。
  - **一键载入示例数据 (`demoLoad`)**：未登录时自动创建/登录 `demo_student` 账号，并幂等写入 9 条标准示例事件、9 条带 `float32` BLOB 向量的原文切片、2 条考前复习知识点（冒泡排序、TCP 三次握手）及对应的 2 个预置交互式 HTML 可视化记录。
  - **可选对话模型切换**：仅返回管理员已启用的 `chat` 模型基本信息，绝不暴露 API Key 或内部接口地址。
- **`AuthController`**：提供 `/api/auth/login`、`/api/auth/logout`、`/api/auth/me`、`/api/auth/models`、`/api/auth/preferred-model`、`/api/auth/demo-load` 接口。
