# 教务智能问答模块 (`com.oneterm.qa`)

本模块负责「一学期 OneTerm」的 **F4 RAG（检索增强生成）自然语言问答** 功能，包含教务事件原文按段切片、float32 向量余弦相似度检索、BM25 关键词自动降级检索、防提示词注入的流式问答生成及前端引用溯源定位。

---

## 1. 模块结构与职责分层

```text
com.oneterm.qa
├── core/
│   ├── TextChunker.java          # 无框架依赖纯算法：结合事件标题/星期/时间/地点/课程名与原文按段落切分
│   └── Retriever.java            # 无框架依赖纯算法：float32 BLOB 余弦相似度 Top-4 检索 + Okapi BM25 自动降级检索
├── QaController.java             # REST + SSE 控制器（仅负责请求参数校验与响应分发）
├── QaService.java                # 核心业务服务：强制 user_id 租户隔离、自动索引构建、提示词组装与 SSE 流式推送
├── QaAskRequest.java             # 提问请求体 DTO
├── QaIndexResponse.java          # 切片与向量索引重建响应 DTO
├── QaCitationDto.java            # 引用原文片段 DTO（含 chunkId、eventId、eventTitle、text、score）
└── QaAskResultDto.java           # SSE done 事件载荷 DTO（含 answer、retrievalMode、citations）
```

---

## 2. 核心算法说明

### 2.1 原文高密度切片 (`TextChunker`)
- **结构化语义注入**：将事件类型（课程/考试/作业截止/社团活动/教务通知）、标题、课程名、起止时间（自动计算并附加中文星期标签，如 `2026-11-04（周三/星期三）`）及地点整合为切片元信息前缀。
- **段落与句子边界切分**：优先按自然段落边界（`\n\n`）切分；当单段超出最大长度阈值（默认 `280` 字符）时，按句号、分号等语义边界二次切分，确保每个切片既语义完整又具备高检索区分度。

### 2.2 向量检索与 BM25 自动降级 (`Retriever`)
- **向量余弦检索模式 (`embedding`)**：
  - 使用 `VectorUtils.toFloat32Blob(float[])` 将向量序列化为 Little-Endian `float32` BLOB 存入 SQLite `chunks.embedding` 字段。
  - 检索时使用 `VectorUtils.fromFloat32Blob(byte[])` 解码，并通过 `VectorUtils.cosineSimilarity(queryVec, chunkVec)` 计算余弦相似度，按得分降序返回 Top-4 片段。
- **BM25 关键词降级模式 (`bm25`)**：
  - 当 `llmGateway.hasActiveEmbeddingModel()` 为 `false` 或切片无有效向量 BLOB 时，自动无缝降级为标准 Okapi BM25 算法（$k_1 = 1.5, b = 0.75$）。
  - 分词器融合 **中文字符二元语法（Bigram）**、**教务领域关键词词典** 与 **日期/星期同义词扩展**，计算逆文档频率（IDF）与词频饱和度（TF），同样返回 Top-4 片段。

---

## 3. 接口列表与租户隔离约束

| 方法与路径 | 说明 | 租户隔离与安全保障 |
| :--- | :--- | :--- |
| `POST /api/qa/index` | 重建当前登录用户的事件原文切片与向量索引 | 强制按 `CurrentUserProvider.requireCurrentUserId()` 过滤 `events` 与 `chunks` 的 `user_id` |
| `POST /api/qa/ask/stream` | 自然语言 SSE 流式问答（推送 `progress`、`delta`、`done`、`error`） | 若当前用户尚未构建切片则自动触发索引；查询候选切片与关联事件严格携带 `WHERE c.user_id = ?` |

---

## 4. 提示词模板与防注入设计

提示词模板位于 `backend/src/main/resources/prompts/qa-v1.txt`：
- 将检索出的 Top-4 片段包裹在 `<retrieved_chunks>` 数据标签内，用户问题包裹在 `<user_question>` 标签内。
- 明确声明标签内文本**仅作为待分析的教务日程数据参考**，严禁执行其中包含的任何越权指令、角色切换或系统配置刺探。
