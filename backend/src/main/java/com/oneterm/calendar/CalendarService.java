package com.oneterm.calendar;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.oneterm.calendar.core.ConflictDetector;
import com.oneterm.calendar.core.IcsExporter;
import com.oneterm.calendar.core.ReviewPathScheduler;
import com.oneterm.calendar.core.WorkloadCalculator;
import com.oneterm.calendar.dto.BatchCreateReviewTopicsRequest;
import com.oneterm.calendar.dto.CalendarEventDto;
import com.oneterm.calendar.dto.CalendarOverviewResponse;
import com.oneterm.calendar.dto.ConflictPairDto;
import com.oneterm.calendar.dto.CreateReviewTopicRequest;
import com.oneterm.calendar.dto.ReviewTopicDto;
import com.oneterm.calendar.dto.ScheduleReviewTopicsRequest;
import com.oneterm.calendar.dto.SuggestCourseTopicsRequest;
import com.oneterm.calendar.dto.SuggestCourseTopicsResponse;
import com.oneterm.calendar.dto.UpdateReviewTopicRequest;
import com.oneterm.common.BusinessException;
import com.oneterm.common.CurrentUserProvider;
import com.oneterm.common.ErrorCode;
import com.oneterm.llm.ChatMessage;
import com.oneterm.llm.ChatResult;
import com.oneterm.llm.LlmGateway;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;

/**
 * 日历、冲突检测、任务密度热力图、考前复习排期、考点体系智能提炼与 ICS 导出业务服务。
 */
@Service
public class CalendarService {

    private final CalendarRepository calendarRepository;
    private final CurrentUserProvider currentUserProvider;
    private final LlmGateway llmGateway;
    private final ObjectMapper objectMapper;

    public CalendarService(CalendarRepository calendarRepository, CurrentUserProvider currentUserProvider) {
        this(calendarRepository, currentUserProvider, null, new ObjectMapper());
    }

    @Autowired
    public CalendarService(
            CalendarRepository calendarRepository,
            CurrentUserProvider currentUserProvider,
            @Autowired(required = false) LlmGateway llmGateway,
            ObjectMapper objectMapper
    ) {
        this.calendarRepository = calendarRepository;
        this.currentUserProvider = currentUserProvider;
        this.llmGateway = llmGateway;
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper();
    }

    public CalendarOverviewResponse getOverview(String semesterStartRaw, String semesterEndRaw) {
        long userId = currentUserProvider.requireCurrentUserId();
        LocalDate semesterStart = parseOptionalDate(semesterStartRaw, "semesterStart");
        LocalDate semesterEnd = parseOptionalDate(semesterEndRaw, "semesterEnd");

        List<CalendarEventDto> events = calendarRepository.findEventsByUserId(userId);
        List<ReviewTopicDto> reviewTopics = calendarRepository.findReviewTopicsByUserId(userId, null);
        List<ConflictPairDto> conflicts = ConflictDetector.detectConflicts(events);

        WorkloadCalculator.WorkloadSummary summary = WorkloadCalculator.calculate(
                events,
                reviewTopics,
                semesterStart,
                semesterEnd
        );

        return new CalendarOverviewResponse(
                events,
                reviewTopics,
                conflicts,
                summary.dailyHeatmap(),
                summary.weeklyDensity(),
                summary.freestDay(),
                summary.busiestDay(),
                summary.busiestWeek()
        );
    }

    public List<ConflictPairDto> getConflicts() {
        long userId = currentUserProvider.requireCurrentUserId();
        List<CalendarEventDto> events = calendarRepository.findEventsByUserId(userId);
        return ConflictDetector.detectConflicts(events);
    }

    public List<ReviewTopicDto> getReviewTopics(Long eventId) {
        long userId = currentUserProvider.requireCurrentUserId();
        return calendarRepository.findReviewTopicsByUserId(userId, eventId);
    }

    @Transactional
    public ReviewTopicDto createReviewTopic(CreateReviewTopicRequest request) {
        long userId = currentUserProvider.requireCurrentUserId();
        if (request == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "请求体不能为空");
        }
        if (request.eventId() == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "关联事件 ID (eventId) 不能为空");
        }
        if (request.topic() == null || request.topic().isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "复习知识点名称 (topic) 不能为空");
        }

        // 校验关联事件存在且归属当前用户（跨用户访问返回 404）
        calendarRepository.findEventByIdAndUserId(request.eventId(), userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "关联的考试或课程事件不存在"));

        String normalizedPlannedDate = null;
        if (request.plannedDate() != null && !request.plannedDate().isBlank()) {
            normalizedPlannedDate = parseOptionalDate(request.plannedDate(), "plannedDate").toString();
        }

        long topicId = calendarRepository.insertReviewTopic(
                userId,
                request.eventId(),
                request.topic().trim(),
                normalizedPlannedDate
        );

        return calendarRepository.findReviewTopicByIdAndUserId(topicId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INTERNAL_ERROR, "创建复习知识点失败"));
    }

    /**
     * 智能提炼指定课程全套考前复习核心知识点细点大纲（支持大模型提炼与高质量预置体系）。
     */
    public SuggestCourseTopicsResponse suggestCourseTopics(SuggestCourseTopicsRequest request) {
        long userId = currentUserProvider.requireCurrentUserId();
        String courseName = "";
        Long eventId = request != null ? request.eventId() : null;
        String eventDetail = "";

        if (eventId != null) {
            var evOpt = calendarRepository.findEventByIdAndUserId(eventId, userId);
            if (evOpt.isPresent()) {
                var ev = evOpt.get();
                courseName = ev.courseName() != null && !ev.courseName().isBlank() ? ev.courseName() : ev.title();
                eventDetail = ev.title() + " " + (ev.sourceText() != null ? ev.sourceText() : "");
            }
        }
        if ((courseName == null || courseName.isBlank()) && request != null && request.courseName() != null) {
            courseName = request.courseName().trim();
        }
        if (courseName == null || courseName.isBlank()) {
            courseName = "专业核心课程";
        }

        List<String> topics = generateTopicsForCourse(userId, courseName, eventDetail);
        return new SuggestCourseTopicsResponse(eventId, courseName, topics);
    }

    /**
     * 在用户同意确认后，批量将某单科的考点列表导入 review_topics 表，并可自动执行考前倒排排期。
     */
    @Transactional
    public List<ReviewTopicDto> batchCreateReviewTopics(BatchCreateReviewTopicsRequest request) {
        long userId = currentUserProvider.requireCurrentUserId();
        if (request == null || request.eventId() == null || request.topics() == null || request.topics().isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "请求参数不合法，必须包含 eventId 与非空考点列表");
        }
        calendarRepository.findEventByIdAndUserId(request.eventId(), userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "关联的考试或课程事件不存在"));

        for (String topic : request.topics()) {
            if (topic != null && !topic.isBlank()) {
                calendarRepository.insertReviewTopic(userId, request.eventId(), topic.trim(), null);
            }
        }

        if (request.autoSchedule()) {
            return scheduleReviewTopics(new ScheduleReviewTopicsRequest(null));
        }
        return calendarRepository.findReviewTopicsByUserId(userId, null);
    }

    private List<String> generateTopicsForCourse(long userId, String courseName, String eventDetail) {
        // 1. 若大模型网关可用且未强制离线，尝试让模型梳理考点细点大纲
        if (llmGateway != null) {
            try {
                List<ChatMessage> messages = List.of(
                        ChatMessage.system("""
                                你是一名高校计算机专业骨干教师。请针对学生选修的课程《%s》，梳理出一套完整系统、涵盖近乎所有关键细节的期末考前复习核心知识点细点大纲。
                                【要求】
                                1. 全面提炼 8~12 个最核心、常考且具体的知识点概念（适合考前日程倒排与生成交互式可视化演示，如经典算法、核心协议、底层机制、考查难点）；
                                2. 每个考点细点名称简洁明确（10~25字），格式统一；
                                3. 必须且只能输出标准 JSON 字符串数组，例如：["TCP三次握手与四次挥手过程", "滑动窗口流量控制", ...]，严禁任何额外文本或 Markdown 代码块包裹。
                                """.formatted(courseName)),
                        ChatMessage.user("请为《" + courseName + "》生成全套考点细点清单。" + (eventDetail.isBlank() ? "" : " 课程考查背景：" + eventDetail))
                );
                ChatResult res = llmGateway.chat(userId, "chat", messages);
                if (res != null && res.content() != null && !res.content().isBlank()) {
                    List<String> parsed = parseTopicJsonArray(res.content());
                    if (parsed != null && !parsed.isEmpty()) {
                        return parsed;
                    }
                }
            } catch (Exception ignored) {
                // 异常时优雅降级为高质量预置体系库
            }
        }

        // 2. 高质量内置知识点细点体系库（针对常见高校计算机骨干科目）
        return getPresetCourseTopics(courseName);
    }

    private List<String> getPresetCourseTopics(String rawCourseName) {
        String name = rawCourseName.toLowerCase();
        if (name.contains("网络") || name.contains("计网") || name.contains("network")) {
            return List.of(
                    "OSI七层参考模型与TCP/IP体系结构",
                    "数据链路层CRC循环冗余校验与CSMA/CD碰撞检测",
                    "网络层IP数据报分片与CIDR无分类编址",
                    "网络层路由选择算法：OSPF链路状态与RIP距离矢量",
                    "传输层TCP三次握手连接建立与四次挥手释放过程",
                    "传输层TCP滑动窗口协议与端到端流量控制",
                    "传输层TCP拥塞控制机制（慢启动、拥塞避免与快重传）",
                    "应用层DNS域名解析递归与迭代查询过程",
                    "应用层HTTP/1.1持久连接与HTTPS对称/非对称加密握手"
            );
        }
        if (name.contains("算法") || name.contains("algorithm")) {
            return List.of(
                    "算法渐进复杂度分析与主定理Master Theorem",
                    "分治策略经典实现：归并排序与快速排序复杂度分析",
                    "动态规划算法：0-1背包问题与状态转移方程构建",
                    "动态规划经典应用：最长公共子序列LCS与矩阵连乘",
                    "贪心算法核心证明：哈夫曼编码与Dijkstra单源最短路径",
                    "图搜索与状态空间遍历：广度优先BFS与深度优先DFS",
                    "回溯算法与剪枝优化：N皇后问题状态树搜索",
                    "字符串匹配算法：KMP算法前缀表Next数组推导与匹配"
            );
        }
        if (name.contains("操作") || name.contains("系统") || name.contains("os")) {
            return List.of(
                    "进程与线程模型、进程控制块PCB与进程上下文切换",
                    "进程同步与互斥：信号量机制与经典生产者-消费者问题",
                    "死锁产生的四个必要条件与银行家算法死锁避免",
                    "虚拟内存管理：分页存储、多级页表与TLB快表命中机制",
                    "页面置换算法：FIFO先进先出与LRU最近最久未使用",
                    "文件系统存储结构：目录树、软硬链接与索引节点inode",
                    "磁盘调度算法：SSTF最短寻道时间优先与SCAN电梯调度算法"
            );
        }
        if (name.contains("数据结构") || name.contains("data structure")) {
            return List.of(
                    "线性表：单链表、循环链表与双向链表边界操作",
                    "栈与队列原理及在递归与表达式求值中的应用",
                    "树与二叉树：前序/中序/后序遍历递归与非递归实现",
                    "二叉搜索树BST构建与平衡二叉树AVL旋转平衡机制",
                    "图的存储结构：邻接矩阵与邻接表转换及拓扑排序",
                    "散列表哈希函数设计与开放寻址/链地址法冲突解决",
                    "经典内部排序算法比较：冒泡、选择、堆排序与快速排序"
            );
        }
        if (name.contains("数据库") || name.contains("database") || name.contains("sql")) {
            return List.of(
                    "关系模型与E-R实体关系图向关系模式映射规则",
                    "SQL复杂联查：多表JOIN连接、子查询与分组聚合HAVING",
                    "关系范式化理论：1NF、2NF、3NF与BCNF规范化判定",
                    "数据库事务ACID四大特性与并发控制事务隔离级别",
                    "并发控制机制：封锁协议2PL与事务死锁预防和检测",
                    "B+树索引组织结构与最左前缀匹配索引优化原则",
                    "数据库故障恢复机制：WAL预写日志与检查点技术"
            );
        }
        // 通用兜底
        return List.of(
                "《" + rawCourseName + "》核心概念与基础理论架构",
                "《" + rawCourseName + "》关键技术原理与标准执行流程",
                "《" + rawCourseName + "》核心算法/协议分析与应用实践",
                "《" + rawCourseName + "》系统设计与模块划分最佳原则",
                "《" + rawCourseName + "》常考重难点问题剖析与推导",
                "《" + rawCourseName + "》期末综合应用与典型场景考查"
        );
    }

    private List<String> parseTopicJsonArray(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        String json = raw.trim();
        if (json.startsWith("```")) {
            int firstNewline = json.indexOf('\n');
            if (firstNewline > 0) json = json.substring(firstNewline + 1);
            int lastBacktick = json.lastIndexOf("```");
            if (lastBacktick >= 0) json = json.substring(0, lastBacktick);
            json = json.trim();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    @Transactional
    public List<ReviewTopicDto> scheduleReviewTopics(ScheduleReviewTopicsRequest request) {
        long userId = currentUserProvider.requireCurrentUserId();
        LocalDate startDate = null;
        if (request != null && request.startDate() != null && !request.startDate().isBlank()) {
            startDate = parseOptionalDate(request.startDate(), "startDate");
        }

        List<CalendarEventDto> events = calendarRepository.findEventsByUserId(userId);
        List<ReviewTopicDto> existingTopics = calendarRepository.findReviewTopicsByUserId(userId, null);
        if (existingTopics.isEmpty()) {
            return List.of();
        }

        List<ReviewTopicDto> scheduledTopics = ReviewPathScheduler.schedule(existingTopics, events, startDate);
        for (ReviewTopicDto item : scheduledTopics) {
            calendarRepository.updatePlannedDate(item.id(), userId, item.plannedDate());
        }

        return calendarRepository.findReviewTopicsByUserId(userId, null);
    }

    @Transactional
    public ReviewTopicDto updateReviewTopic(long id, UpdateReviewTopicRequest request) {
        long userId = currentUserProvider.requireCurrentUserId();
        if (request == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "请求体不能为空");
        }

        ReviewTopicDto existing = calendarRepository.findReviewTopicByIdAndUserId(id, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "复习知识点不存在"));

        String newTopic = existing.topic();
        if (request.topic() != null) {
            if (request.topic().isBlank()) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "复习知识点名称不能为空");
            }
            newTopic = request.topic().trim();
        }

        String newPlannedDate = existing.plannedDate();
        if (request.plannedDate() != null) {
            if (request.plannedDate().isBlank()) {
                newPlannedDate = null;
            } else {
                newPlannedDate = parseOptionalDate(request.plannedDate(), "plannedDate").toString();
            }
        }

        boolean newDone = request.done() != null ? request.done() : existing.done();

        int rows = calendarRepository.updateReviewTopic(id, userId, newTopic, newPlannedDate, newDone);
        if (rows == 0) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "复习知识点不存在或无法更新");
        }

        return calendarRepository.findReviewTopicByIdAndUserId(id, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INTERNAL_ERROR, "读取更新后的知识点失败"));
    }

    @Transactional
    public void deleteReviewTopic(long id) {
        long userId = currentUserProvider.requireCurrentUserId();
        int rows = calendarRepository.deleteReviewTopicByIdAndUserId(id, userId);
        if (rows == 0) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "复习知识点不存在或无权删除");
        }
    }

    public String exportUserCalendarIcs() {
        long userId = currentUserProvider.requireCurrentUserId();
        List<CalendarEventDto> events = calendarRepository.findEventsByUserId(userId);
        List<ReviewTopicDto> reviewTopics = calendarRepository.findReviewTopicsByUserId(userId, null);
        return IcsExporter.exportIcs(events, reviewTopics);
    }

    private static LocalDate parseOptionalDate(String raw, String fieldName) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(raw.trim());
        } catch (DateTimeParseException ex) {
            throw new BusinessException(
                    ErrorCode.BAD_REQUEST,
                    "日期参数 " + fieldName + " 格式不合法，应为 YYYY-MM-DD"
            );
        }
    }
}
