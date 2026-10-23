# 阶段 1 汇总与阶段 2 集成交付迭代记录

## 1. 阶段 1 五个子代理并行开发协调

在阶段 1 中，主代理将服务默认端口统一调整为 `8789`，并在 `com.oneterm.common` 中提前提供了统一的 `VectorUtils`（`float32` Little-Endian BLOB 互转与余弦相似度计算）和 `SecurityCurrentUserProvider`，随后并行启动了五个子代理：

- **子代理 A (`extract`)**：完成 `extract-v1.txt` 防注入提示词、`EventJsonParser`、`SpreadsheetTextExtractor`、SSE 流式抽取（含自动重试一次）及前端导入工作台（8 项单测通过）。
- **子代理 B (`calendar`)**：完成 `ConflictDetector`、`WorkloadCalculator`、`ReviewPathScheduler`、`IcsExporter` 四个纯函数算法与日历全景接口、前端周视图/单色渐变热力图/冲突卡片/复习面板（10 项单测通过）。
- **子代理 C (`qa`)**：完成 `TextChunker`、`Retriever`（`float32` BLOB 余弦检索 + BM25 自动降级）、`qa-v1.txt` 与前端流式问答及引用跳转日历联动（7 项单测通过）。
- **子代理 D (`visualize`)**：完成 `HtmlSandboxValidator`（100KB 上限 + 零外链拦截）、`visualize-v1.txt`、SSE 流式生成与 `sandbox="allow-scripts"` 隔离渲染（22 项单测通过）。
- **子代理 E (`auth` & `admin`)**：完成 `AesGcmCrypto`（AES-256-GCM 加密与尾号脱敏）、`RoutingLlmGateway`（每日 Token 额度限制 429 与 `usage_log` 统计）、Spring Security 会话与 CSRF 防护、连续 5 次失败锁定 10 分钟（423）、`demo-load` 一键载入全链路示例数据及管理后台（8 项单测通过）。

### 关键问题与修复思路：并行子代理 SQLite 锁竞争防护
- **问题分析**：SQLite 在写入时会锁定整个数据库文件。当 5 个子代理在同一工作区并行执行 `@SpringBootTest` 集成测试时，如果共享同一个 `target/test-oneterm.db`，极易触发 `[SQLITE_BUSY] The database file is locked`。
- **解决方案**：在并行任务指令中规范各子代理的集成测试使用各自独立的 SQLite 测试库文件（`target/test-extract.db`、`target/test-calendar.db`、`target/test-qa.db`、`target/test-visualize.db`、`target/test-auth-admin.db`），使 59 项后端测试无论是单独运行还是全量一起执行均 100% 稳定通过。

---

## 2. 阶段 2 全链路集成与 8789 端口一站式托管

### 问题 1：单端口 `8789` 同时提供前端 SPA 页面、REST/SSE 接口与离线 Swagger UI
- **背景**：用户要求项目完成后运行在 `8789` 端口，且红线要求所有前端依赖不依赖外部 CDN、保证离线可复现。
- **实现方案**：
  1. 新增 `com.oneterm.common.WebSpaAndDocsConfig`，将 `frontend/dist/assets/` 映射为静态资源路径 `/assets/**`，并将 `/`、`/login`、`/extract`、`/calendar`、`/qa`、`/visualize`、`/admin` 统一回退到 `frontend/dist/index.html`。
  2. 提供内建零外部 CDN 依赖的 `/swagger-ui/index.html` 与 `/v3/api-docs/openapi.yaml`，支持在浏览器内直接预览 `docs/api/openapi.yaml` 契约并带自动 CSRF Token 发送在线调试请求。
  3. 在 `AppLayout.tsx` 中补全应用初始化时的 `GET /api/auth/me` 会话恢复与顶部栏一键退出登录逻辑。
