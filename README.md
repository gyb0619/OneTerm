# 一学期 OneTerm

> **口号：一学期，一张图**

「一学期 OneTerm」是一款面向在校大学生的智能教务日程整合与考前复习规划系统。系统将分散在课表截图、班级群通知、教务公告、作业截止提醒里的零散信息整理成一张学期全景图，自动检测日程时间冲突、计算每周负载密度与学期热力图，并支持带原文溯源引用的自然语言问答（RAG）、算法与网络协议交互式可视化工坊、考前复习路径倒排及手机日历 `.ics` 导出。

---

## 一、10 分钟快速复现指南

### 0. Windows 示例环境独立启动器（BAT + JSON 一键直达）
在 Windows 环境下直接双击根目录的 **`start-demo.bat`** 即可打开交互式控制台，支持自动启动服务、一键装载全套预置示例数据（9 项经典日程事件、真实周次课表、全科复习考点与交互仿真）并自动唤起浏览器。详细配置与数据集说明请参阅 [demo-launcher/README.md](demo-launcher/README.md)。

### 1. 环境要求
- **Docker 方式（推荐）**：Docker 24+ 与 Docker Compose v2+
- **本地源码方式**：
  - **JDK**：Java 21（OpenJDK 21 LTS）
  - **Maven**：Apache Maven 3.9+
  - **Node.js**：Node.js 20+ / 22+（含 npm 10+）

### 2. 克隆仓库与配置环境变量

```bash
git clone https://github.com/gyb0619/OneTerm.git
cd OneTerm
cp .env.example .env
```

### 3. 一条命令启动（Docker Compose）

```bash
docker compose up --build -d
```

启动完成后直接访问：
- **Web 应用入口**：`http://localhost:8789`（HTTPS：`https://localhost:8443`）
- **Swagger UI / OpenAPI 调试台**：`http://localhost:8789/swagger-ui/index.html`

### 4. 本地源码一键构建与启动（无需 Docker）

```bash
# 1. 构建前端静态产物
cd frontend && npm ci && npm run build && cd ..

# 2. 启动后端服务（内置静态托管前端与 API，监听 8789 端口）
mvn -f backend/pom.xml spring-boot:run
```

启动后在浏览器访问 `http://localhost:8789` 即可使用全部功能。

---

## 二、大模型双支持模式（系统环境变量 + 数据库配置）

OneTerm 支持 **「系统环境变量直接调用」** 与 **「管理后台数据库配置」** 的双支持模式：

1. **方式 A：系统环境变量（开箱即用，推荐开发者使用）**：
   - 只要操作系统或 `.env` 中设置了 `DEEPSEEK_API`（或 `DEEPSEEK_API_KEY`），系统启动后将**自动侦测并直连** DeepSeek 官方接口（`https://api.deepseek.com`），无需在管理后台做任何录入！
   - 支持的环境变量名：
     - **对话/抽取/问答/可视化**：`DEEPSEEK_API` 或 `DEEPSEEK_API_KEY`（可选 `DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`）；亦兼容 `OPENAI_API_KEY`
     - **图片识图转文字**：`VISION_API_KEY`（可选 `VISION_BASE_URL`、`VISION_MODEL`）
     - **文本向量化**：`EMBEDDING_API_KEY`（可选 `EMBEDDING_BASE_URL`、`EMBEDDING_MODEL`）
   - 用户登录后可在「切换当前对话模型」中直接看到并选择 `DeepSeek (系统环境变量)`。

2. **方式 B：管理后台数据库配置（安全加密，推荐多租户管理）**：
   - 管理员登录管理后台后，可在界面新增、启用/停用、切换不同厂商的对话、识图、向量模型。
   - 所有录入的 API Key 均使用 **AES-256-GCM** 加密存储于数据库，界面仅显示脱敏尾号（如 `****8f2a`）。

3. **双支持协同优先级**：
   - **用户显式偏好优先**：若用户指定了偏好模型（无论是环境变量模型还是数据库模型），以用户选择为准。
   - **默认调度策略**：若用户未指定，优先使用数据库中已启用的模型；若数据库无配置，自动回退并调用系统环境变量中的 API 密钥；若两者皆未配置或设置 `ONETERM_MOCK=true`，则自动无缝降级为内置 Mock 演示网关。

---

## 三、Mock 模式与零配置评委体验说明

1. **自动触发条件**：
   - 当环境变量 `ONETERM_MOCK=true`，或数据库中尚未配置任何启用的大模型 API Key 时，系统自动进入 **Mock 演示模式**。
2. **一键载入示例数据**：
   - 打开登录页 `http://localhost:8789/login`，无需输入账号密码，直接点击 **「一键载入示例数据（免配置直接体验）」**。
   - 系统将自动创建并登录演示账号，载入 `docs/samples/` 下的 9 条真实感教务事件（含 3 门课程、3 场考试、2 项作业截止、1 项社团活动及 **2 处预置时间冲突**）、构建 `float32` 向量切片，并预置「冒泡排序」与「TCP 三次握手」交互式可视化动画及考前复习计划。
3. **管理员后台体验**：
   - 首次启动时，系统根据环境变量 `ONETERM_ADMIN_USERNAME` 与 `ONETERM_ADMIN_PASSWORD` 自动初始化首个 `ADMIN` 账号。
   - 管理员登录后可进入「管理后台」配置真实的对话（默认推荐 DeepSeek）、识图与向量模型（API Key 经 AES-256-GCM 加密入库，前端仅显示脱敏尾号），或创建评委账号、调整每日 Token 额度上限（默认 `100,000` tokens/天）。

---

## 三、核心功能链路

1. **教务信息导入与流式抽取 (`/extract`)**：
   - 支持粘贴文本、上传 `.txt`、`.xlsx` 表格及图片（识图模型转文字）。
   - 系统提示词内置防 Prompt 注入声明，通过 SSE 实时推送抽取进度（「正在识别第 N 条事件」），JSON 解析失败自动重试一次，前端支持人工核对、编辑、增删后批量入库。
2. **周视图日历、冲突检测与负载热力图 (`/calendar`)**：
   - 周视图按事件类型语义着色；纯函数检测完全重叠与部分重叠冲突（首尾相接不计冲突），以醒目卡片展示并支持点击定位。
   - 按权重（考试 5 > 作业截止 3 > 课程 2 > 活动/通知 1）生成单色渐变学期热力图，标出 **「最空的一天」「最忙的一天」「最忙的一周」**。
3. **RAG 自然语言问答 (`/qa`)**：
   - 原文按段切片，以 `float32` BLOB 存入 SQLite 并通过余弦相似度检索 Top-4 片段（未配置向量模型时自动降级为 BM25 关键词检索）。
   - SSE 流式输出回答，底部列出引用的原文片段，点击即可跳转到日历对应事件。
4. **知识点可视化工坊 (`/visualize`)**：
   - 输入「冒泡排序」「TCP 三次握手」等算法或网络协议知识点，流式生成含滑块与控制按钮的单文件交互式 HTML。
   - 后端执行严格安全校验（体积 ≤ 100KB、禁止任何外部网络请求与外链），前端置于 `sandbox="allow-scripts"`（无 `allow-same-origin`）的隔离 `iframe` 中渲染。
5. **考前复习路径与 `.ics` 导出 (`/calendar`)**：
   - 按考试日期倒排知识点，自动避开冲突日并均衡每日负载写回日历；支持一键导出标准 `.ics` 文件导入手机日历。

---

## 四、仓库目录结构

```text
OneTerm/
├── .env.example                 # 环境变量模板
├── docker-compose.yml           # Docker Compose 一键编排配置（暴露 8789 端口）
├── docker/
│   ├── Dockerfile.backend       # 后端 Java 21 镜像构建文件
│   ├── Dockerfile.frontend      # 前端构建与 Nginx HTTPS/SSE 镜像文件
│   └── nginx.conf               # Nginx 反向代理配置（SSE 路径 proxy_buffering off）
├── docs/
│   ├── PRD.md                   # 产品需求文档
│   ├── CONVENTIONS.md           # 全局错误码、SSE 事件、时区与安全约定
│   ├── ACCEPTANCE_REPORT.md     # PRD 第 13 节逐项验收核对报告
│   ├── api/openapi.yaml         # OpenAPI 3.0 完整接口契约
│   ├── prompts/                 # 各阶段及子代理提示词与完整工程迭代记录
│   └── samples/                 # 标准示例数据集（含 2 处预置冲突与期望抽取 JSON）
├── backend/                     # Spring Boot 4.1.1 + Java 21 + SQLite + Flyway 后端
│   ├── pom.xml
│   └── src/
│       ├── main/java/com/oneterm/
│       │   ├── common/          # 统一异常、SSE 发布器、向量工具、Swagger 与静态路由
│       │   ├── llm/             # 统一大模型网关、AES-256-GCM 加密、额度控制与 Mock 实现
│       │   ├── auth/            # 登录、BCrypt、5次失败锁10分钟、CSRF 与一键示例载入
│       │   ├── admin/           # 模型配置管理、用户启停、密码重置与额度统计
│       │   ├── extract/         # 文本/txt/xlsx/图片导入、流式抽取与事件管理
│       │   ├── calendar/        # 冲突检测、负载密度热力图、复习排期纯算法与 .ics 导出
│       │   ├── qa/              # 原文切片、余弦相似度/BM25 检索与流式问答
│       │   └── visualize/       # 知识点可视化生成與 HTML 安全沙箱校验器
│       ├── main/resources/
│       │   ├── db/migration/    # Flyway V1__init.sql 数据库迁移脚本
│       │   └── prompts/         # 版本化系统提示词模板 (extract-v1, qa-v1, visualize-v1)
│       └── test/java/           # 59 项 JUnit 5 单元与集成测试
└── frontend/                    # React 18 + Vite + TypeScript + Tailwind + Zustand + ECharts
    ├── package.json
    └── src/
        ├── shared/              # 统一 HTTP/CSRF 客户端、useSseStream Hook、全局状态与布局
        └── features/            # auth, admin, extract, calendar, qa, visualize 六大业务模块
```
