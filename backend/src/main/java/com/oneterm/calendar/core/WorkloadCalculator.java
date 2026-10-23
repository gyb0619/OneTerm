package com.oneterm.calendar.core;

import com.oneterm.calendar.dto.CalendarEventDto;
import com.oneterm.calendar.dto.DailyHeatmapItemDto;
import com.oneterm.calendar.dto.ReviewTopicDto;
import com.oneterm.calendar.dto.WeeklyDensityItemDto;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 每周任务密度与学期每日热力图纯算法类（无框架依赖）。
 * <p>
 * 权重规则（严格对齐 PRD F3、CONVENTIONS 5.1 与 OpenAPI）：
 * - 考试 {@code exam}：5 分
 * - 作业截止 {@code deadline}：3 分
 * - 课程 {@code course}：2 分
 * - 活动 {@code activity}：1 分
 * - 通知 {@code notice}：1 分
 * - 已排期的考前复习任务（{@code plannedDate != null}）：2 分
 */
public final class WorkloadCalculator {

    public static final int REVIEW_TOPIC_WEIGHT = 2;

    private WorkloadCalculator() {
    }

    public record WorkloadSummary(
            List<DailyHeatmapItemDto> dailyHeatmap,
            List<WeeklyDensityItemDto> weeklyDensity,
            DailyHeatmapItemDto freestDay,
            DailyHeatmapItemDto busiestDay,
            WeeklyDensityItemDto busiestWeek
    ) {
    }

    private static final class DayAccumulator {
        int score = 0;
        int eventCount = 0;
    }

    private static final class WeekAccumulator {
        final LocalDate weekStart;
        final LocalDate weekEnd;
        int totalScore = 0;
        int examCount = 0;
        int deadlineCount = 0;
        int courseCount = 0;
        int activityCount = 0;

        WeekAccumulator(LocalDate weekStart) {
            this.weekStart = weekStart;
            this.weekEnd = weekStart.plusDays(6);
        }
    }

    /**
     * 自动根据事件与已排期复习任务推导学期周对齐窗口并计算负载统计。
     */
    public static WorkloadSummary calculate(
            List<CalendarEventDto> events,
            List<ReviewTopicDto> reviewTopics
    ) {
        return calculate(events, reviewTopics, null, null);
    }

    /**
     * 在指定的学期起止日期窗口内计算每日热力图、每周任务密度及「最空的一天」「最忙的一天」「最忙的一周」。
     */
    public static WorkloadSummary calculate(
            List<CalendarEventDto> events,
            List<ReviewTopicDto> reviewTopics,
            LocalDate semesterStart,
            LocalDate semesterEnd
    ) {
        List<CalendarEventDto> safeEvents = events != null ? events : List.of();
        List<ReviewTopicDto> safeTopics = reviewTopics != null ? reviewTopics : List.of();

        LocalDate[] window = resolveWindow(safeEvents, safeTopics, semesterStart, semesterEnd);
        if (window == null) {
            return new WorkloadSummary(List.of(), List.of(), null, null, null);
        }

        LocalDate windowStart = window[0];
        LocalDate windowEnd = window[1];

        Map<LocalDate, DayAccumulator> dayMap = new LinkedHashMap<>();
        for (LocalDate d = windowStart; !d.isAfter(windowEnd); d = d.plusDays(1)) {
            dayMap.put(d, new DayAccumulator());
        }

        Map<LocalDate, WeekAccumulator> weekMap = new LinkedHashMap<>();
        LocalDate firstWeekMonday = windowStart.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate lastWeekMonday = windowEnd.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        for (LocalDate w = firstWeekMonday; !w.isAfter(lastWeekMonday); w = w.plusDays(7)) {
            weekMap.put(w, new WeekAccumulator(w));
        }

        for (CalendarEventDto event : safeEvents) {
            if (event == null || event.startTime() == null || event.endTime() == null) {
                continue;
            }
            ZonedDateTime startZdt = CalendarTimeUtils.parseShanghaiDateTime(event.startTime());
            ZonedDateTime endZdt = CalendarTimeUtils.parseShanghaiDateTime(event.endTime());
            if (!endZdt.isAfter(startZdt)) {
                continue;
            }

            LocalDate startDate = startZdt.toLocalDate();
            LocalDate endDate = CalendarTimeUtils.resolveInclusiveEndDate(startZdt, endZdt);
            int weight = CalendarTimeUtils.getEventTypeWeight(event.type());
            String normalizedType = event.type() != null ? event.type().trim().toLowerCase() : "";

            LocalDate clampedStart = startDate.isBefore(windowStart) ? windowStart : startDate;
            LocalDate clampedEnd = endDate.isAfter(windowEnd) ? windowEnd : endDate;

            if (!clampedStart.isAfter(clampedEnd)) {
                for (LocalDate d = clampedStart; !d.isAfter(clampedEnd); d = d.plusDays(1)) {
                    DayAccumulator acc = dayMap.get(d);
                    if (acc != null) {
                        acc.score += weight;
                        acc.eventCount += 1;
                    }
                    LocalDate weekMonday = d.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
                    WeekAccumulator weekAcc = weekMap.get(weekMonday);
                    if (weekAcc != null) {
                        weekAcc.totalScore += weight;
                    }
                }

                // 统计事件所属周次的分类计数（跨周事件在所跨各周分别计入 1 次）
                LocalDate startWeekMonday = clampedStart.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
                LocalDate endWeekMonday = clampedEnd.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
                for (LocalDate w = startWeekMonday; !w.isAfter(endWeekMonday); w = w.plusDays(7)) {
                    WeekAccumulator weekAcc = weekMap.get(w);
                    if (weekAcc != null) {
                        switch (normalizedType) {
                            case "exam" -> weekAcc.examCount++;
                            case "deadline" -> weekAcc.deadlineCount++;
                            case "course" -> weekAcc.courseCount++;
                            case "activity" -> weekAcc.activityCount++;
                            default -> {
                                // notice 计入总分，不单独占四类分类计数
                            }
                        }
                    }
                }
            }
        }

        // 计入已排期的复习任务（每条计 2 分）
        for (ReviewTopicDto topic : safeTopics) {
            if (topic == null || topic.plannedDate() == null || topic.plannedDate().isBlank()) {
                continue;
            }
            LocalDate plannedDate = CalendarTimeUtils.parseLocalDate(topic.plannedDate());
            if (!plannedDate.isBefore(windowStart) && !plannedDate.isAfter(windowEnd)) {
                DayAccumulator acc = dayMap.get(plannedDate);
                if (acc != null) {
                    acc.score += REVIEW_TOPIC_WEIGHT;
                    acc.eventCount += 1;
                }
                LocalDate weekMonday = plannedDate.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
                WeekAccumulator weekAcc = weekMap.get(weekMonday);
                if (weekAcc != null) {
                    weekAcc.totalScore += REVIEW_TOPIC_WEIGHT;
                }
            }
        }

        List<DailyHeatmapItemDto> dailyHeatmap = new ArrayList<>(dayMap.size());
        for (Map.Entry<LocalDate, DayAccumulator> entry : dayMap.entrySet()) {
            DayAccumulator acc = entry.getValue();
            dailyHeatmap.add(new DailyHeatmapItemDto(
                    entry.getKey().toString(),
                    acc.score,
                    acc.eventCount
            ));
        }

        List<WeeklyDensityItemDto> weeklyDensity = new ArrayList<>(weekMap.size());
        for (WeekAccumulator weekAcc : weekMap.values()) {
            weeklyDensity.add(new WeeklyDensityItemDto(
                    weekAcc.weekStart.toString(),
                    weekAcc.weekEnd.toString(),
                    weekAcc.totalScore,
                    weekAcc.examCount,
                    weekAcc.deadlineCount,
                    weekAcc.courseCount,
                    weekAcc.activityCount
            ));
        }

        DailyHeatmapItemDto freestDay = dailyHeatmap.stream()
                .min(Comparator
                        .comparingInt(DailyHeatmapItemDto::score)
                        .thenComparingInt(DailyHeatmapItemDto::eventCount)
                        .thenComparing(DailyHeatmapItemDto::date))
                .orElse(null);

        DailyHeatmapItemDto busiestDay = dailyHeatmap.stream()
                .max(Comparator
                        .comparingInt(DailyHeatmapItemDto::score)
                        .thenComparingInt(DailyHeatmapItemDto::eventCount)
                        .thenComparing(Comparator.comparing(DailyHeatmapItemDto::date).reversed()))
                .orElse(null);

        WeeklyDensityItemDto busiestWeek = weeklyDensity.stream()
                .max(Comparator
                        .comparingInt(WeeklyDensityItemDto::totalScore)
                        .thenComparingInt(WeeklyDensityItemDto::examCount)
                        .thenComparingInt(WeeklyDensityItemDto::deadlineCount)
                        .thenComparing(Comparator.comparing(WeeklyDensityItemDto::weekStart).reversed()))
                .orElse(null);

        return new WorkloadSummary(dailyHeatmap, weeklyDensity, freestDay, busiestDay, busiestWeek);
    }

    private static LocalDate[] resolveWindow(
            List<CalendarEventDto> events,
            List<ReviewTopicDto> reviewTopics,
            LocalDate semesterStart,
            LocalDate semesterEnd
    ) {
        LocalDate minDate = semesterStart;
        LocalDate maxDate = semesterEnd;

        if (minDate == null || maxDate == null) {
            LocalDate detectedMin = null;
            LocalDate detectedMax = null;

            for (CalendarEventDto event : events) {
                if (event == null || event.startTime() == null || event.endTime() == null) {
                    continue;
                }
                ZonedDateTime startZdt = CalendarTimeUtils.parseShanghaiDateTime(event.startTime());
                ZonedDateTime endZdt = CalendarTimeUtils.parseShanghaiDateTime(event.endTime());
                if (!endZdt.isAfter(startZdt)) {
                    continue;
                }
                LocalDate s = startZdt.toLocalDate();
                LocalDate e = CalendarTimeUtils.resolveInclusiveEndDate(startZdt, endZdt);
                if (detectedMin == null || s.isBefore(detectedMin)) {
                    detectedMin = s;
                }
                if (detectedMax == null || e.isAfter(detectedMax)) {
                    detectedMax = e;
                }
            }

            for (ReviewTopicDto topic : reviewTopics) {
                if (topic == null || topic.plannedDate() == null || topic.plannedDate().isBlank()) {
                    continue;
                }
                LocalDate d = CalendarTimeUtils.parseLocalDate(topic.plannedDate());
                if (detectedMin == null || d.isBefore(detectedMin)) {
                    detectedMin = d;
                }
                if (detectedMax == null || d.isAfter(detectedMax)) {
                    detectedMax = d;
                }
            }

            if (minDate == null && detectedMin != null) {
                minDate = detectedMin.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            }
            if (maxDate == null && detectedMax != null) {
                maxDate = detectedMax.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
            }
        }

        if (minDate == null || maxDate == null) {
            return null;
        }
        if (maxDate.isBefore(minDate)) {
            LocalDate tmp = minDate;
            minDate = maxDate;
            maxDate = tmp;
        }
        return new LocalDate[]{minDate, maxDate};
    }
}
