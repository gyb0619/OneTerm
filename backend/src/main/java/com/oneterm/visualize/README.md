# 知识点交互式可视化工坊模块 (`com.oneterm.visualize`)

## 1. 模块定位与职责

`visualize` 模块负责「一学期 OneTerm」中的 **F5 知识点可视化工坊**：
- 支持用户在考试、课程或考前复习清单中输入计算机科学知识点（第一版支持**算法与数据结构**、**计算机网络协议**两大类，如「冒泡排序」「TCP 三次握手」「快速排序」「滑动窗口协议」）。
- 调用统一大模型网关（`LlmGateway`）结合带版本号的提示词模板（`prompts/visualize-v1.txt`，版本 `v1.0`），通过 SSE 流式生成包含进度/速度滑块（`<input type="range">`）与控制按钮（播放/暂停、单步、重置）的单文件完整 HTML。
- 在入库与下发前端前，通过无框架依赖的纯函数安全校验器 `HtmlSandboxValidator` 强制执行安全沙箱检查；若首次校验未通过则自动触发一次重试，重试仍未通过则返回 `422 VALIDATION_FAILED` 错误事件。
- 前端使用 `<iframe sandbox="allow-scripts" srcDoc={html} />`（绝不添加 `allow-same-origin`）在隔离源中渲染交互动画。

---

## 2. 目录与分层结构

```text
backend/src/main/java/com/oneterm/visualize/
├── core/
│   └── HtmlSandboxValidator.java         # 纯 Java 零依赖安全沙箱校验器（体积、外链、网络 API 与分类校验）
├── dto/
│   ├── GenerateVisualizationRequest.java # 流式生成请求 DTO
│   └── VisualizationDto.java             # 可视化详情与列表响应 DTO（对齐 OpenAPI）
├── VisualizationRepository.java          # Spring JDBC 持久化层（强制携带 WHERE user_id = ?）
├── VisualizeService.java                 # 业务编排：提示词组装、SSE 流式生成、失败自动重试一次、CRUD
├── VisualizeController.java              # REST + SSE 接口控制器
└── README.md                             # 模块说明文档
```

关联资源与前端目录：
- 提示词模板：`backend/src/main/resources/prompts/visualize-v1.txt`
- 后端单元测试：`backend/src/test/java/com/oneterm/visualize/`
- 前端可视化工坊页：`frontend/src/features/visualize/`

---

## 3. 安全沙箱双层防御机制

### 3.1 后端静态安全校验 (`HtmlSandboxValidator`)
1. **代码块剥离与结构完整性**：自动剥离大模型可能包裹的 ` ```html ... ``` ` 标记，校验非空且包含完整的 `<html>...</html>` 与 `<body>` / `<script>` 结构。
2. **体积上限控制**：严格限制 UTF-8 字节数 ≤ `100KB`（`102,400` 字节），防止超大 DOM 或内存耗尽攻击。
3. **零外部网络请求拦截**：精准拦截以下所有外部通信与外链特征：
   - 协议外链：`http://`、`https://`、协议相对路径 `//`（如 `src="//..."`、`href="//..."`、`url(//...)`、`"//cdn..."`）
   - 编程网络接口：`fetch(`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`navigator.sendBeacon`
   - 外部资源加载标签与语法：`<script src=...>`、`<link href=...>`、`@import`、`import(` 动态模块导入及嵌套 `<iframe/object/embed>`
4. **知识点分类与防注入校验**：仅允许第一版支持的算法与数据结构、计算机网络协议类知识点，拦截非支持领域及提示词越权注入指令。

### 3.2 前端浏览器沙箱隔离 (`<iframe sandbox="allow-scripts">`)
- 前端固定使用 `<iframe sandbox="allow-scripts" srcDoc={activeViz.html} />`。
- **严禁添加 `allow-same-origin`**：确保 iframe 内容运行在派生的独立透明源（opaque origin）中，彻底阻断其读取宿主页面的 `document.cookie`、`localStorage` 或同源会话凭证。

---

## 4. 接口清单（严格对齐 OpenAPI 契约）

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| `POST` | `/api/visualize/generate/stream` | SSE 流式生成知识点可视化 HTML（自动关联/创建 `review_topics`，校验不通过自动重试一次） |
| `GET` | `/api/visualize` | 查询当前登录用户的可视化历史列表（支持 `?topicId=` 过滤） |
| `GET` | `/api/visualize/{id}` | 获取单条可视化详情（跨用户越权访问返回 `404 NOT_FOUND`） |
| `DELETE` | `/api/visualize/{id}` | 删除单条可视化记录（跨用户越权访问返回 `404 NOT_FOUND`） |
