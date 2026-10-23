# 一学期 OneTerm — 验收核对报告（对照 PRD 第 13 节）

本报告对照 `docs/PRD.md` 第 13 节验收清单及各功能模块（F1~F8）验收标准，对系统实现与自动化测试结果进行逐项核对。

---

## 一、PRD 第 13 节核心验收清单核对

| 序号 | 验收项 | 状态 | 验证方式与对应实现证据 |
| :--- | :--- | :--- | :--- |
| 1 | **管理员首次启动自动创建，随后可创建评委账号** | **通过** | `AdminInitializer` 在启动时检测 `users` 表，若无管理员则从环境变量 `ONETERM_ADMIN_USERNAME` / `ONETERM_ADMIN_PASSWORD` 自动创建 BCrypt 加密的 `ADMIN` 账号；管理员可通过 `POST /api/admin/users` 创建评委账号（已由 `AuthAndSecurityTest` 与 `AdminAndQuotaGatewayTest` 验证）。 |
| 2 | **评委账号登录后可完成从导入到导出的完整流程** | **通过** | 评委登录或点击「一键载入示例数据」后，可依次完成：文本/文件/图片导入与流式抽取 (`POST /api/extract/stream`) -> 核对入库 (`POST /api/events/batch`) -> 查看日历冲突与热力图 (`GET /api/calendar/overview`) -> 带引用流式问答 (`POST /api/qa/ask/stream`) -> 生成「冒泡排序」「TCP 三次握手」可视化 (`POST /api/visualize/generate/stream`) -> 自动排期复习路径 (`POST /api/calendar/review-topics/schedule`) -> 导出 `.ics` (`GET /api/calendar/export.ics`)。 |
| 3 | **Mock 模式下全流程可跑通** | **通过** | 当 `ONETERM_MOCK=true` 或无有效模型配置时，`RoutingLlmGateway` 自动委托 `MockLlmGateway`，模拟逐字 SSE 流式输出、识图、64 维归一化向量及预置可视化 HTML，无需任何外部 API Key 即可跑通全链路。 |
| 4 | **超出每日 token 额度时给出友好提示** | **通过** | `RoutingLlmGateway` 在每次调用（含对话、抽取、问答、可视化、识图、向量）前汇总当日（`Asia/Shanghai` 0 点起）已用 Token，达到或超过 `daily_token_limit` 时立即返回 HTTP `429`（`QUOTA_EXCEEDED`：「今日大模型 Token 额度已用尽，请明日再试或联系管理员调整额度」），已由 `AdminAndQuotaGatewayTest` 验证。 |
| 5 | **用户间数据严格隔离** | **通过** | 所有业务表（`events`、`chunks`、`review_topics`、`visualizations`、`usage_log`）均带 `user_id` 字段，所有查询、更新、删除强制绑定当前登录 `userId`；跨用户越权访问一律返回 `404 NOT_FOUND`（已由 `ExtractAndEventIntegrationTest`、`CalendarServiceTest`、`QaServiceIntegrationTest`、`VisualizeServiceTest` 跨租户测试验证）。 |
| 6 | **单元测试与前端构建在 CI 中通过** | **通过** | 已配置 `.github/workflows/ci.yml`；后端 `mvn -f backend/pom.xml test` 共 **59 项测试全部通过（0 失败）**；前端 `npm run build`（`tsc -b && vite build`）**零错误通过**。 |

---

## 二、F1 ~ F8 专项验收核对

| 模块 | PRD 专项验收标准 | 核对结果 |
| :--- | :--- | :--- |
| **F1 账号与权限** | 未登录访问任何业务接口返回 401；连续失败 5 次锁定 10 分钟（返回 423）；用户 A 无法读取用户 B 的任何数据。 | **通过**（`AuthAndSecurityTest` 完整覆盖） |
| **F2 导入与抽取** | 示例数据中的所有 9 条事件都能被抽取，且每条事件可追溯到原文 `sourceText`；JSON 解析失败自动重试一次；内置防提示词注入声明。 | **通过**（`EventJsonParserTest` & `ExtractAndEventIntegrationTest` 完整覆盖） |
| **F3 日历与冲突** | 示例数据中预置的两处冲突（11-04 下午部分重叠、11-06 晚完全重叠）均被检出，11-04 上午相邻课程不误判；JUnit 覆盖重叠、相邻、跨天三类情形；标出最空天、最忙天、最忙周。 | **通过**（`ConflictDetectorTest` & `WorkloadCalculatorTest` 完整覆盖） |
| **F4 RAG 问答** | 向量以 `float32` BLOB 存 SQLite，余弦相似度检索前 4 条，无向量模型时降级 BM25；问「下周三有空吗」「期末前哪几门最紧」能给出带引用的流式回答，点击引用可跳转事件。 | **通过**（`QaCoreTest` & `QaServiceIntegrationTest` 完整覆盖） |
| **F5 可视化工坊** | 冒泡排序与 TCP 三次握手各能生成一个可交互页面；体积 ≤ 100KB，禁止任何外部网络请求；前端使用 `sandbox="allow-scripts"`（无 `allow-same-origin`）iframe 展示。 | **通过**（`HtmlSandboxValidatorTest` 17 项安全边界测试 & `VisualizeServiceTest` 完整覆盖） |
| **F6 考前复习路径** | 知识点按考试日期倒排，避开冲突日并均衡负载，写回日历，附单元测试。 | **通过**（`ReviewPathSchedulerTest` 完整覆盖） |
| **F7 管理后台** | 三类模型配置，API Key 使用 AES-256-GCM 加密，接口仅返回脱敏尾号；账号管理与每日额度配置。 | **通过**（`AdminAndQuotaGatewayTest` 完整覆盖） |
| **F8 导出** | 一键导出 `.ics` 文件，包含事件与已排期复习任务。 | **通过**（`CalendarServiceTest` 完整覆盖） |
