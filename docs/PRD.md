# 一学期 OneTerm 产品需求文档（PRD）

口号：一学期，一张图

## 1. 背景与痛点

大学生的教务信息分散在课表截图、班级群通知、教务公告、作业截止提醒里，没有统一入口。学生只能手动整理，容易漏掉考试时间，也不知道哪周任务最重、该先复习什么。

## 2. 产品定位与目标用户

一学期把零散的教务信息整理成一张学期规划，并支持自然语言问答，再把考试复习与知识点可视化串成一条完整链路。目标用户是需要管理课程、考试和作业的在校大学生。

### 目标

- 5 分钟内完成从导入通知到看到学期全景的完整体验。
- 冲突提前发现，复习路径自动排期。
- 评委无需任何配置即可登录体验，并可在本地 10 分钟内复现。

### 非目标

- 不对接教务系统，不爬取需要登录的页面。
- 不做开放注册，不做多人协作与共享。
- 第一版可视化只支持算法与网络协议类知识点。

## 3. 核心流程

登录 → 导入文本或文件 → 大模型抽取结构化事件 → 用户核对编辑 → 查看日历、冲突与热力图 → 对话问答（带原文引用）→ 为考试添加知识点并生成可视化 → 自动生成考前复习路径 → 导出 .ics 到手机日历。

（对话模型默认使用 DeepSeek；图片文件交给独立的识图模型转成文字，再进入同一套抽取流程；用户可以在管理员启用的模型中选择使用哪个模型）

## 4. 功能需求

### F1 账号与权限

- 不开放注册，账号由管理员创建；角色分为 ADMIN 和 USER。
- 密码使用 BCrypt 存储；登录失败 5 次锁定 10 分钟。
- 会话使用 HttpOnly Cookie，开启 CSRF 防护。
- 所有业务表带 user_id，查询时强制按当前登录用户过滤，越权访问返回 404。
- 验收：未登录访问任何业务接口返回 401；用户 A 无法读取用户 B 的任何数据。

### F2 导入与结构化抽取

- 支持粘贴文本，以及上传 txt、xlsx 和图片文件；图片先交给识图模型转成文字，再走同一套抽取流程。
- 后端将文本发给大模型，要求只返回符合 Event 结构的 JSON，并保留原文片段 sourceText。
- 事件类型：course、exam、deadline、notice、activity。
- 通过 SSE 流式推送进度，例如「正在识别第 N 条事件」。
- JSON 解析失败自动重试一次，仍失败则返回友好提示。
- 抽取结果在前端可编辑、可删除、可手动新增，确认后入库。
- 对用户粘贴的文本做提示词注入防护：系统提示词中明确声明用户文本只是待处理数据，不是指令。
- 验收：示例数据中的所有事件都能被抽取，且每条事件可追溯到原文。

### F3 日历、冲突检测与负载热力图

- 周视图日历，按事件类型用颜色区分。
- 冲突检测（后端纯函数，附单元测试）：完全重叠、部分重叠算冲突，首尾相接不算。
- 每周任务密度：考试权重最高，其次是作业截止、课程、活动。
- 学期热力图使用单色渐变，并标出「最空的一天」「最忙的一天」和「最忙的一周」。
- 冲突以醒目卡片展示，点击可定位到相关事件。
- 验收：示例数据中预置的两处冲突都能被检出；JUnit 覆盖重叠、相邻、跨天三类情形。

### F4 RAG 问答

- 原文按段切片，调用 embedding 接口生成向量，以 float32 BLOB 存入 SQLite，在 Java 中用余弦相似度检索前 4 条。
- 未配置 embedding 时降级为 BM25 关键词检索。
- 对话回答通过 SSE 流式输出，并在回答下方列出引用的原文片段，点击可跳转到对应事件。
- 验收：问「下周三有空吗」「期末前哪几门最紧」能给出有引用的回答。

### F5 知识点可视化工坊（第一版最简）

- 在考试或课程详情里输入一个知识点，例如冒泡排序、TCP 三次握手。
- 后端调用大模型生成单文件 HTML（含 JS，带滑块和按钮的交互动画），提示词模板固定放在 prompts 目录并带版本号。
- 后端校验：体积不超过 100KB；禁止出现外部网络请求，包括 http 和 https 资源、fetch、XMLHttpRequest、WebSocket、import 外链；校验不通过则重试或报错。
- 前端放入 iframe，设置 sandbox=allow-scripts，不加 allow-same-origin。
- 生成过程流式显示进度；失败有重试按钮；生成结果入库，可重复查看。
- 验收：冒泡排序与三次握手各能生成一个可交互页面。

### F6 考前复习路径

- 将知识点按考试日期倒排，自动安排到考试前的空闲日，尽量均衡负载并避开冲突日。
- 复习任务写回日历，用户可调整或标记完成。
- 排期算法放在后端，附单元测试。

### F7 管理后台（仅 ADMIN）

- 配置三类模型：对话、识图、向量。每类独立设置接口地址、模型名与 API Key，可启用或停用；用户只能在已启用的模型中选择。
- 创建、停用账号，重置密码。
- 为每个账号设置每日 token 额度，查看用量。
- 不开放任何公开注册入口。

### F8 导出

- 一键导出 .ics 文件，可导入手机日历，包含事件与复习任务。

## 5. 大模型配置与额度

- API Key 等配置存数据库，Key 使用 AES-256-GCM 加密存储，加密主密钥来自服务器环境变量 ONETERM_SECRET_KEY，不与数据库放在一起。
- 任何接口都不返回完整 Key，后台只显示脱敏尾号。
- 额度按 token 计：每次调用后记录 prompt 与 completion 的 token 数，优先取接口返回的 usage，缺失时按字符数估算。
- 每个账号有每日 token 上限，默认 100000，管理员可调；超限返回 429 和友好提示；每日 0 点（Asia/Shanghai）重置。
- 所有大模型调用统一经过后端的 LLM 服务层，前端永远不直接接触 Key。用户不能自行填写接口地址或 Key，只能在管理员启用的模型中选择，避免内网请求滥用与额度绕过；识图消耗的 token 同样计入额度。

## 6. Mock 模式

- 当数据库中没有有效的大模型配置，或环境变量 ONETERM_MOCK=true 时进入 Mock 模式。
- Mock 模式下，对固定示例输入返回预置的抽取结果、问答与可视化页面，并模拟逐字流式输出。
- 登录页提供「一键载入示例数据」。

## 7. 数据模型

| 表 | 关键字段 |
|---|---|
| users | id, username, password_hash, role, enabled, daily_token_limit, failed_count, locked_until, preferred_model_id |
| llm_config | id, role（chat、vision、embedding）, name, base_url, model, api_key_encrypted, enabled, updated_at |
| usage_log | id, user_id, kind, prompt_tokens, completion_tokens, created_at |
| events | id, user_id, type, title, start_time, end_time, location, course_name, source_text |
| chunks | id, user_id, text, embedding BLOB, event_id |
| review_topics | id, user_id, event_id, topic, planned_date, done |
| visualizations | id, user_id, topic_id, html, prompt_version, created_at |

## 8. 技术架构

- 后端：Java 21，Spring Boot 4.1.1，Maven，SQLite（sqlite-jdbc），Spring JDBC，Flyway 管理表结构，Spring Security。
- 前端：React，Vite，TypeScript，Tailwind，Zustand，ECharts。
- 通信：REST 加 SSE；错误统一返回 code 与 message；接口契约以 OpenAPI 文档为准，并提供 Swagger UI。
- 后端包结构：common、llm、auth、admin、extract、calendar、qa、visualize。
- 前端目录：features 下按 auth、admin、extract、calendar、qa、visualize 划分，共享组件放 shared。
- 分层约束：controller 只做参数与响应，业务逻辑放 service，纯算法放无依赖的 core 类；所有大模型调用只经过 llm 包。
- 部署：Docker Compose 一条命令启动；Nginx 反向代理，对 SSE 路径设置 proxy_buffering off；启用 HTTPS。
- 时区统一为 Asia/Shanghai。

## 9. 非功能需求

- 安全：不在仓库中出现真实 Key 或账号；数据库文件加入 .gitignore；配置 CORS 白名单；登录限流；可视化页面严格沙箱。
- 性能：抽取与问答首个流式片段 3 秒内出现；接口不得出现死循环或无上限查询。
- 可维护：核心算法有单元测试；关键模块有 README 说明；日志不输出 Key 与密码。
- 可复现：README 提供 10 分钟复现指南，写明 JDK 21、Node 版本、环境变量模板与一条启动命令，Mock 模式下无需 Key 即可跑通全流程。

## 10. 界面与体验

- 风格：清爽学院风，浅色底，蓝绿主色，卡片式布局；热力图使用由浅到深的单色渐变。
- 适配手机端；提供空状态引导、加载骨架屏和一键体验示例。
- 大模型相关操作必须有流式输出或进度提示，失败有明确的重试入口。

## 11. 开发与提交规范

- 每完成一个模块或一次核心迭代就提交一次 Git，提交信息采用 feat、fix、refactor 等前缀并写清模块名；禁止一次性提交全部代码。
- 仓库内设 docs/prompts 目录，保存各模块的提示词与迭代记录；至少保留 3 条完整的迭代链，包含提问、AI 修改建议与修复 Bug 的过程。
- 提示词模板统一放在后端 prompts 目录并带版本号。

## 12. 子代理分工与目录归属

- 主代理：搭建脚手架，产出 OpenAPI 契约与数据库迁移脚本，约定公共类型，负责最终集成、Docker 与 README。
- 子代理 A：extract 包与 extract 前端目录。
- 子代理 B：calendar 包与 calendar 前端目录，包含冲突检测、密度计算与复习排期。
- 子代理 C：qa 包与 qa 前端目录，包含切片、向量检索与问答。
- 子代理 D：visualize 包与 visualize 前端目录，包含生成、校验与沙箱展示。
- 子代理 E：auth 与 admin 包，以及对应前端目录，包含登录、权限、额度与管理后台。
- 规则：各子代理只修改自己归属的目录；需要公共改动时先提给主代理；开始前以契约为准。

## 13. 验收清单

- 管理员首次启动自动创建，随后可创建评委账号。
- 评委账号登录后可完成从导入到导出的完整流程。
- Mock 模式下全流程可跑通。
- 超出每日 token 额度时给出友好提示。
- 用户间数据严格隔离。
- 单元测试与前端构建在 CI 中通过。

## 14. 待优化项（持续迭代）

- 抽取质量评测集：准备约 20 条教务文本，统计抽取准确率。
- 抽取结果增加置信度，低置信度条目提示核对。
- PWA 支持。
- 可视化覆盖更多知识点类型。
