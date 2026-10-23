package com.oneterm.extract.core;

import com.oneterm.extract.dto.EventInputDto;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;

import java.io.ByteArrayInputStream;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 高校标准周次课表纯算法解析器（无 Spring 依赖）：
 * 1. 自动识别学期开学日期（第一周周一）、学期总周数；
 * 2. 精准提取「课程名称、星期、节次、周次范围、教室地点、授课教师」；
 * 3. 支持按照指定周次范围（例如第 1 周至第 21 周，或当前周）自动展开计算具体公历日期并生成日程事件。
 */
public final class TimetableWeekParser {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final Pattern SEMESTER_PATTERN = Pattern.compile(
            "本学期\\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\\s*[^\\d]*至\\s*([0-9]{4}-[0-9]{2}-[0-9]{2})[^\\d]*结束[^\\d]*共\\s*([0-9]+)\\s*周"
    );
    private static final Pattern SECTION_PATTERN = Pattern.compile("\\(?([0-9]+)-([0-9]+)节\\)?");
    private static final Pattern WEEK_RANGE_PATTERN = Pattern.compile("([0-9]+)-([0-9]+)周");
    private static final Pattern SINGLE_WEEK_PATTERN = Pattern.compile("([0-9]+)周");

    private static final Map<String, Integer> DAY_MAP = Map.ofEntries(
            Map.entry("星期一", 1), Map.entry("周一", 1),
            Map.entry("星期二", 2), Map.entry("周二", 2),
            Map.entry("星期三", 3), Map.entry("周三", 3),
            Map.entry("星期四", 4), Map.entry("周四", 4),
            Map.entry("星期五", 5), Map.entry("周五", 5),
            Map.entry("星期六", 6), Map.entry("周六", 6),
            Map.entry("星期日", 7), Map.entry("周日", 7), Map.entry("星期天", 7)
    );

    private TimetableWeekParser() {
    }

    public record SemesterMetadata(
            LocalDate startDate,
            LocalDate endDate,
            int totalWeeks
    ) {
    }

    public record TimetableSlot(
            String courseName,
            int dayOfWeek,
            String dayName,
            int startSection,
            int endSection,
            int startWeek,
            int endWeek,
            String location,
            String teacher,
            String rawCell
    ) {
    }

    public record ParseResult(
            SemesterMetadata semester,
            List<TimetableSlot> slots,
            List<EventInputDto> expandedEvents
    ) {
    }

    /**
     * 直接从 Excel（.xls / .xlsx）字节流解析周次课表。
     */
    public static ParseResult parseFromSpreadsheet(
            byte[] bytes,
            LocalDate customStartDate,
            Integer filterStartWeek,
            Integer filterEndWeek
    ) {
        if (bytes == null || bytes.length == 0) {
            throw new IllegalArgumentException("Excel 字节流不能为空");
        }

        DataFormatter formatter = new DataFormatter();
        SemesterMetadata detectedSemester = null;
        List<TimetableSlot> slots = new ArrayList<>();

        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
            int sheetCount = workbook.getNumberOfSheets();
            for (int s = 0; s < sheetCount; s++) {
                Sheet sheet = workbook.getSheetAt(s);
                if (sheet == null) continue;

                Map<Integer, Integer> colToDayNum = new HashMap<>();
                Map<Integer, String> colToDayName = new HashMap<>();

                int rowCount = sheet.getPhysicalNumberOfRows();
                for (int r = 0; r < rowCount; r++) {
                    Row row = sheet.getRow(r);
                    if (row == null) continue;

                    short lastCell = row.getLastCellNum();
                    for (int c = 0; c < lastCell; c++) {
                        Cell cell = row.getCell(c, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                        if (cell == null) continue;
                        String val = formatter.formatCellValue(cell);
                        if (val == null || val.isBlank()) continue;
                        String trimmed = val.trim();

                        // 1. 扫描学期起始备注信息
                        if (detectedSemester == null) {
                            Matcher semMatcher = SEMESTER_PATTERN.matcher(trimmed);
                            if (semMatcher.find()) {
                                try {
                                    LocalDate sDate = LocalDate.parse(semMatcher.group(1), DATE_FMT);
                                    LocalDate eDate = LocalDate.parse(semMatcher.group(2), DATE_FMT);
                                    int totalWeeks = Integer.parseInt(semMatcher.group(3));
                                    detectedSemester = new SemesterMetadata(sDate, eDate, totalWeeks);
                                } catch (Exception ignored) {
                                }
                            }
                        }

                        // 2. 识别表头星期几所在列
                        for (Map.Entry<String, Integer> entry : DAY_MAP.entrySet()) {
                            if (trimmed.equals(entry.getKey()) || trimmed.contains(entry.getKey())) {
                                colToDayNum.put(c, entry.getValue());
                                colToDayName.put(c, entry.getKey());
                                break;
                            }
                        }

                        // 3. 识别具体课程格子 (需属于已识别的星期列)
                        if (colToDayNum.containsKey(c) && trimmed.contains("/") && trimmed.contains("周")) {
                            TimetableSlot slot = parseCellSlot(trimmed, colToDayNum.get(c), colToDayName.get(c));
                            if (slot != null) {
                                slots.add(slot);
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            throw new IllegalArgumentException("解析课表 Excel 异常: " + e.getMessage(), e);
        }

        LocalDate effectiveStartDate = customStartDate != null
                ? customStartDate
                : (detectedSemester != null ? detectedSemester.startDate() : LocalDate.of(2026, 8, 24));
        int totalWeeks = detectedSemester != null ? detectedSemester.totalWeeks() : 21;
        LocalDate effectiveEndDate = detectedSemester != null
                ? detectedSemester.endDate()
                : effectiveStartDate.plusWeeks(totalWeeks).minusDays(1);

        SemesterMetadata finalSemester = new SemesterMetadata(effectiveStartDate, effectiveEndDate, totalWeeks);
        List<EventInputDto> expanded = expandSlotsToEvents(slots, effectiveStartDate, filterStartWeek, filterEndWeek);

        return new ParseResult(finalSemester, slots, expanded);
    }

    /**
     * 将解析出的周次课程格子按学期开学日期与周次范围展开为具体日期的 EventInputDto。
     */
    public static List<EventInputDto> expandSlotsToEvents(
            List<TimetableSlot> slots,
            LocalDate semesterStartMonday,
            Integer filterStartWeek,
            Integer filterEndWeek
    ) {
        List<EventInputDto> events = new ArrayList<>();
        if (slots == null || slots.isEmpty() || semesterStartMonday == null) {
            return events;
        }

        // 确保 semesterStartMonday 是该周周一
        LocalDate monday = semesterStartMonday.with(DayOfWeek.MONDAY);

        int minWeek = filterStartWeek != null ? Math.max(1, filterStartWeek) : 1;
        int maxWeek = filterEndWeek != null ? Math.max(minWeek, filterEndWeek) : 30;

        for (TimetableSlot slot : slots) {
            int startW = Math.max(slot.startWeek(), minWeek);
            int endW = Math.min(slot.endWeek(), maxWeek);

            String timeStart = sectionToStartTime(slot.startSection());
            String timeEnd = sectionToEndTime(slot.endSection());

            for (int w = startW; w <= endW; w++) {
                LocalDate eventDate = monday.plusWeeks(w - 1).plusDays(slot.dayOfWeek() - 1);
                String startDateTime = eventDate.format(DATE_FMT) + " " + timeStart;
                String endDateTime = eventDate.format(DATE_FMT) + " " + timeEnd;

                String displayTitle = slot.courseName();
                if (slot.teacher() != null && !slot.teacher().isBlank()) {
                    displayTitle += " (" + slot.teacher() + ")";
                }

                String source = String.format("【第%d周 %s %d-%d节】%s",
                        w, slot.dayName(), slot.startSection(), slot.endSection(), slot.rawCell());

                events.add(new EventInputDto(
                        "course",
                        displayTitle,
                        startDateTime,
                        endDateTime,
                        slot.location() != null ? slot.location() : "",
                        slot.courseName(),
                        source
                ));
            }
        }

        return events;
    }

    private static TimetableSlot parseCellSlot(String text, int dayOfWeek, String dayName) {
        String[] parts = text.split("/");
        if (parts.length < 2) return null;

        String courseName = parts[0].trim();
        String timePart = parts[1].trim();
        String location = parts.length > 2 ? parts[2].trim() : "";
        String teacher = parts.length > 3 ? parts[3].trim() : "";

        Matcher secMatcher = SECTION_PATTERN.matcher(timePart);
        if (!secMatcher.find()) return null;

        int startSec = Integer.parseInt(secMatcher.group(1));
        int endSec = Integer.parseInt(secMatcher.group(2));

        int startWeek = 1;
        int endWeek = 21;
        Matcher weekMatcher = WEEK_RANGE_PATTERN.matcher(timePart);
        if (weekMatcher.find()) {
            startWeek = Integer.parseInt(weekMatcher.group(1));
            endWeek = Integer.parseInt(weekMatcher.group(2));
        } else {
            Matcher singleMatcher = SINGLE_WEEK_PATTERN.matcher(timePart);
            if (singleMatcher.find()) {
                startWeek = Integer.parseInt(singleMatcher.group(1));
                endWeek = startWeek;
            }
        }

        return new TimetableSlot(
                courseName,
                dayOfWeek,
                dayName,
                startSec,
                endSec,
                startWeek,
                endWeek,
                location,
                teacher,
                text
        );
    }

    public static String sectionToStartTime(int section) {
        return switch (section) {
            case 1, 2 -> "08:00";
            case 3, 4 -> "10:00";
            case 5, 6 -> "14:00";
            case 7, 8 -> "16:00";
            case 9, 10, 11 -> "19:00";
            default -> String.format("%02d:00", Math.min(22, 7 + section));
        };
    }

    public static String sectionToEndTime(int section) {
        return switch (section) {
            case 1, 2 -> "09:40";
            case 3, 4 -> "11:40";
            case 5, 6 -> "15:40";
            case 7, 8 -> "17:40";
            case 9, 10, 11 -> "20:40";
            default -> String.format("%02d:40", Math.min(23, 7 + section));
        };
    }
}
