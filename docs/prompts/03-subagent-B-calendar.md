# 子代理 B（calendar 日历与规划模块）提示词与迭代记录

## 1. 模块输入提示词

> 你是「一学期 OneTerm」项目的 **子代理 B（calendar 日历与规划模块负责人）**。
> 请先阅读 `docs/PRD.md`、`docs/CONVENTIONS.md` 和 `docs/api/openapi.yaml` 中 `calendar` 标签下的接口契约。
>
> 1. **核心纯算法类（`com.oneterm.calendar.core`，无框架依赖）**：
>    - `ConflictDetector.java`：完全重叠（`FULL_OVERLAP`）、部分重叠（`PARTIAL_OVERLAP`）算冲突，首尾相接不算冲突，支持跨天冲突检测。
>    - `WorkloadCalculator.java`：按权重（`exam=5`, `deadline=3`, `course=2`, `activity=1`, `notice=1`, 已排期复习任务 `2`）计算每日热力图 `dailyHeatmap`、每周任务密度 `weeklyDensity`，并标出「最空的一天 (`freestDay`)」「最忙的一天 (`busiestDay`)」「最忙的一周 (`busiestWeek`)」。
>    - `ReviewPathScheduler.java`：将知识点按关联考试日期（`examDate`）倒排，自动安排到考试前的空闲日或低负载日，均衡每日负载并避开存在日程冲突的日期。
>    - `IcsExporter.java`：将用户的事件列表与已排期复习任务导出为符合 RFC 5545 的 `.ics` 日历文本（含 `Asia/Shanghai` 时区）。
> 2. **后端接口与租户数据隔离**：
>    - 实现 `/api/calendar/overview`、`/api/calendar/conflicts`、`/api/calendar/review-topics`、`POST /api/calendar/review-topics`、`POST /api/calendar/review-topics/schedule`、`PUT /api/calendar/review-topics/{id}`、`DELETE /api/calendar/review-topics/{id}`、`/api/calendar/export.ics`。
>    - 所有数据库查询与修改强制携带 `user_id = ?`，跨用户访问未命中一律返回 `404 NOT_FOUND`。
> 3. **JUnit 单元测试**：
>    - `ConflictDetectorTest`、`WorkloadCalculatorTest`、`ReviewPathSchedulerTest`、`CalendarServiceTest`，并验证 `docs/samples/expected-events.json` 中预置的两处冲突精准检出、相邻课程不误判。
> 4. **前端界面（`frontend/src/features/calendar/`）**：
>    - 实现冲突预警卡片区、学期单色渐变热力图 + ECharts 周负载密度图、周视图日历（支持跨页事件高亮定位）与考前复习路径面板。

---

## 2. 关键迭代链与问题修复记录

### 迭代链 1：首尾相接边界判定与跨天事件自然日归属

- **问题现象**：
  在最初设计冲突检测与每日热力图切分逻辑时，发现两个边界问题：
  1. `docs/samples/expected-events.json` 中 11 月 4 日上午第 1 节课《算法设计与分析》结束时间为 `09:40:00`，第 2 节课《操作系统》开始时间为 `09:40:00`。若按闭区间 $[start, end]$ 比较，会在 `09:40:00` 产生单点交集导致误报冲突。
  2. 若某跨天活动结束时间恰为次日零点 `00:00:00`，直接取 `endZdt.toLocalDate()` 会导致次日也被错误计入该事件的负载分。
- **修改建议与方案设计**：
  1. 在 `ConflictDetector` 中严格采用左闭右开区间 $[start, end)$：先计算 `overlapStart = max(startA, startB)` 与 `overlapEnd = min(endA, endB)`，仅当 `overlapStart.isBefore(overlapEnd)` 为真时判定为冲突；当 `endA == startB` 时，`overlapStart.isEqual(overlapEnd)`，自然返回不冲突。同时在按 `start` 升序排序后，当内层循环 `b.start >= a.end` 时直接 `break` 剪枝。
  2. 在 `CalendarTimeUtils.resolveInclusiveEndDate(start, end)` 中增加零点边界处理：若 `end.isAfter(start)` 且 `end.toLocalTime().equals(LocalTime.MIDNIGHT)`，则将 `end.minusNanos(1).toLocalDate()` 作为最后覆盖自然日。
- **验证结果**：
  运行 `ConflictDetectorTest`，验证 `expected-events.json` 9 条标准示例数据中仅检出 11 月 4 日下午部分重叠与 11 月 6 日晚完全重叠 2 处冲突，上午相邻课程零误报，跨天重叠与跨天相邻测试全部通过。

---

### 迭代链 2：同一门考试多个知识点的考前倒排堆积问题

- **问题现象**：
  在测试 `ReviewPathScheduler` 为《计算机网络》期末考试（`2026-11-13`）排布 3 个复习知识点（「TCP 三次握手」「滑动窗口流量控制」「OSPF 路由协议」）时，若仅按初始静态日负载排序，3 个知识点都会同时选中离考试最近的同一个 0 分空闲日（`2026-11-10`），导致该日堆积 3 个复习任务，而 `11-08`、`11-09` 仍然空置，违背了 PRD「尽量均衡负载」的要求。
- **修改建议与方案设计**：
  1. 将 `ReviewPathScheduler.schedule` 改为动态增量负载分配：在考前候选窗口 $[windowStart, examDate - 1]$ 内逐个挑选知识点日期；每选中一个最佳日期 `bestDate`，立即执行 `dailyScoreMap.merge(bestDate, REVIEW_TOPIC_WEIGHT, Integer::sum)`（+2 分）并递增当日已排复习数 `dailyReviewCountMap`。
  2. 候选日比较器采用四级优先级：`是否冲突日 (false < true)` -> `当前日总负载分升序` -> `当日已排复习任务数升序` -> `日期降序（倒排就近）`。
  3. 同一门考试的 $K$ 个日期选出后，按自然日升序赋值给该考试的 $K$ 个知识点，使先修知识点排在前面、综合知识点排在临考前。
- **验证结果**：
  在 `ReviewPathSchedulerTest` 中验证：11 月 6 日机考知识点自动避开 11 月 4 日冲突日并排入 `2026-11-05`；11 月 13 日期末考试的 3 个知识点避开 `11-11`、`11-12` 两个作业截止高负载日，均衡分配在 `2026-11-08`、`2026-11-09`、`2026-11-10` 三个空闲日。

---

### 迭代链 3：复习任务部分字段更新与跨组件定位联动

- **问题现象**：
  1. 前端在周视图或复习面板中点击勾选「完成状态」时，调用 `PUT /api/calendar/review-topics/{id}` 仅传入 `{ done: true }`。如果后端直接用 `request.plannedDate()` 覆盖数据库字段，会把原本已排好的 `planned_date` 覆盖为 `null`。
  2. 从智能问答（QA）引用卡片或冲突预警卡片点击某个事件时，如果该事件在第二周（如 `2026-11-13`），而周视图当前停留在第一周（`2026-11-02`），DOM 中尚未渲染第二周的事件节点，直接调用 `scrollIntoView` 会找不到元素。
- **修改建议与方案设计**：
  1. 在 `CalendarService.updateReviewTopic` 中区分字段未传（`null`）与显式清空（空字符串 `""`）：当 `request.plannedDate() == null` 时保留原记录的 `plannedDate`；当传入空字符串 `""` 时清空为 `null`；当传入具体日期字符串时校验格式并更新。
  2. 在前端 `CalendarPage` (`index.tsx`) 中监听 `useAppStore` 的 `highlightedEventId` 以及冲突卡片点击回调：先解析目标事件的 `startTime` 计算其所在周的周一日期 `getMondayOfDate(eventDate)`，更新 `currentWeekMonday` 切换周视图，再通过 `setTimeout(..., 120)` 等待目标周渲染完成后平滑滚动至 `#calendar-event-${id}` 并高亮展示。
- **验证结果**：
  通过 `CalendarServiceTest` 与前端 `tsc -b --noEmit` 类型校验，确认勾选完成状态不会丢失已排期日期，跨周冲突定位与问答引用跳转均能准确切换周次并高亮目标卡片。
