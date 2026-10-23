package com.oneterm.calendar;

import com.oneterm.calendar.core.WorkloadCalculator;
import com.oneterm.calendar.dto.CalendarEventDto;
import com.oneterm.calendar.dto.DailyHeatmapItemDto;
import com.oneterm.calendar.dto.ReviewTopicDto;
import com.oneterm.calendar.dto.WeeklyDensityItemDto;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class WorkloadCalculatorTest {

    @Test
    @DisplayName("验证各类事件权重（exam=5, deadline=3, course=2, activity=1, notice=1, review=2）及最空天/最忙天/最忙周识别")
    void shouldCalculateDailyHeatmapWeeklyDensityAndHighlightsCorrectly() {
        List<CalendarEventDto> events = List.of(
                // 周三 2026-11-04：2 门课程 (2+2=4) + 1 门实验课 (2) + 1 场期中测验 (5) = 11 分，4 条事件
                new CalendarEventDto(1L, 1L, "course", "算法课", "2026-11-04T08:00:00+08:00", "2026-11-04T09:40:00+08:00", "A302", "算法", "原文1"),
                new CalendarEventDto(2L, 1L, "course", "操作系统课", "2026-11-04T09:40:00+08:00", "2026-11-04T11:20:00+08:00", "A302", "OS", "原文2"),
                new CalendarEventDto(3L, 1L, "course", "计网实验课", "2026-11-04T14:00:00+08:00", "2026-11-04T16:00:00+08:00", "B205", "计网", "原文3"),
                new CalendarEventDto(4L, 1L, "exam", "算法期中测验", "2026-11-04T15:00:00+08:00", "2026-11-04T17:00:00+08:00", "C101", "算法", "原文4"),
                // 周五 2026-11-06：1 场机考 (5) + 1 场社团活动 (1) + 1 条通知 (1) = 7 分，3 条事件
                new CalendarEventDto(5L, 1L, "exam", "OS机考", "2026-11-06T19:00:00+08:00", "2026-11-06T21:00:00+08:00", "D401", "OS", "原文5"),
                new CalendarEventDto(6L, 1L, "activity", "ACM招新", "2026-11-06T19:00:00+08:00", "2026-11-06T21:00:00+08:00", "203", "", "原文6"),
                new CalendarEventDto(7L, 1L, "notice", "考场规则提醒", "2026-11-06T12:00:00+08:00", "2026-11-06T12:30:00+08:00", "", "", "原文7"),
                // 下周三 2026-11-11：1 个作业截止 (3) = 3 分
                new CalendarEventDto(8L, 1L, "deadline", "算法实验报告截止", "2026-11-11T22:00:00+08:00", "2026-11-11T23:59:00+08:00", "线上", "算法", "原文8"),
                // 下周五 2026-11-13：1 场期末考试 (5) = 5 分
                new CalendarEventDto(9L, 1L, "exam", "计网期末考试", "2026-11-13T09:00:00+08:00", "2026-11-13T11:00:00+08:00", "A105", "计网", "原文9")
        );

        // 排期在 2026-11-10 的复习任务（+2 分）
        List<ReviewTopicDto> reviewTopics = List.of(
                new ReviewTopicDto(100L, 1L, 9L, "计网期末考试", "计网", "2026-11-13", "TCP 三次握手", "2026-11-10", false, null)
        );

        WorkloadCalculator.WorkloadSummary summary = WorkloadCalculator.calculate(
                events,
                reviewTopics,
                LocalDate.of(2026, 11, 2),
                LocalDate.of(2026, 11, 15)
        );

        assertEquals(14, summary.dailyHeatmap().size());
        assertEquals(2, summary.weeklyDensity().size());

        Map<String, DailyHeatmapItemDto> heatmapByDate = summary.dailyHeatmap().stream()
                .collect(Collectors.toMap(DailyHeatmapItemDto::date, d -> d));

        assertEquals(11, heatmapByDate.get("2026-11-04").score());
        assertEquals(4, heatmapByDate.get("2026-11-04").eventCount());

        assertEquals(7, heatmapByDate.get("2026-11-06").score());
        assertEquals(3, heatmapByDate.get("2026-11-06").eventCount());

        assertEquals(2, heatmapByDate.get("2026-11-10").score());
        assertEquals(1, heatmapByDate.get("2026-11-10").eventCount());

        assertEquals(3, heatmapByDate.get("2026-11-11").score());
        assertEquals(5, heatmapByDate.get("2026-11-13").score());

        // 第一周（11-02 ~ 11-08）：总分 11 + 7 = 18；考试 2，截止 0，课程 3，活动 1
        WeeklyDensityItemDto week1 = summary.weeklyDensity().get(0);
        assertEquals("2026-11-02", week1.weekStart());
        assertEquals("2026-11-08", week1.weekEnd());
        assertEquals(18, week1.totalScore());
        assertEquals(2, week1.examCount());
        assertEquals(0, week1.deadlineCount());
        assertEquals(3, week1.courseCount());
        assertEquals(1, week1.activityCount());

        // 第二周（11-09 ~ 11-15）：总分 2(复习) + 3(截止) + 5(考试) = 10；考试 1，截止 1
        WeeklyDensityItemDto week2 = summary.weeklyDensity().get(1);
        assertEquals("2026-11-09", week2.weekStart());
        assertEquals("2026-11-15", week2.weekEnd());
        assertEquals(10, week2.totalScore());
        assertEquals(1, week2.examCount());
        assertEquals(1, week2.deadlineCount());

        // 最空的一天：2026-11-02（0 分，0 事件）
        assertNotNull(summary.freestDay());
        assertEquals("2026-11-02", summary.freestDay().date());
        assertEquals(0, summary.freestDay().score());

        // 最忙的一天：2026-11-04（11 分，4 事件）
        assertNotNull(summary.busiestDay());
        assertEquals("2026-11-04", summary.busiestDay().date());
        assertEquals(11, summary.busiestDay().score());

        // 最忙的一周：2026-11-02 ~ 2026-11-08（18 分）
        assertNotNull(summary.busiestWeek());
        assertEquals("2026-11-02", summary.busiestWeek().weekStart());
        assertEquals(18, summary.busiestWeek().totalScore());
    }
}
