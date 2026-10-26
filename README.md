# 一学期 OneTerm

> **口号：一学期，一张图**

「一学期 OneTerm」是一款面向在校大学生的智能教务日程整合与考前复习规划系统。系统将分散在课表截图、班级群通知、教务公告、作业截止提醒里的零散信息整理成一张学期全景图，自动检测日程时间冲突、计算每周负载密度与学期热力图，并支持带原文溯源引用的自然语言问答（RAG）、算法与网络协议交互式可视化工坊、考前复习路径倒排及手机日历 `.ics` 导出。

---

## 一、快速运行与评测指南

### 1. 【极速推荐】独立可执行 Jar 发行包（零配置，仅需 Java）
项目已将全量 Spring Boot 后端、React 前端单页应用（SPA）与预置示例数据库打包完毕，存放在 **`./OneTerm/`** 目录下：

- **一键启动（BAT 脚本）**：
  在 Windows 环境下直接双击进入 **`OneTerm/start.bat`**。
  - 自动校验 Java 环境（需 Java 17 或 Java 21 LTS）。
  - 后台静默启动 `oneterm.jar`（端口 8789），服务就绪后**自动唤起默认浏览器**打开 `http://localhost:8789/`。
  - 停止服务：直接双击运行 `OneTerm/stop.bat` 即可一键安全停止。
- **交互式启动器**：
  双击运行 **`OneTerm/launch.bat`**，支持直接修改/重置 SQLite 示例数据、查看账号大纲、服务自检与状态监听。
- **命令行直接启动**：
  ```bash
  cd OneTerm
  java -jar oneterm.jar
  ```
  启动后访问：`http://localhost:8789/`

> **预置管理员体验账号**：
> - 用户名：`示例信息`
> - 密码：`Demo@123456`
> - 角色：`ADMIN`（系统最高管理权限，已预置 9 项全真日程事件、2 处预置时间冲突、10 项考前复习知识点体系与交互式算法/协议仿真沙箱）。

---

### 2. 【源码与全量依赖交付包】`项目源代码/` 目录说明
为满足离线审查与评审需求，项目根目录下额外归档了 **`项目源代码/`** 文件夹：
- **`项目源代码/backend/`**：包含 Java 21 完整工程源码（`src/`）、构建定义（`pom.xml`）以及 **`lib/` 目录下全部 115 个已解析并下载完成的 Maven 依赖 Jar 包**。
- **`项目源代码/frontend/`**：包含 React 18 + Vite 前端完整源码（`src/`）、配置文件（`package.json`、`package-lock.json`、`tailwind.config.js` 等）以及 **完整的 `node_modules/` 依赖库**，彻底杜绝脱机环境下的网络依赖拉取问题。
- **`项目源代码/data/`、`docs/`、`docker/`**：包含数据库迁移脚本、全量 API 契约、文档与容器编排文件。

---

### 3. 本地源码常规编译与运行

#### 环境要求
- **JDK**：Java 21（OpenJDK 21 LTS）
- **Maven**：Apache Maven 3.9+
- **Node.js**：Node.js 20+ / 22+（含 npm 10+）

#### 一键命令启动
```bash
# 1. 编译前端静态产物
cd frontend && npm install && npm run build && cd ..

# 2. 拷贝前端静态产物到后端资源目录并启动后端
mvn -f backend/pom.xml spring-boot:run
```
访问应用入口：`http://localhost:8789/`

---

### 4. 容器化一键部署（Docker Compose）
```bash
docker compose up --build -d
```
启动完成后访问：
- **Web 应用入口**：`http://localhost:8789`（HTTPS：`https://localhost:8443`）
- **Swagger UI / OpenAPI 调试台**：`http://localhost:8789/swagger-ui/index.html`

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
2. **拟造示例数据库直通**：
   - 系统数据库默认已写入全套高质量拟造教务数据，涵盖 3 门必修课程、3 场期末统考、2 项大作业截止、1 项社团活动，并**包含 2 处真实时间冲突**。
   - 登录页面默认填入账号 `示例信息` 与密码 `Demo@123456`，点击登录即可直接进入全景工作台。
3. **管理员后台体验**：
   - 首次启动时，系统根据环境变量 `ONETERM_ADMIN_USERNAME` 与 `ONETERM_ADMIN_PASSWORD`（默认 `示例信息` / `Demo@123456`）初始化首个 `ADMIN` 账号。
   - 管理员登录后可进入「管理后台」配置真实的大模型网关密钥，或创建新账号、重置密码、调整每日 Token 额度上限（默认 `100,000` tokens/天）。

---

## 四、自动化测试套件说明

系统后端配备了完整的自动化测试体系，共包含 **66 项 JUnit 5 单元测试与集成测试**：
- **测试执行命令**：
  ```bash
  mvn -f backend/pom.xml test
  ```
- **测试文件安全隔离**：
  - 测试期间产生的临时数据库均命名为 `test-*.db` 并严格隔离在 `backend/target/` 目录下，在工程打包前已全部自动清理。
- **课表展开测试防脆设计（`TimetableWeekParserTest`）**：
  - `TimetableWeekParserTest` 采用 **JUnit 5 的 `assumeTrue` 条件假设断言**。当在未包含本地私有课表 `.xls` 模板的环境下运行时，测试框架将自动跳过真实文件解析环节，标记为已跳过（Skipped），确保任何机器在拉取源码构建时均能稳定输出 `BUILD SUCCESS`。

---

## 五、核心功能链路

1. **教务信息导入与流式抽取 (`/extract`)**：
   - 支持粘贴文本、上传 `.txt`、`.xlsx` 表格及图片（识图模型转文字）。
   - 系统提示词内置防 Prompt 注入隔离，通过 SSE 实时推送抽取进度，JSON 解析失败自动重试一次，前端支持人工核对、编辑、增删后批量入库。
2. **周视图日历、冲突检测与负载热力图 (`/calendar`)**：
   - 周视图按事件类型语义着色；纯函数检测完全重叠与部分重叠冲突（首尾相接不计冲突），以醒目卡片展示并支持点击定位。
   - 按权重（考试 5 > 作业截止 3 > 课程 2 > 活动/通知 1）生成单色渐变学期热力图，标出 **「最空的一天」「最忙的一天」「最忙的一周」**。
3. **RAG 自然语言问答 (`/qa`)**：
   - 原文按段切片，以 `float32` BLOB 存入 SQLite 并通过余弦相似度检索 Top-4 片段（未配置向量模型时自动降级为 BM25 关键词检索）。
   - SSE 流式输出回答，具备打字呼吸微光标与动态提示词「换一换」，底部列出引用的原文片段，点击即可跳转到日历对应事件。
4. **知识点可视化工坊 (`/visualize`)**：
   - 输入「冒泡排序」「TCP 三次握手」等算法或网络协议知识点，流式生成含滑块与控制按钮的单文件交互式 HTML。
   - 后端执行严格安全校验（体积 ≤ 100KB、禁止任何外部网络请求与外链），前端置于 `sandbox="allow-scripts"`（无 `allow-same-origin`）的隔离 `iframe` 中渲染。
5. **考前复习路径与 `.ics` 导出 (`/calendar`)**：
   - 单科分离多科聚合，智能检测学期课表并经用户知情同意后一键提炼全科知识点考查细点体系；
   - 按考试日期倒排知识点，自动避开冲突日并均衡每日负载写回日历；支持一键导出标准 `.ics` 文件导入手机日历。

---

## 六、仓库目录结构

```text
OneTerm/
├── OneTerm/                     # 【独立 Jar 发行包】零环境配置一键运行目录
│   ├── oneterm.jar              # 全量可执行 Jar 包（后端服务 + 嵌入式前端 SPA）
│   ├── start.bat                # Windows 一键启动脚本（直接唤起浏览器）
│   ├── stop.bat                 # Windows 一键停止脚本
│   ├── launch.bat               # 交互式管理启动器
│   ├── README.md                # Jar 版独立说明
│   ├── data/oneterm.db          # 预置全量示例 SQLite 数据库
│   └── demo-launcher/           # 示例环境配置与数据集
├── 项目源代码/                  # 【源码与依赖交付包】完整代码与离线依赖库
│   ├── backend/                 # Spring Boot 4.1.1 + Java 21 后端源码
│   │   ├── pom.xml
│   │   ├── src/                 # 后端 Java 源码与资源
│   │   └── lib/                 # 全部 115 个 Maven 依赖 Jar 包（支持离线）
│   ├── frontend/                # React 18 + Vite 前端源码
│   │   ├── package.json
│   │   ├── src/                 # 前端 TypeScript 源码
│   │   └── node_modules/        # 全部前端 npm 依赖包
│   ├── data/                    # 示例数据与数据库
│   ├── demo-launcher/           # 启动器控制台
│   ├── docker/                  # 容器镜像构建文件
│   └── docs/                    # PRD、接口契约与开发文档
├── backend/                     # 后端工程主目录
├── frontend/                    # 前端工程主目录
├── data/                        # 运行数据库与课表模板
├── demo-launcher/               # 原生启动器模块
├── docs/                        # PRD、架构图与开发文档
├── docker-compose.yml           # Docker Compose 一键编排配置
├── start-demo.bat               # 根目录示例启动入口
└── README.md                    # 本文档
```
