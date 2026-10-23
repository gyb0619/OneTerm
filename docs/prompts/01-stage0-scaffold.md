# 阶段 0：脚手架与接口契约迭代记录

## 1. 阶段目标与输入提示词

按照 `docs/prompts/00-master.md` 阶段 0 的要求，独立完成以下交付物并分步提交推送：

1. 仓库顶层目录结构：`backend/`、`frontend/`、`docs/`、`docker/`，以及 `.gitignore`（忽略数据库文件、`.env`、构建产物）。
2. 后端工程：基于 Java 21 + Spring Boot 4.1.1 + Maven + SQLite + Spring JDBC + Flyway + Spring Security 的可启动工程骨架，建齐 `common`、`llm`、`auth`、`admin`、`extract`、`calendar`、`qa`、`visualize` 八个包。
3. 前端工程：基于 React + Vite + TypeScript + Tailwind CSS + Zustand + ECharts 的路由骨架、统一 HTTP 请求封装（含 CSRF 头读取与错误统一解析）、统一 SSE 订阅 Hook（`useSseStream`）与清爽学院风设计变量。
4. `docs/api/openapi.yaml`：覆盖 PRD 全部功能点的 OpenAPI 3.0 契约，标明请求、响应、错误码及所属子代理（`x-subagent`）。
5. `backend/src/main/resources/db/migration/V1__init.sql`：完全对照 PRD 第 7 节建立 7 张核心表。
6. `docs/CONVENTIONS.md`：约定统一错误响应 `{code, message}`、四类 SSE 事件（`progress`、`delta`、`done`、`error`）、ISO 8601 时间格式、`Asia/Shanghai` 时区、Cookie + CSRF 鉴权与租户 `user_id` 隔离规则。
7. `llm` 包接口骨架与 `MockLlmGateway` 实现：支持流式对话、识图转文字与 `float32` 向量生成，并对固定示例输入返回预置抽取结果、问答回答及「冒泡排序」「TCP 三次握手」交互式单文件 HTML。
8. `docs/samples/`：包含 3 条课程、3 条考试通知、2 条作业截止、1 条社团活动的真实感示例数据，并预置 2 处时间冲突（部分重叠与完全重叠）和 1 处首尾相接边界用例。

---

## 2. 关键问题排查与修复过程

### 问题 1：Spring Boot 4.1.1 中 Flyway 自动配置模块拆分
- **现象**：在核对 Spring Boot 4.1.1 依赖管理清单时发现，Spring Boot 4.x 将 Flyway 的自动配置从早期的 `spring-boot-autoconfigure` 拆分到了独立的 `spring-boot-starter-flyway`（内部依赖 `spring-boot-flyway` 与 `flyway-core 12.4.0`）。若仅引入 `flyway-core`，在应用启动时 Flyway 不会自动执行 `db/migration/V1__init.sql`。
- **修复思路**：在 `backend/pom.xml` 中显式引入 `org.springframework.boot:spring-boot-starter-flyway`，并在 `OneTermApplicationTests` 中通过 `JdbcTemplate` 查询 `sqlite_master` 验证 7 张业务表在应用启动时被自动创建。

### 问题 2：SQLite 数据库文件父目录不存在导致连接异常
- **现象**：SQLite JDBC 在打开 `jdbc:sqlite:./data/oneterm.db` 时，如果 `./data` 目录尚未创建，驱动会抛出无法打开数据库文件的异常。
- **修复思路**：在 `OneTermApplication` 启动入口及 `@PostConstruct` 初始化方法中增加 `ensureSqliteDirectory()`，自动检测并创建数据库文件所在的父目录；同时在测试配置 `src/test/resources/application.yml` 中将测试库指向 `jdbc:sqlite:target/test-oneterm.db`，避免污染工作区。

### 问题 3：Spring Framework 7 / Spring Boot 4 中 `HttpStatus` 枚举项弃用警告
- **现象**：执行 `mvn test` 编译 `com.oneterm.common.ErrorCode` 时，编译器提示 `HttpStatus.UNPROCESSABLE_ENTITY` 与 `HttpStatus.LOCKED` 存在过时（deprecation）警告。
- **修复思路**：在 `ErrorCode.java` 中改用 `HttpStatus.valueOf(422)` 与 `HttpStatus.valueOf(423)` 构造对应状态码，消除全部编译期过时 API 警告。
