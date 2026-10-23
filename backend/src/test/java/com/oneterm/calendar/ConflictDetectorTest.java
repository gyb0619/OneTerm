package com.oneterm.calendar;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.oneterm.calendar.core.ConflictDetector;
import com.oneterm.calendar.dto.CalendarEventDto;
import com.oneterm.calendar.dto.ConflictPairDto;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConflictDetectorTest {

    @Test
    @DisplayName("完全重叠与包含重叠应被识别为 FULL_OVERLAP")
    void shouldDetectFullOverlapAndContainment() {
        CalendarEventDto exam = new CalendarEventDto(
                1L, 1L, "exam", "《操作系统》期中上机考核",
                "2026-11-06T19:00:00+08:00", "2026-11-06T21:00:00+08:00",
                "信息中心机房 D401", "操作系统", "机考原文"
        );
        CalendarEventDto activity = new CalendarEventDto(
                2L, 1L, "activity", "ACM 协会秋季招新沙龙",
                "2026-11-06T19:00:00+08:00", "2026-11-06T21:00:00+08:00",
                "学生活动中心 203", "", "活动原文"
        );
        CalendarEventDto subQuiz = new CalendarEventDto(
                3L, 1L, "exam", "随堂小测",
                "2026-11-06T19:30:00+08:00", "2026-11-06T20:30:00+08:00",
                "D401", "操作系统", "小测原文"
        );

        List<ConflictPairDto> identicalConflicts = ConflictDetector.detectConflicts(List.of(exam, activity));
        assertEquals(1, identicalConflicts.size());
        ConflictPairDto pair1 = identicalConflicts.get(0);
        assertEquals(ConflictPairDto.FULL_OVERLAP, pair1.conflictType());
        assertEquals("2026-11-06T19:00:00+08:00", pair1.overlapStart());
        assertEquals("2026-11-06T21:00:00+08:00", pair1.overlapEnd());

        List<ConflictPairDto> containedConflicts = ConflictDetector.detectConflicts(List.of(exam, subQuiz));
        assertEquals(1, containedConflicts.size());
        ConflictPairDto pair2 = containedConflicts.get(0);
        assertEquals(ConflictPairDto.FULL_OVERLAP, pair2.conflictType());
        assertEquals("2026-11-06T19:30:00+08:00", pair2.overlapStart());
        assertEquals("2026-11-06T20:30:00+08:00", pair2.overlapEnd());
    }

    @Test
    @DisplayName("部分交错重叠应被识别为 PARTIAL_OVERLAP")
    void shouldDetectPartialOverlap() {
        CalendarEventDto lab = new CalendarEventDto(
                10L, 1L, "course", "《计算机网络》实验课",
                "2026-11-04T14:00:00+08:00", "2026-11-04T16:00:00+08:00",
                "实验楼 B205", "计算机网络", "实验原文"
        );
        CalendarEventDto quiz = new CalendarEventDto(
                11L, 1L, "exam", "《算法设计与分析》期中随堂测验",
                "2026-11-04T15:00:00+08:00", "2026-11-04T17:00:00+08:00",
                "教学楼 C101", "算法设计与分析", "测验原文"
        );

        List<ConflictPairDto> conflicts = ConflictDetector.detectConflicts(List.of(quiz, lab));
        assertEquals(1, conflicts.size());
        ConflictPairDto conflict = conflicts.get(0);
        assertEquals(10L, conflict.eventA().id());
        assertEquals(11L, conflict.eventB().id());
        assertEquals(ConflictPairDto.PARTIAL_OVERLAP, conflict.conflictType());
        assertEquals("2026-11-04T15:00:00+08:00", conflict.overlapStart());
        assertEquals("2026-11-04T16:00:00+08:00", conflict.overlapEnd());
    }

    @Test
    @DisplayName("首尾相接（endA == startB）不应被判定为冲突")
    void shouldNotTreatAdjacentEventsAsConflict() {
        CalendarEventDto firstCourse = new CalendarEventDto(
                1L, 1L, "course", "《算法设计与分析》课程",
                "2026-11-04T08:00:00+08:00", "2026-11-04T09:40:00+08:00",
                "教学楼 A302", "算法设计与分析", "第1节"
        );
        CalendarEventDto secondCourse = new CalendarEventDto(
                2L, 1L, "course", "《操作系统》课程",
                "2026-11-04T09:40:00+08:00", "2026-11-04T11:20:00+08:00",
                "教学楼 A302", "操作系统", "第2节"
        );

        List<ConflictPairDto> conflicts = ConflictDetector.detectConflicts(List.of(firstCourse, secondCourse));
        assertTrue(conflicts.isEmpty(), "首尾相接的两门课程不应算作冲突");
    }

    @Test
    @DisplayName("跨天事件重叠应能被正确检出，跨天首尾相接不算冲突")
    void shouldHandleCrossDayEventsCorrectly() {
        CalendarEventDto overnightHackathon = new CalendarEventDto(
                20L, 1L, "activity", "跨夜程序设计马拉松",
                "2026-11-07T22:00:00+08:00", "2026-11-08T02:00:00+08:00",
                "创新实验室", "", "跨夜活动"
        );
        CalendarEventDto lateNightMaintenance = new CalendarEventDto(
                21L, 1L, "deadline", "系统凌晨提交通道关闭前冲刺",
                "2026-11-08T01:00:00+08:00", "2026-11-08T03:00:00+08:00",
                "线上", "软件工程", "凌晨截止"
        );
        CalendarEventDto afterHackathon = new CalendarEventDto(
                22L, 1L, "notice", "凌晨复盘",
                "2026-11-08T02:00:00+08:00", "2026-11-08T02:30:00+08:00",
                "线上", "", "紧接马拉松结束"
        );

        List<ConflictPairDto> conflicts = ConflictDetector.detectConflicts(
                List.of(overnightHackathon, lateNightMaintenance, afterHackathon)
        );
        // overnightHackathon 与 lateNightMaintenance 在 01:00~02:00 部分重叠；
        // lateNightMaintenance 与 afterHackathon 在 02:00~02:30 包含重叠；
        // overnightHackathon 与 afterHackathon 在 02:00 首尾相接不算冲突！
        assertEquals(2, conflicts.size());
        assertEquals("2026-11-08T01:00:00+08:00", conflicts.get(0).overlapStart());
        assertEquals("2026-11-08T02:00:00+08:00", conflicts.get(0).overlapEnd());
        assertEquals(ConflictPairDto.PARTIAL_OVERLAP, conflicts.get(0).conflictType());

        assertEquals(ConflictPairDto.FULL_OVERLAP, conflicts.get(1).conflictType());
        assertEquals("2026-11-08T02:00:00+08:00", conflicts.get(1).overlapStart());
        assertEquals("2026-11-08T02:30:00+08:00", conflicts.get(1).overlapEnd());
    }

    @Test
    @DisplayName("验收：标准示例数据 expected-events.json 中预置的两处冲突精准检出，且上午相邻课不误判")
    void shouldDetectExactTwoConflictsFromExpectedEventsSample() throws Exception {
        Path samplePath = resolveSamplePath();
        ObjectMapper mapper = new ObjectMapper();
        List<Map<String, String>> rawList = mapper.readValue(
                Files.readString(samplePath),
                new TypeReference<List<Map<String, String>>>() {
                }
        );

        List<CalendarEventDto> sampleEvents = new ArrayList<>();
        for (int i = 0; i < rawList.size(); i++) {
            Map<String, String> item = rawList.get(i);
            sampleEvents.add(new CalendarEventDto(
                    i + 1L,
                    1L,
                    item.get("type"),
                    item.get("title"),
                    item.get("startTime"),
                    item.get("endTime"),
                    item.getOrDefault("location", ""),
                    item.getOrDefault("courseName", ""),
                    item.getOrDefault("sourceText", "")
            ));
        }

        List<ConflictPairDto> conflicts = ConflictDetector.detectConflicts(sampleEvents);
        assertEquals(2, conflicts.size(), "示例数据应恰好检出 2 处预置冲突");

        // 冲突 1：11月4日下午 计网实验课 (14:00~16:00) 与 算法期中测验 (15:00~17:00)
        ConflictPairDto first = conflicts.get(0);
        assertEquals("《计算机网络》实验课", first.eventA().title());
        assertEquals("《算法设计与分析》期中随堂测验", first.eventB().title());
        assertEquals(ConflictPairDto.PARTIAL_OVERLAP, first.conflictType());
        assertEquals("2026-11-04T15:00:00+08:00", first.overlapStart());
        assertEquals("2026-11-04T16:00:00+08:00", first.overlapEnd());

        // 冲突 2：11月6日晚 操作系统机考 (19:00~21:00) 与 ACM 招新活动 (19:00~21:00)
        ConflictPairDto second = conflicts.get(1);
        assertEquals("《操作系统》期中上机考核", second.eventA().title());
        assertEquals("ACM 协会秋季招新沙龙暨算法分享会", second.eventB().title());
        assertEquals(ConflictPairDto.FULL_OVERLAP, second.conflictType());
        assertEquals("2026-11-06T19:00:00+08:00", second.overlapStart());
        assertEquals("2026-11-06T21:00:00+08:00", second.overlapEnd());

        // 验证 11月4日上午两节首尾相接课程（08:00~09:40 与 09:40~11:20）未被误判为冲突
        boolean anyMorningCourseConflict = conflicts.stream().anyMatch(
                c -> "《算法设计与分析》课程".equals(c.eventA().title())
                        || "《操作系统》课程".equals(c.eventB().title())
        );
        assertFalse(anyMorningCourseConflict, "11月4日上午相邻课程不应被误报为冲突");

        Set<LocalDate> conflictDates = ConflictDetector.extractConflictDates(sampleEvents);
        assertEquals(Set.of(LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 6)), conflictDates);
    }

    private static Path resolveSamplePath() {
        Path direct = Path.of("docs/samples/expected-events.json");
        if (Files.exists(direct)) {
            return direct;
        }
        return Path.of("../docs/samples/expected-events.json");
    }
}
