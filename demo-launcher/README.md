# OneTerm (一学期) - 示例环境独立启动器 (BAT + JSON 驱动)

本文档介绍 OneTerm 独立示例环境启动器的架构设计、配置文件规范及使用指南。

---

## 一、启动器特性概览

* **极简一键直达**：双击项目根目录下的 `start-demo.bat`（或 `demo-launcher/launch.bat`），即可启动服务并打开系统。
* **BAT + JSON 双核驱动**：
  * **BAT 壳层** (`start-demo.bat` / `launch.bat`)：Windows 原生双击支持，免配置环境变量要求。
  * **JSON 配置中心** (`demo-launcher/config.json`)：统筹服务端口、账号凭证、示例数据集路径与自动化开关。
* **全量示例数据集归集** (`demo-launcher/dataset/`)：
  * **`expected-events.json`**：9 项标准教务事件（含课程、测验、期末考试、大作业截止、社团活动与冲突场景）。
  * **`raw-notice.txt`**：教务处与班级群排课通知原文。
  * **`timetable-sample.xls`**：真实高校多周次排课 Excel 示例。
  * **`review-topics.json`**：三大骨干专业课程（计网、算法、操作系统）细粒度考点大纲库。
  * **`visualizations.json`**：预置交互式可视化仿真定义（冒泡排序、TCP 三次握手等）。
  * **`demo-summary.json`**：结构化全景信息汇总。
* **全自动化闭环**：
  * 自动检测服务状态与端口占用。
  * 自动调用 `/api/auth/demo-load` 完成数据库初始灌装（含向量切片、复习倒排与沙箱仿真）。
  * 自动唤起系统默认浏览器直达学生主页。

---

## 二、目录结构

```
OneTerm/
├── start-demo.bat                    # 根目录一键启动批处理脚本（双击运行）
└── demo-launcher/                    # 示例环境独立启动器模块
    ├── config.json                   # 核心配置定义（端口、账号、自动化选项等）
    ├── launch.bat                    # 模块内部启动脚本
    ├── launcher.js                   # Node.js 驱动核心引擎
    ├── README.md                     # 本说明文档
    └── dataset/                      # 全套示例数据资产归集目录
        ├── demo-summary.json         # 示例数据与账户全景汇总
        ├── expected-events.json      # 9 项标准结构化日程事件
        ├── raw-notice.txt            # 教务排课通知原始文本
        ├── review-topics.json        # 各学科核心考点大纲库
        ├── timetable-sample.xls      # 高校周次课表 Excel 表格
        └── visualizations.json       # 交互式仿真预置卡片定义
```

---

## 三、快速使用方式

### 方式 1：交互式菜单模式（推荐）
直接在资源管理器中双击 **`start-demo.bat`**，控制台将呈现操作菜单：
```text
=======================================================================
        OneTerm (一学期) - 示例环境独立启动器 (Demo Launcher)
                     BAT + JSON 驱动模式
=======================================================================
  [1] 一键快速启动（后端+前端+自动装载全套示例数据+自动打开浏览器）
  [2] 检查服务运行状态 (Status)
  [3] 重新注入/重置全套示例数据 (Demo Seed)
  [4] 查看预置示例数据与账号大纲 (Sample Info)
  [5] 运行全量单元测试与工程校验 (Maven Test)
  [6] 停止所有正在运行的服务 (Stop)
  [0] 退出启动器
=======================================================================
请输入操作编号 [0-6] (默认 1): 
```
按回车（默认 1）即可一键完成全流程启动！

### 方式 2：命令行指令模式
可在 CMD 或 PowerShell 中传入参数快速执行指定任务：
```bash
# 启动所有服务并载入示例数据
start-demo.bat start

# 查看当前服务监听与健康状态
start-demo.bat status

# 查看全量示例信息与预置账号凭证
start-demo.bat samples

# 单独向已运行的服务重新注入示例数据
start-demo.bat seed

# 停止所有相关后台进程
start-demo.bat stop
```

---

## 四、配置文件说明 (`config.json`)

启动器所有行为均由 `demo-launcher/config.json` 驱动，主要配置项如下：

```json
{
  "system": {
    "name": "OneTerm (一学期)",
    "version": "1.0.0"
  },
  "server": {
    "port": 8789,                      // 后端服务端口（默认 8789）
    "spaUrl": "http://localhost:8789", // 整合入口
    "swaggerUrl": "http://localhost:8789/swagger-ui/index.html"
  },
  "frontend": {
    "port": 5173,                      // Vite 调试端口
    "autoStartDevServer": true         // 是否伴随启动 Vite 调试服务
  },
  "demo": {
    "autoLoadOnStart": true,           // 启动时是否自动注入全套示例数据
    "autoOpenBrowser": true,           // 启动后是否自动打开浏览器
    "targetBrowserUrl": "http://localhost:8789",
    "accounts": {
      "demoStudent": {
        "username": "示例信息",
        "password": "Demo@123456"
      },
      "admin": {
        "username": "admin",
        "password": "Admin@123456"
      }
    },
    "sampleFiles": {
      "structuredEvents": "demo-launcher/dataset/expected-events.json",
      "rawNoticeText": "demo-launcher/dataset/raw-notice.txt",
      "excelTimetable": "demo-launcher/dataset/timetable-sample.xls",
      "reviewTopics": "demo-launcher/dataset/review-topics.json",
      "visualizations": "demo-launcher/dataset/visualizations.json",
      "summary": "demo-launcher/dataset/demo-summary.json"
    }
  }
}
```

---

## 五、预置演示数据摘要

* **默认演示账号**：`示例信息` / `Demo@123456`
* **管理员账号**：`admin` / `Admin@123456`
* **典型课程**：
  * 《算法设计与分析》（包含 11-04 课程、期中随堂测验与 11-11 实验报告截止）
  * 《操作系统》（包含 11-04 课程紧接算法课首尾相接、11-06 期中上机考核）
  * 《计算机网络》（包含 11-04 实验课、11-12 抓包报告截止、11-13 期末统考）
* **典型冲突场景**：
  * **11-04 15:00~16:00**：《计算机网络》实验课与《算法设计与分析》随堂测验存在部分重叠冲突。
  * **11-06 19:00~21:00**：《操作系统》期中上机与 ACM 协会招新沙龙完全重叠冲突。
* **交互可视化仿真**：
  * 冒泡排序动态步进演示
  * TCP 三次握手状态机时序交互演示
