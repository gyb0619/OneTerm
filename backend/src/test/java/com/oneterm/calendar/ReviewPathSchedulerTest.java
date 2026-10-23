package com.oneterm.calendar;

import com.oneterm.calendar.core.ConflictDetector;
import com.oneterm.calendar.core.ReviewPathScheduler;
import com.oneterm.calendar.dto.CalendarEventDto;
import com.oneterm.calendar.dto.ReviewTopicDto;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ReviewPathSchedulerTest {

    @Test
    @DisplayName("多知识点按关联考试日期倒排，自动避开冲突日与高负载日并均衡分配到空闲日")
    void shouldScheduleBackwardAvoidingConflictDaysAndBalancingLoad() {
        List<CalendarEventDto> events = List.of(
                // 2026-11-04 存在冲突（实验课 14:00~16:00 与 期中测验 15:00~17:00）
                new CalendarEventDto(1L, 1L, "course", "《计算机网络》实验课",
                        "2026-11-04T14:00:00+08:00", "2026-11-04T16:00:00+08:00", "B205", "计算机网络", "实验"),
                new CalendarEventDto(2L, 1L, "exam", "《算法设计与分析》期中随堂测验",
                        "2026-11-04T15:00:00+08:00", "2026-11-04T17:00:00+08:00", "C101", "算法设计与分析", "测验"),
                // 2026-11-06 存在冲突（OS机考 19:00~21:00 与 ACM活动 19:00~21:00）
                new CalendarEventDto(3L, 1L, "exam", "《操作系统》期中上机考核",
                        "2026-11-06T19:00:00+08:00", "2026-11-06T21:00:00+08:00", "D401", "操作系统", "机考"),
                new CalendarEventDto(4L, 1L, "activity", "ACM 招新沙龙",
                        "2026-11-06T19:00:00+08:00", "2026-11-06T21:00:00+08:00", "203", "", "活动"),
                // 2026-11-11 与 2026-11-12 各有作业截止（负载分 3）
                new CalendarEventDto(5L, 1L, "deadline", "算法第二次实验报告截止",
                        "2026-11-11T22:00:00+08:00", "2026-11-11T23:59:00+08:00", "线上", "算法设计与分析", "截止1"),
                new CalendarEventDto(6L, 1L, "deadline", "计网抓包实验报告截止",
                        "2026-11-12T20:00:00+08:00", "2026-11-12T22:00:00+08:00", "线上", "计算机网络", "截止2"),
                // 2026-11-13 计网期末考试
                new CalendarEventDto(7L, 1L, "exam", "《计算机网络》期末考试",
                        "2026-11-13T09:00:00+08:00", "2026-11-13T11:00:00+08:00", "A105", "计算机网络", "期末")
        );

        Set<LocalDate> conflictDates = ConflictDetector.extractConflictDates(events);
        assertEquals(Set.of(LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 6)), conflictDates);

        List<ReviewTopicDto> topics = List.of(
                // 关联 11-06 OS 机考的知识点
                new ReviewTopicDto(101L, 1L, 3L, null, null, null, "银行家算法", null, false, null),
                // 关联 11-13 计网期末考试的 3 个知识点
                new ReviewTopicDto(102L, 1L, 7L, null, null, null, "TCP 三次握手与四次挥手", null, false, null),
                new ReviewTopicDto(103L, 1L, 7L, null, null, null, "滑动窗口流量控制", null, false, null),
                new ReviewTopicDto(104L, 1L, 7L, null, null, null, "OSPF 路由协议", null, false, null)
        );

        List<ReviewTopicDto> scheduled = ReviewPathScheduler.schedule(
                topics,
                events,
                LocalDate.of(2026, 11, 3)
        );

        assertEquals(4, scheduled.size());

        for (ReviewTopicDto item : scheduled) {
            assertNotNull(item.plannedDate(), "每个知识点都应生成 plannedDate");
            LocalDate planned = LocalDate.parse(item.plannedDate());
            LocalDate examDate = LocalDate.parse(item.examDate());
            assertTrue(planned.isBefore(examDate),
                    "复习日期 " + planned + " 必须早于考试日期 " + examDate);
            assertFalse(conflictDates.contains(planned),
                    "复习日期 " + planned + " 必须避开冲突日 " + conflictDates);
        }

        // OS 机考在 11-06，候选窗口 [11-03, 11-05] 中 11-04 为冲突日，倒排最优先空闲日应为 2026-11-05
        ReviewTopicDto osTopic = scheduled.get(0);
        assertEquals("2026-11-05", osTopic.plannedDate());
        assertEquals("《操作系统》期中上机考核", osTopic.eventTitle());

        // 计网期末在 11-13，11-12 与 11-11 有作业截止（3 分），而 11-10、11-09、11-08 为 0 分空闲日
        // 3 个计网知识点应均衡分配在 3 个不同的空闲日：2026-11-08、2026-11-09、2026-11-10
        List<String> cnPlannedDates = scheduled.subList(1, 4).stream()
                .map(ReviewTopicDto::plannedDate)
                .collect(Collectors.toList());
        assertEquals(List.of("2026-11-08", "2026-11-09", "2026-11-10"), cnPlannedDates);
    }

    @Test
    @DisplayName("已完成（done=true）且已有计划日期的复习任务在重排时应保持原日期不变")
    void shouldPreserveCompletedTopicPlannedDate() {
        List<CalendarEventDto> events = List.of(
                new CalendarEventDto(1L, 1L, "exam", "算法期末",
                        "2026-11-10T09:00:00+08:00", "2026-11-10T11:00:00+08:00", "A101", "算法", "期末")
        );
        List<ReviewTopicDto> topics = List.of(
                new ReviewTopicDto(1L, 1L, 1L, "算法期末", "算法", "2026-11-10", "冒泡排序", "2026-11-09", true, 10L),
                new ReviewTopicDto(2L, 1L, 1L, "算法期末", "算法", "2026-11-10", "快速排序", null, false, null)
        );

        List<ReviewTopicDto> scheduled = ReviewPathScheduler.schedule(
                topics,
                events,
                LocalDate.of(2026, 11, 7)
        );

        assertEquals("2026-11-09", scheduled.get(0).plannedDate());
        // 2026-11-09 已有已完成的复习任务（2 分），因此第二个知识点倒排分配到 0 分的 2026-11-08
        assertEquals("2026-11-08", scheduled.get(1).plannedDate());
    }
}
