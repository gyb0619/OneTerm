# OneTerm 工程规范与接口约定（CONVENTIONS）

本文档定义「一学期 OneTerm」前后端及各子代理共同遵守的技术规范与接口约定。所有模块开发必须严格遵循本约定。

---

## 1. 时区与时间格式

1. **全局时区**：系统前后端、数据库时间计算及配额重置统一使用 `Asia/Shanghai`（UTC+8）。
2. **日期时间格式（DateTime）**：统一采用 **ISO 8601** 标准字符串，带时区偏移或本地标准格式：
   - 完整时间戳：`YYYY-MM-DDTHH:mm:ss+08:00`（如 `2026-10-28T14:00:00+08:00`），前端与后端同时兼容不带偏移量的本地 ISO 格式 `YYYY-MM-DDTHH:mm:ss`（默认按 `Asia/Shanghai` 解析）。
   - 纯日期（Date）：`YYYY-MM-DD`（如 `2026-10-28`，用于复习计划 `planned_date`、热力图日期统计等）。

---

## 2. 统一错误响应格式

所有非 2xx 的 HTTP 响应（包括客户端错误、鉴权失败、配额超限、服务端异常）均返回 JSON，格式固定为：

```json
{
  "code": "ERROR_CODE",
  "message": "面向用户的友好中文提示信息"
}
```

### 标准错误码枚举

| HTTP 状态码 | `code` 枚举值 | 触发场景说明 |
| :--- | :--- | :--- |
| `400` | `BAD_REQUEST` | 请求参数缺失、格式不合法、不支持的文件类型或非法的知识点类别 |
| `401` | `UNAUTHORIZED` | 未登录或会话已过期，访问任何业务接口均返回此状态 |
| `403` | `FORBIDDEN` | 权限不足（如普通 `USER` 访问 `/api/admin/**`）或 CSRF 校验失败 |
| `404` | `NOT_FOUND` | 资源不存在，或**跨用户越权访问他人数据**（强制按 `user_id` 过滤后未命中统一返回 404，不暴露资源存在性） |
| `409` | `CONFLICT` | 唯一性冲突（如管理员创建已存在的用户名） |
| `422` | `VALIDATION_FAILED` | 大模型返回结构解析失败（自动重试一次后仍失败）或可视化 HTML 安全校验未通过 |
| `423` | `ACCOUNT_LOCKED` | 连续登录失败达到 5 次，账号处于 10 分钟锁定期内 |
| `429` | `QUOTA_EXCEEDED` | 当前账号今日大模型 Token 消耗已达上限（默认 100,000 tokens/天） |
| `500` | `INTERNAL_ERROR` | 服务端内部未预期异常 |
| `502` | `LLM_UPSTREAM_ERROR` | 上游大模型接口调用失败或超时 |

---

## 3. SSE（Server-Sent Events）流式事件规范

所有涉及大模型的流式接口（结构化事件抽取、RAG 对话问答、知识点可视化生成）均使用 `Content-Type: text/event-stream;charset=UTF-8` 返回。

SSE 仅使用以下 **四类标准事件名（`event`）**，每条消息的 `data` 字段均为单行 JSON 字符串：

### 3.1 `progress`（进度通知）
用于推送阶段性处理状态（如识图完成、正在识别第 N 条事件、正在校验 HTML 等）：
```
event: progress
data: {"step":"extracting","current":2,"total":6,"message":"正在识别第 2 条事件"}
```

### 3.2 `delta`（增量内容流）
用于逐字或分片推送大模型生成的文本片段：
```
event: delta
data: {"content":"根据您的课表，下周三下午 14:00-16:00 有《计算机网络》实验课..."}
```

### 3.3 `done`（完成事件）
流式任务正常结束时发送最后一条 `done` 事件，`data` 中携带完整结果载荷（如抽取出的事件数组、问答引用列表 `citations`、生成并入库后的可视化对象等）：
```
event: done
data: {"result":{...},"usage":{"promptTokens":320,"completionTokens":180}}
```

### 3.4 `error`（流内错误事件）
当流式输出过程中发生解析失败、安全校验不通过或额度超限时推送，随后服务端关闭流：
```
event: error
data: {"code":"VALIDATION_FAILED","message":"生成结果解析失败，已自动重试仍未通过，请点击重试"}
```

---

## 4. 鉴权、会话与数据隔离

1. **会话机制**：采用服务端 Session + `HttpOnly` Cookie（Cookie 名：`ONETERM_SESSION` 或 `JSESSIONID`）。
2. **CSRF 防护**：
   - 开启 Spring Security CSRF 防护，使用 `CookieCsrfTokenRepository.withHttpOnlyFalse()` 下发 `XSRF-TOKEN` Cookie。
   - 前端统一请求封装从 Cookie 读取 `XSRF-TOKEN`，并在所有非 GET/HEAD/OPTIONS 请求头中附带 `X-XSRF-TOKEN`。
3. **角色枚举**：
   - `ADMIN`：系统管理员，可管理系统模型配置、管理用户账号与每日 Token 额度，也可使用普通业务功能。
   - `USER`：普通学生/评委账号，可使用除 `/api/admin/**` 外的全部业务功能。
4. **租户数据隔离**：
   - 所有业务表（`events`、`chunks`、`review_topics`、`visualizations`、`usage_log`）均包含 `user_id` 字段。
   - 后端 Service / Repository 层所有查询、修改、删除 SQL **必须携带 `WHERE user_id = :currentUserId`**。
   - 当根据 `id` 查询或操作不属于当前登录用户的记录时，一律返回 HTTP `404`（`NOT_FOUND`）。

---

## 5. 事件类型与负载权重约定

### 5.1 事件类型枚举（`EventType`）
`events.type` 字段仅允许以下 5 个小写枚举值：

| 枚举值 | 中文含义 | 前端推荐色彩语义（清爽学院风） | 周负载密度权重 |
| :--- | :--- | :--- | :--- |
| `exam` | 考试/测验 | 珊瑚红 / 琥珀橙（醒目警示） | **5**（最高） |
| `deadline` | 作业/实验截止 | 琥珀黄 / 橙色 | **3** |
| `course` | 常规课程/实验课 | 学院青绿（主色 Teal） | **2** |
| `activity` | 社团/讲座/校园活动 | 天空蓝（Sky Blue） | **1** |
| `notice` | 教务通知/提醒 | 浅灰蓝（Slate） | **1** |

### 5.2 冲突检测规则
- 设有时间区间的事件 $A = [start_A, end_A)$ 与 $B = [start_B, end_B)$（其中 $start < end$）：
  - **算作冲突**：$\max(start_A, start_B) < \min(end_A, end_B)$（包含完全重叠与部分重叠，含跨天重叠）。
  - **不算冲突**：$end_A = start_B$ 或 $end_B = start_A$（首尾相接不算冲突）。

---

## 6. 大模型角色与环境变量约定

### 6.1 模型角色枚举（`LlmRole`）
`llm_config.role` 仅允许以下 3 个小写枚举值：
- `chat`：对话、结构化抽取与可视化 HTML 生成模型（默认推荐 DeepSeek）。
- `vision`：图片转文字识图模型。
- `embedding`：文本向量化模型（输出 `float32` 向量，以 Little-Endian BLOB 存入 SQLite `chunks.embedding`）。

### 6.2 环境变量定义

| 环境变量名 | 必填 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `ONETERM_SECRET_KEY` | 生产必填 | 开发环境提供回退密钥 | 用于加密 `llm_config.api_key_encrypted` 的 AES-256-GCM 主密钥（至少 32 字节或经 SHA-256 派生为 256-bit 密钥） |
| `ONETERM_MOCK` | 否 | `false` | 设为 `true` 时强制进入 Mock 模式；若数据库中无启用的模型配置，也自动进入 Mock 模式 |
| `ONETERM_ADMIN_USERNAME` | 否 | `admin` | 首次启动初始化管理员账号的用户名 |
| `ONETERM_ADMIN_PASSWORD` | 否 | `Admin@123456` | 首次启动初始化管理员账号的初始密码（以 BCrypt 哈希入库） |
| `ONETERM_DB_PATH` | 否 | `./data/oneterm.db` | SQLite 数据库文件存储路径 |
