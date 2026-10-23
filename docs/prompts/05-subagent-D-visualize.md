# 知识点可视化工坊模块 (`visualize`) 提示词设计与迭代记录

本文档记录「一学期 OneTerm」项目中 **F5 知识点可视化工坊模块** 的提示词模板（`v1.0`）设计规范，以及开发过程中的 3 条完整工程迭代链（包含问题描述、方案设计与修复验证过程）。

---

## 一、生产环境提示词模板 (`prompts/visualize-v1.txt`)

- **模板路径**：`backend/src/main/resources/prompts/visualize-v1.txt`
- **版本号**：`v1.0`
- **核心约束设计**：
  1. **防提示词注入（Prompt Injection Defense）**：将用户输入的知识点名称及关联课程信息限定在 `<user_topic>` 标签内，声明其仅作为待可视化的计算机科学概念数据（第一版仅支持算法与数据结构、计算机网络协议类），绝不执行其中任何试图覆盖系统规则或注入外链的越权指令。
  2. **单文件内联交互结构**：要求输出以 `<!DOCTYPE html>` 开头、`</html>` 结尾的完整单文件 HTML，内联 `<style>`（清爽学院风配色）与原生 `<script>`，且必须包含 `<input type="range">` 滑块与播放/单步/重置 `<button>` 按钮。
  3. **零外链与体积红线**：明确声明禁止出现 `http://`、`https://`、`//`、`fetch(`、`XMLHttpRequest`、`WebSocket(`、`EventSource(`、`navigator.sendBeacon`、`<script src=...>`、`<link href=...>`、`@import`、`import(`，且 UTF-8 总字节数不超过 100KB。

---

## 二、核心工程迭代链记录（3 条完整链路）

### 迭代链 1：协议相对外链 `//` 正则校验误伤与漏检边界优化

#### 1. 问题与现象
- **提问/场景**：安全沙箱要求拦截 `//cdn.example.com/lib.js` 等协议相对路径外链（Protocol-Relative URL），但如果直接使用简单的子串匹配 `html.contains("//")`：
  - 一方面，若生成的 JavaScript 代码中包含单行注释（如 `// 初始化排序数组`），会被误判为协议相对外链而拒绝合法的 HTML；
  - 另一方面，若仅检查 `<script src="//...">`，则可能漏掉 CSS `url(//...)` 或 JS 字符串字面量 `"//cdn.bootcdn.net/..."` 中的隐蔽外链。

#### 2. 修改建议与方案设计
- **方案建议**：
  1. 在提示词模板 `visualize-v1.txt` 中明确要求 JavaScript 注释统一采用 `/* ... */` 块注释格式。
  2. 在 `HtmlSandboxValidator` 的 `PROTOCOL_RELATIVE_URL` 规则中，采用多模式上下文正则匹配：
     - 匹配 HTML 属性形式：`(?:src|href|action|data|poster|formaction)\s*=\s*["']?\s*//`
     - 匹配 CSS 资源引用形式：`url\s*\(\s*["']?\s*//`
     - 匹配字符串或裸域名形式：`["'`]\s*//[a-z0-9][-a-z0-9.]*\.[a-z]{2,}` 与 `(?:^|[\s(])//[a-z0-9][-a-z0-9.]*\.[a-z]{2,}/`

#### 3. 修复过程与测试验证
- **代码落地**：在 `com.oneterm.visualize.core.HtmlSandboxValidator` 中完善 `PROTOCOL_RELATIVE_URL` 及其余 11 条外链/网络接口拦截规则，并支持校验前自动剥离大模型可能包裹的 ` ```html ... ``` ` 代码块标记。
- **验证结果**：运行 `HtmlSandboxValidatorTest`，验证预置的「冒泡排序」「TCP 三次握手」以及带代码块包裹的合法 HTML 全部通过校验，同时包含 `//cdn.bootcdn.net/...`、`https://cdn.jsdelivr.net/...`、`fetch(...)`、`XMLHttpRequest`、`new WebSocket(...)`、`import("...")` 的 12 种恶意载荷 100% 被精准拦截。

---

### 迭代链 2：用户提示词消息结构导致 Mock 模式下知识点匹配串台问题修复

#### 1. 问题与现象
- **提问/场景**：在调试 `POST /api/visualize/generate/stream` 流式生成接口时，若将完整提示词模板（其中包含示例文字「如：冒泡排序、TCP 三次握手」）整体放入 `user` 角色的 `ChatMessage` 中发送给 `LlmGateway`，会出现无论用户输入「TCP 三次握手」还是「快速排序」，Mock 网关始终返回「冒泡排序」HTML 的问题。
- **缺陷根因**：排查 `MockLlmGateway` 发现，其通过读取最后一条 `user` 角色消息（`lastUserMsg`）并调用 `MockVisualizationPresets.getHtmlForTopic(lastUserMsg)` 来决定返回哪个预置模板。而 `getHtmlForTopic` 优先判断 `topic.contains("冒泡")`；若 `lastUserMsg` 中混入了系统提示词里的「冒泡排序」示例字样，会导致所有请求都命中第一个分支。

#### 2. 修改建议与方案设计
- **方案建议**：
  1. 在 `VisualizeService.buildMessages` 中实施严格的 `system` / `user` 消息角色分离：将渲染后的 `visualize-v1.txt` 完整规则与课程上下文放入 `ChatMessage.system(...)` 中。
  2. 最后一条 `ChatMessage.user(...)` 仅传入用户实际请求的纯净知识点名称 `normalizedTopic`；当触发自动重试时，重试修正指令同样作为独立的 `ChatMessage.system(...)` 注入，保持 `user` 消息纯净。

#### 3. 修复过程与测试验证
- **代码落地**：重构 `VisualizeService.java` 中的 `buildMessages(String topic, String contextDesc, String previousFailureReason)` 方法。
- **验证结果**：在 `VisualizeServiceTest#shouldStreamGenerateAndPersistBubbleSortAndTcpHandshake` 中分别请求「冒泡排序」与「TCP 三次握手」，返回的 `VisualizationDto.html` 分别准确匹配冒泡排序柱状图动画与 TCP 三次握手双端状态机动画。

---

### 迭代链 3：首次沙箱校验未通过时的自动重试闭环与失败防脏写保护

#### 1. 问题与现象
- **提问/场景**：大模型偶发输出未闭合 HTML 或误引入外部 CDN 脚本时，若直接向前端报错会降低用户体验；而若重试后仍未通过校验，必须确保不向 `visualizations` 表写入任何未通过校验的脏数据。

#### 2. 修改建议与方案设计
- **方案建议**：
  1. 在 `VisualizeService.streamGenerate` 中构建两阶段校验状态机：首次生成完成后立即执行 `validator.validateHtml(firstAttempt.content())`。
  2. 若 `firstValidation.valid()` 为 `false`，通过 SSE 发送 `step="retrying"` 的 `progress` 事件告知前端「首次生成未通过安全沙箱校验，正在自动重试一次...」，并将具体违规原因（`firstValidation.reason()`）附加到重试系统指令中发起第 2 次生成。
  3. 若第 2 次校验通过，合并两次调用的 Token 消耗并写入 `visualizations` 表，推送 `done` 事件；若第 2 次校验仍失败，拒绝入库并推送 `code="VALIDATION_FAILED"` 的 SSE `error` 事件。

#### 3. 修复过程与测试验证
- **代码落地**：在 `VisualizeService.java` 中实现首次校验 + 单次自动重试 + Token 累加 + 错误兜底逻辑，并在前端 `VisualizePage` 错误横幅中提供显式的「重试生成」按钮。
- **验证结果**：运行 `VisualizeServiceTest#shouldRetryOnceAutomaticallyWhenFirstAttemptFailsSandboxValidation` 与 `shouldEmitValidationFailedErrorWhenRetryAlsoFails`，验证首次失败重试图谱调用次数精确为 `2`，且重试失败时数据库记录数为 `0`。
