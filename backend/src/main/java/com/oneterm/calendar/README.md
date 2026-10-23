# Calendar 模块说明（日历、冲突检测、任务密度与考前复习路径）

本模块对应 PRD **F3（日历、冲突检测与负载热力图）**、**F6（考前复习路径）** 与 **F8（导出 .ics）**，实现从结构化事件展示、冲突预警、学期任务密度量化到考前知识点倒排规划及 `.ics` 导出的完整链路。

---

## 1. 目录与分层结构

遵循 `controller -> service -> repository` 与无框架依赖 `core` 纯算法分层约束：

```text
com.oneterm.calendar
├── CalendarController.java         # REST 接口层（严格对齐 docs/api/openapi.yaml）
├── CalendarService.java            # 业务编排与 user_id 租户隔离校验
├── CalendarRepository.java         # Spring JDBC 数据访问（强制携带 WHERE user_id = ?）
├── core/                           # 无框架依赖的纯算法实现
│   ├── CalendarTimeUtils.java      # Asia/Shanghai 时区 ISO 8601 解析与自然日区间计算
│   ├── ConflictDetector.java       # 日程时间冲突检测纯函数（FULL_OVERLAP / PARTIAL_OVERLAP）
│   ├── WorkloadCalculator.java     # 每日热力图、每周任务密度与最空天/最忙天/最忙周计算
│   ├── ReviewPathScheduler.java    # 考前复习路径倒排与负载均衡算法
│   └── IcsExporter.java            # 标准 RFC 5545 .ics 日历生成纯函数
└── dto/                            # 请求与响应 Record DTO
```

前端目录位于 `frontend/src/features/calendar/`：
- `index.tsx`：日历全景容器页（支持空状态引导、一键载入示例数据、一键导出 `.ics`）
- `components/ConflictAlertSection.tsx`：冲突预警卡片区（点击自动切换周次并定位高亮相关事件）
- `components/SemesterWorkloadCharts.tsx`：顶部摘要三卡片（「最空的一天」「最忙的一天」「最忙的一周」）、学院青绿单色渐变热力图与 ECharts 每周任务密度分布图
- `components/WeeklyCalendarView.tsx`：7 天周视图日历（按事件类型语义分色、展示已排期考前复习任务、支持原文片段追溯与跨页高亮定位）
- `components/ReviewPathPanel.tsx`：考前复习路径规划面板（新增知识点、一键倒排写回日历、手动调整日期、勾选完成、跳转可视化工坊）

---

## 2. 核心算法说明

### 2.1 冲突检测算法（`ConflictDetector`）
- 将所有事件起止时间统一转换至 `Asia/Shanghai` 时区下的半开区间 $[start, end)$，按 `(startTime, endTime, id)` 升序排列。
- 对任意事件对 $(A, B)$，计算交集区间：
  $$\text{overlapStart} = \max(start_A, start_B), \quad \text{overlapEnd} = \min(end_A, end_B)$$
- 判定规则：
  - 当 $\text{overlapStart} < \text{overlapEnd}$ 时判定为冲突：
    - 若 $A$ 完整覆盖 $B$ 或 $B$ 完整覆盖 $A$（含起止时间完全一致），标记为 `FULL_OVERLAP`；
    - 否则标记为 `PARTIAL_OVERLAP`。
  - 当 $end_A = start_B$ 或 $end_B = start_A$（首尾相接）时，$\text{overlapStart} = \text{overlapEnd}$，不计为冲突。
  - 天然支持跨天（如前一日 22:00 至次日 02:00）事件的冲突检测与自然日提取。

### 2.2 任务密度与热力图计算（`WorkloadCalculator`）
- 权重设定：
  - 考试 `exam`：**5 分**
  - 作业截止 `deadline`：**3 分**
  - 课程 `course`：**2 分**
  - 活动 `activity`：**1 分**
  - 通知 `notice`：**1 分**
  - 已排期考前复习任务（`plannedDate != null`）：**2 分**
- 在学期起止窗口内按天累加权重分与事件数生成 `dailyHeatmap`，按周一至周日聚合生成 `weeklyDensity`，并从中识别出：
  - `freestDay`：当日负载总分最低的自然日
  - `busiestDay`：当日负载总分最高的自然日
  - `busiestWeek`：周总负载分最高的周次

### 2.3 考前复习路径倒排算法（`ReviewPathScheduler`）
- 提取所有存在时间冲突的自然日集合 `conflictDates`。
- 将未完成的复习知识点按关联考试日期 `examDate` 分组，从晚到早倒排：
  - 在考前候选窗口 $[windowStart, examDate - 1]$ 内，按四级优先级为每个知识点挑选最佳日期：
    1. **避开冲突日**：非冲突日严格优先于冲突日；
    2. **最低当日负载分**：优先安排在 0 分空闲日或低负载日；
    3. **最少已分配复习任务数**：防止多个知识点堆积在同一天；
    4. **倒排就近原则**：相同负载下优先选择离考试日期更近的日期。
  - 每分配一个知识点，立即将该日负载分 `+2`，使后续知识点自动均衡分散到其余空闲日。

---

## 3. 单元测试运行方式

```powershell
& "D:\Code\SM\.crush-tools\apache-maven-3.9.16\bin\mvn.cmd" -f backend/pom.xml test "-Dtest=com.oneterm.calendar.*Test"
```
