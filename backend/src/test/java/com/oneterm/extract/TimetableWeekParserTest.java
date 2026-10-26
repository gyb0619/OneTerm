package com.oneterm.extract;

import com.oneterm.extract.core.TimetableWeekParser;
import com.oneterm.extract.core.TimetableWeekParser.ParseResult;
import com.oneterm.extract.dto.EventInputDto;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.nio.file.Files;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class TimetableWeekParserTest {

    @Test
    @DisplayName("验证真实 .xls 高校课表按周计算与学期起止周自动展开")
    void testParseRealExcelTimetable() throws Exception {
        File dataDir = new File("../data");
        if (!dataDir.exists() || dataDir.listFiles((dir, name) -> name.endsWith(".xls") || name.endsWith(".xlsx")) == null
                || dataDir.listFiles((dir, name) -> name.endsWith(".xls") || name.endsWith(".xlsx")).length == 0) {
            dataDir = new File("data");
        }
        File[] xlsFiles = dataDir.listFiles((dir, name) -> name.endsWith(".xls") || name.endsWith(".xlsx"));
        assumeTrue(xlsFiles != null && xlsFiles.length > 0, "未检测到本地课表 xls 文件，自动跳过该测试");

        byte[] bytes = Files.readAllBytes(xlsFiles[0].toPath());

        // 1. 全学期解析
        ParseResult result = TimetableWeekParser.parseFromSpreadsheet(bytes, null, 1, 21);

        assertNotNull(result.semester());
        assertEquals(LocalDate.of(2026, 8, 24), result.semester().startDate());
        assertEquals(LocalDate.of(2027, 1, 17), result.semester().endDate());
        assertEquals(21, result.semester().totalWeeks());

        // 验证识别出的固定课性格子
        assertFalse(result.slots().isEmpty());
        assertEquals(16, result.slots().size());

        // 验证生成的按周展开事件
        assertFalse(result.expandedEvents().isEmpty());

        // 2. 仅展开第 2 周进行精确校验
        List<EventInputDto> week2Events = TimetableWeekParser.expandSlotsToEvents(
                result.slots(),
                result.semester().startDate(),
                2,
                2
        );

        // 第 2 周应包含 Monday 08:00 的英语课
        boolean hasEnglish = week2Events.stream().anyMatch(e ->
                e.title().contains("英语应用能力专项培养1（读写）")
                        && e.startTime().startsWith("2026-08-31 08:00")
                        && e.endTime().startsWith("2026-08-31 09:40")
                        && "D402".equals(e.location())
        );
        assertTrue(hasEnglish, "第2周周一应包含英语课");

        // 验证周三的 Python 课
        boolean hasPython = week2Events.stream().anyMatch(e ->
                e.title().contains("Python技术应用")
                        && e.startTime().startsWith("2026-09-02 08:00")
        );
        assertTrue(hasPython, "第2周周三应包含Python课");
    }

    @Test
    @DisplayName("节次时间转换纯函数验证")
    void testSectionTimeMapping() {
        assertEquals("08:00", TimetableWeekParser.sectionToStartTime(1));
        assertEquals("09:40", TimetableWeekParser.sectionToEndTime(2));
        assertEquals("10:00", TimetableWeekParser.sectionToStartTime(3));
        assertEquals("11:40", TimetableWeekParser.sectionToEndTime(4));
        assertEquals("14:00", TimetableWeekParser.sectionToStartTime(5));
        assertEquals("15:40", TimetableWeekParser.sectionToEndTime(6));
        assertEquals("16:00", TimetableWeekParser.sectionToStartTime(7));
        assertEquals("17:40", TimetableWeekParser.sectionToEndTime(8));
        assertEquals("19:00", TimetableWeekParser.sectionToStartTime(9));
    }
}
