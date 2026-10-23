# `com.oneterm.extract` — 教务多源导入、结构化流式抽取与事件管理模块

## 1. 模块职责
本模块对应 PRD **F2 导入与结构化抽取**，负责：
1. **多源教务文件解析 (`POST /api/extract/file`)**：
   - `.txt`：UTF-8 读取（自动剥离 BOM）。
   - `.xlsx`：通过 Apache POI `XSSFWorkbook` 遍历所有工作表的非空单元格，拼接为带工作表头部的结构化文本。
   - 图片（`.png`, `.jpg`, `.jpeg`, `.webp`）：调用统一网关 `LlmGateway.extractTextFromImage`（`vision` 角色）转换为文字，消耗计入用户每日 Token 额度。
2. **大模型 SSE 流式抽取 (`POST /api/extract/stream`)**：
   - 加载带版本号的提示词模板 `classpath:prompts/extract-v1.txt`，内置**防提示词注入（Prompt Injection Defense）**声明，将用户文本包裹在 `<user_academic_text>` 标签内并声明仅作为待处理教务数据。
   - 通过 `SseEventPublisher` 推送 `progress`（「正在识别第 N 条事件」）、`delta`（流式增量 JSON）与 `done`（抽取出的结构化事件草稿列表）。
   - **自动重试保障**：由无 Spring 依赖的纯函数 `EventJsonParser.parse` 解析并校验必填字段（含 `sourceText` 原文追溯片段、`EventType` 枚举与 ISO 8601 时间范围）；若首次解析失败，自动调用 `llmGateway.chat(...)` 重试一次，仍失败则推送 `VALIDATION_FAILED` 错误事件。
3. **事件确认入库与增删改查 (`/api/events/**`)**：
   - 所有接口通过 `CurrentUserProvider.requireCurrentUserId()` 获取当前登录用户 `userId`，全部 SQL 强制携带 `WHERE user_id = ?`。
   - 根据 `id` 修改或删除时若受影响行数为 `0`（资源不存在或跨用户越权访问），统一抛出 `BusinessException(ErrorCode.NOT_FOUND)` 返回 `404`。
   - 批量入库（`POST /api/events/batch`）与单条增删改时，同步维护 `chunks` 表中的原文切片及 `float32` Little-Endian BLOB 向量（`VectorUtils.toFloat32Blob`），使导入后 RAG 问答立即可用。

## 2. 目录结构
- `controller/ExtractController.java`：文件上传解析与 SSE 流式抽取接口。
- `controller/EventController.java`：事件批量入库、条件查询、单条新增/修改/删除接口。
- `service/ExtractService.java`：多源解析编排、提示词组装、流式回调与解析失败自动重试逻辑。
- `service/EventService.java`：事件持久化事务管理、`user_id` 租户隔离校验与 `chunks` 向量同步。
- `core/EventJsonParser.java`：无 Spring 依赖的 JSON 纯函数解析器（剥离 Markdown 代码块、校验枚举与必填字段、标准化 `Asia/Shanghai` ISO 8601 时间）。
- `core/SpreadsheetTextExtractor.java`：无 Spring 依赖的 `.txt` 与 `.xlsx` 字节流转文本纯函数工具。
- `dto/`：对齐 `docs/api/openapi.yaml` 的请求与响应数据对象。
