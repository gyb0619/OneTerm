package com.oneterm.calendar.core;

import com.oneterm.calendar.dto.CalendarEventDto;
import com.oneterm.calendar.dto.ReviewTopicDto;

import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 考前复习路径倒排纯算法类（无框架依赖）。
 * <p>
 * 算法规则（严格对齐 PRD F6）：
 * 1. 按知识点关联的考试日期（{@code examDate}）倒排，仅在考试日期之前的日期窗口 {@code [startDate, examDate - 1]} 内分配。
 * 2. 自动避开存在日程时间冲突的日期（由 {@link ConflictDetector#extractConflictDates(List)} 检出）。
 * 3. 优先选择空闲日（当日负载分 = 0）或低负载日，每分配一个复习知识点增加当日负载分（+2 分），实现多知识点在多天之间的负载均衡。
 * 4. 在同分值的候选日期中，优先选择离考试更近的日期（倒排），并将同一门考试的多个知识点按时间先后顺序排布。
 */
public final class ReviewPathScheduler {

    private ReviewPathScheduler() {
    }

    /**
     * 为考前复习知识点列表自动生成倒排复习计划日期。
     *
     * @param topics    待排期的复习知识点列表
     * @param events    当前用户的全部日程事件
     * @param startDate 排期基准起始日（可为 null，为 null 时自动按事件最早日期所在周推导）
     * @return 更新了 {@code plannedDate} 的复习知识点列表（保持原列表顺序）
     */
    public static List<ReviewTopicDto> schedule(
            List<ReviewTopicDto> topics,
            List<CalendarEventDto> events,
            LocalDate startDate
    ) {
        if (topics == null || topics.isEmpty()) {
            return List.of();
        }
        List<CalendarEventDto> safeEvents = events != null ? events : List.of();

        // 1. 索引事件 ID -> 事件详情，并计算事件最早与最晚日期
        Map<Long, CalendarEventDto> eventMap = new HashMap<>();
        LocalDate earliestEventDate = null;
        LocalDate latestEventDate = null;
        Map<LocalDate, Integer> dailyScoreMap = new HashMap<>();
        Map<LocalDate, Integer> dailyReviewCountMap = new HashMap<>();

        for (CalendarEventDto event : safeEvents) {
            if (event == null) {
                continue;
            }
            eventMap.put(event.id(), event);
            if (event.startTime() == null || event.endTime() == null) {
                continue;
            }
            ZonedDateTime startZdt = CalendarTimeUtils.parseShanghaiDateTime(event.startTime());
            ZonedDateTime endZdt = CalendarTimeUtils.parseShanghaiDateTime(event.endTime());
            if (!endZdt.isAfter(startZdt)) {
                continue;
            }
            LocalDate s = startZdt.toLocalDate();
            LocalDate e = CalendarTimeUtils.resolveInclusiveEndDate(startZdt, endZdt);
            if (earliestEventDate == null || s.isBefore(earliestEventDate)) {
                earliestEventDate = s;
            }
            if (latestEventDate == null || e.isAfter(latestEventDate)) {
                latestEventDate = e;
            }
            int weight = CalendarTimeUtils.getEventTypeWeight(event.type());
            for (LocalDate d = s; !d.isAfter(e); d = d.plusDays(1)) {
                dailyScoreMap.merge(d, weight, Integer::sum);
            }
        }

        // 2. 提取所有存在日程冲突的日期集合
        Set<LocalDate> conflictDates = ConflictDetector.extractConflictDates(safeEvents);

        // 3. 已完成且已有计划日期的知识点保持不变，并计入当日负载
        Map<Integer, String> assignedDatesByIndex = new HashMap<>();
        Map<LocalDate, List<Integer>> pendingIndicesByExamDate = new LinkedHashMap<>();

        LocalDate fallbackExamDate = latestEventDate != null
                ? latestEventDate
                : (startDate != null ? startDate.plusDays(14) : LocalDate.now(CalendarTimeUtils.SHANGHAI_ZONE).plusDays(14));

        for (int i = 0; i < topics.size(); i++) {
            ReviewTopicDto topic = topics.get(i);
            if (topic == null) {
                continue;
            }
            if (topic.done() && topic.plannedDate() != null && !topic.plannedDate().isBlank()) {
                LocalDate doneDate = CalendarTimeUtils.parseLocalDate(topic.plannedDate());
                assignedDatesByIndex.put(i, doneDate.toString());
                dailyScoreMap.merge(doneDate, WorkloadCalculator.REVIEW_TOPIC_WEIGHT, Integer::sum);
                dailyReviewCountMap.merge(doneDate, 1, Integer::sum);
                continue;
            }

            LocalDate examDate = resolveExamDate(topic, eventMap, fallbackExamDate);
            pendingIndicesByExamDate.computeIfAbsent(examDate, k -> new ArrayList<>()).add(i);
        }

        // 4. 按考试日期从晚到早（倒排）依次为各场考试分配考前复习日期
        List<LocalDate> sortedExamDates = new ArrayList<>(pendingIndicesByExamDate.keySet());
        sortedExamDates.sort(Comparator.reverseOrder());

        for (LocalDate examDate : sortedExamDates) {
            List<Integer> topicIndices = pendingIndicesByExamDate.get(examDate);
            int topicCount = topicIndices.size();

            LocalDate windowEnd = examDate.minusDays(1);
            LocalDate windowStart = resolveCandidateWindowStart(
                    startDate,
                    earliestEventDate,
                    examDate,
                    windowEnd,
                    topicCount
            );

            List<LocalDate> candidateDates = new ArrayList<>();
            for (LocalDate d = windowStart; !d.isAfter(windowEnd); d = d.plusDays(1)) {
                candidateDates.add(d);
            }
            if (candidateDates.isEmpty()) {
                candidateDates.add(windowEnd);
            }

            List<LocalDate> selectedDates = new ArrayList<>(topicCount);
            for (int k = 0; k < topicCount; k++) {
                LocalDate bestDate = candidateDates.stream()
                        .min(Comparator
                                // 优先级 1：严格避开冲突日（非冲突日 false 排在冲突日 true 前面）
                                .comparing((LocalDate d) -> conflictDates.contains(d))
                                // 优先级 2：当日总负载分最低（空闲日 0 分最优先，随后低负载日）
                                .thenComparingInt(d -> dailyScoreMap.getOrDefault(d, 0))
                                // 优先级 3：当日已分配的复习任务数最少，保障均衡分布
                                .thenComparingInt(d -> dailyReviewCountMap.getOrDefault(d, 0))
                                // 优先级 4：倒排原则，同等负载下优先安排在离考试更近的日期
                                .thenComparing(Comparator.reverseOrder()))
                        .orElse(windowEnd);

                selectedDates.add(bestDate);
                dailyScoreMap.merge(bestDate, WorkloadCalculator.REVIEW_TOPIC_WEIGHT, Integer::sum);
                dailyReviewCountMap.merge(bestDate, 1, Integer::sum);
            }

            // 同一门考试的多个知识点按日期从前到后依次对应
            selectedDates.sort(LocalDate::compareTo);
            for (int k = 0; k < topicCount; k++) {
                assignedDatesByIndex.put(topicIndices.get(k), selectedDates.get(k).toString());
            }
        }

        // 5. 组装排期后的返回列表
        List<ReviewTopicDto> result = new ArrayList<>(topics.size());
        for (int i = 0; i < topics.size(); i++) {
            ReviewTopicDto original = topics.get(i);
            if (original == null) {
                continue;
            }
            String plannedDate = assignedDatesByIndex.getOrDefault(i, original.plannedDate());
            CalendarEventDto linkedEvent = eventMap.get(original.eventId());
            String eventTitle = original.eventTitle() != null ? original.eventTitle()
                    : (linkedEvent != null ? linkedEvent.title() : null);
            String courseName = original.courseName() != null ? original.courseName()
                    : (linkedEvent != null ? linkedEvent.courseName() : null);
            String examDateStr = original.examDate() != null ? original.examDate()
                    : (linkedEvent != null && linkedEvent.startTime() != null
                    ? CalendarTimeUtils.parseLocalDate(linkedEvent.startTime()).toString()
                    : null);

            result.add(new ReviewTopicDto(
                    original.id(),
                    original.userId(),
                    original.eventId(),
                    eventTitle,
                    courseName,
                    examDateStr,
                    original.topic(),
                    plannedDate,
                    original.done(),
                    original.visualizationId()
            ));
        }

        return result;
    }

    private static LocalDate resolveExamDate(
            ReviewTopicDto topic,
            Map<Long, CalendarEventDto> eventMap,
            LocalDate fallbackExamDate
    ) {
        if (topic.examDate() != null && !topic.examDate().isBlank()) {
            return CalendarTimeUtils.parseLocalDate(topic.examDate());
        }
        CalendarEventDto event = eventMap.get(topic.eventId());
        if (event != null && event.startTime() != null && !event.startTime().isBlank()) {
            return CalendarTimeUtils.parseLocalDate(event.startTime());
        }
        return fallbackExamDate;
    }

    private static LocalDate resolveCandidateWindowStart(
            LocalDate explicitStartDate,
            LocalDate earliestEventDate,
            LocalDate examDate,
            LocalDate windowEnd,
            int topicCount
    ) {
        if (explicitStartDate != null && !explicitStartDate.isAfter(windowEnd)) {
            return explicitStartDate;
        }
        int lookbackDays = Math.max(7, topicCount * 2 + 2);
        LocalDate defaultStart = examDate.minusDays(lookbackDays);
        if (earliestEventDate != null) {
            LocalDate eventAlignedStart = earliestEventDate.minusDays(2);
            if (!eventAlignedStart.isAfter(windowEnd) && eventAlignedStart.isBefore(examDate.minusDays(2))) {
                return eventAlignedStart.isBefore(defaultStart) ? defaultStart : eventAlignedStart;
            }
        }
        return defaultStart;
    }
}
