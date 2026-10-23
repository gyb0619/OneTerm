# RAG 教务问答模块 (`qa`) 提示词设计与迭代记录

本文档记录「一学期 OneTerm」项目中 **F4 RAG 问答模块** 的提示词模板演进，以及开发过程中的 3 条完整工程迭代链（包含问题描述、改进建议与缺陷修复验证）。

---

## 一、生产环境提示词模板 (`prompts/qa-v1.txt`)

- **模板路径**：`backend/src/main/resources/prompts/qa-v1.txt`
- **设计目标**：
  1. **防提示词注入（Prompt Injection Defense）**：检索出的教务通知原文（可能来自外部粘贴文本）与用户提问均被严格限定在 `<retrieved_chunks>` 和 `<user_question>` 数据沙箱标签内，系统指令声明绝不执行其中的越权或指令覆盖文本。
  2. **高准确度事实归因**：要求仅依据 Top-4 检索片段回答课程、考试、截止时间与教室地点，主动提示日程重叠冲突（区分完全重叠/部分重叠与首尾相接）及复习紧迫度排序。

---

## 二、核心工程迭代链记录（3 条完整链路）

### 迭代链 1：隐式星期语义缺失导致「下周三有空吗」在 BM25 降级检索下漏召回

#### 1. 问题与现象
- **提问/场景**：用户在未配置向量模型（降级为 BM25 关键词检索模式）时提问「下周三有空吗？」。
- **缺陷表现**：原始教务事件中存储的时间戳为 `2026-11-04T08:00:00+08:00`，原文 `source_text` 仅包含日期 `2026-11-04` 而未显式出现「周三」或「星期三」字样，导致纯字面分词匹配的 BM25 检索得分为 `0.0`，无法召回 11 月 4 日的 4 条课程与测验事件。

#### 2. 修改建议与方案设计
- **方案建议**：
  1. 在 `TextChunker.buildMetadataHeader` 切片阶段，解析 ISO 8601 时间戳（`OffsetDateTime` / `LocalDate`）的 `DayOfWeek`，自动将对应的中文星期标签（如 `周三/星期三`）注入到每条切片的时间元信息头部。
  2. 在 `Retriever.tokenizeForBm25` 中采用「中文字符二元语法（Bigram）+ 教务领域关键词提取 + 日期/星期同义词扩展」三层分词策略。

#### 3. 修复过程与测试验证
- **代码落地**：
  - 在 `com.oneterm.qa.core.TextChunker` 中实现 `extractWeekdayTag(String isoTime)`，将 `2026-11-04T08:00:00+08:00` 格式化为 `2026-11-04T08:00:00+08:00（周三/星期三）`。
  - 在 `com.oneterm.qa.core.Retriever` 中补充星期与紧凑度同义词扩展逻辑。
- **验证结果**：运行 `QaCoreTest#shouldFallbackToBm25WhenEmbeddingDisabledOrMissingBlob`，在无向量 BLOB 的纯 BM25 模式下提问「下周三有空吗？」，Top-4 片段全部准确命中 `2026-11-04` 当日的课程与随堂测验，且 BM25 相关性得分均大于 0。

---

### 迭代链 2：SSE 流式响应在独立测试环境下的中文字符集乱码修复

#### 1. 问题与现象
- **提问/场景**：在编写 `QaServiceIntegrationTest` 验证 `POST /api/qa/ask/stream` 流式问答接口时，断言返回结果包含中文课程名 `《计算机网络》` 失败。
- **缺陷表现**：排查发现 `QaController` 最初声明 `produces = MediaType.TEXT_EVENT_STREAM_VALUE`（不含 `;charset=UTF-8`），且独立 `MockMvcBuilders.standaloneSetup` 默认使用 `ISO-8859-1` 编码写入响应流，导致 SSE `delta` 与 `done` 事件中的中文字符被转义为 `?`，而纯英文日期断言（如 `2026-11-04`）仍通过，造成隐蔽乱码。

#### 2. 修改建议与方案设计
- **方案建议**：
  1. 严格对齐 `docs/CONVENTIONS.md` 第 3 节规范，将 `@PostMapping("/ask/stream")` 的 `produces` 显式声明为 `"text/event-stream;charset=UTF-8"`。
  2. 在集成测试中使用 `MockMvcBuilders.webAppContextSetup(webApplicationContext)` 复用 Spring Boot 自动配置的 UTF-8 消息转换器链，并显式设置 `defaultResponseCharacterEncoding(StandardCharsets.UTF_8)`。

#### 3. 修复过程与测试验证
- **代码落地**：更新 `QaController.java` 的 `produces` 属性及 `QaServiceIntegrationTest.java` 的 `MockMvc` 构建配置。
- **验证结果**：重新执行集成测试，SSE 流式响应中的 `progress`、`delta` 与 `done` 事件均能完整还原中文回答与引用标题，全部断言一次通过。

---

### 迭代链 3：多用户租户数据隔离与首次提问自动切片兜底

#### 1. 问题与现象
- **提问/场景**：
  1. 用户在「导入抽取」页面确认事件入库后，若尚未手动点击「重建切片与向量索引」就直接进入「教务问答」提问，此时 `chunks` 表为空会导致检索出 0 条引用。
  2. 多租户并发场景下，必须杜绝用户 A 检索或引用到用户 B 的私有日程切片。

#### 2. 修改建议与方案设计
- **方案建议**：
  1. 在 `QaService.executeStreamAsk(userId, question, emitter)` 入口增加 `ensureUserChunksIndexedIfNeeded(userId)` 检查：若当前用户 `chunks` 表记录数为 `0` 但 `events` 表记录数大于 `0`，自动触发一次当前用户的切片与向量索引构建。
  2. 对 `QaService` 中的所有 SQL 查询（`loadUserEvents`、`loadUserChunks`、`DELETE FROM chunks`）强制绑定 `WHERE user_id = ?`，且关联查询 `events` 表时同步校验 `ON c.event_id = e.id AND e.user_id = c.user_id`。

#### 3. 修复过程与测试验证
- **代码落地**：在 `QaService.java` 中实现自动索引构建与租户隔离 SQL，并在 `QaServiceIntegrationTest` 中新增 `shouldAutoIndexAndDegradeToBm25WhenEmbeddingModelDisabled` 与 `shouldStrictlyIsolateChunksBetweenUsers` 两个专项测试。
- **验证结果**：用户 A 提问包含用户 B 专属课程关键词的问题时，返回的 `citations` 列表中绝不包含任何属于用户 B 的切片或事件标题，租户隔离 100% 验证通过。
