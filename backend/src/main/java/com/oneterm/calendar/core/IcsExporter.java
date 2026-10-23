package com.oneterm.calendar.core;

import com.oneterm.calendar.dto.CalendarEventDto;
import com.oneterm.calendar.dto.ReviewTopicDto;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 标准 RFC 5545 iCalendar (.ics) 日历文件生成纯函数（无框架依赖）。
 * <p>
 * 支持将当前用户的结构化日程事件与已排期考前复习任务一并导出为可导入手机/桌面日历的 {@code .ics} 文本，
 * 统一附带 {@code Asia/Shanghai} 时区信息。
 */
public final class IcsExporter {

    private static final String CRLF = "\r\n";
    private static final DateTimeFormatter UTC_STAMP_FORMATTER =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);

    private IcsExporter() {
    }

    /**
     * 生成包含事件与已排期复习任务的标准 RFC 5545 .ics 文本。
     */
    public static String exportIcs(List<CalendarEventDto> events, List<ReviewTopicDto> reviewTopics) {
        List<CalendarEventDto> safeEvents = events != null ? events : List.of();
        List<ReviewTopicDto> safeTopics = reviewTopics != null ? reviewTopics : List.of();

        String dtStamp = UTC_STAMP_FORMATTER.format(ZonedDateTime.now(ZoneOffset.UTC));
        StringBuilder sb = new StringBuilder(2048);

        sb.append("BEGIN:VCALENDAR").append(CRLF);
        sb.append("VERSION:2.0").append(CRLF);
        sb.append("PRODID:-//OneTerm//OneTerm Semester Planner//CN").append(CRLF);
        sb.append("CALSCALE:GREGORIAN").append(CRLF);
        sb.append("METHOD:PUBLISH").append(CRLF);
        sb.append("X-WR-CALNAME:一学期 OneTerm 学期规划").append(CRLF);
        sb.append("X-WR-TIMEZONE:Asia/Shanghai").append(CRLF);

        // 标准 VTIMEZONE 声明（Asia/Shanghai UTC+8）
        sb.append("BEGIN:VTIMEZONE").append(CRLF);
        sb.append("TZID:Asia/Shanghai").append(CRLF);
        sb.append("BEGIN:STANDARD").append(CRLF);
        sb.append("TZOFFSETFROM:+0800").append(CRLF);
        sb.append("TZOFFSETTO:+0800").append(CRLF);
        sb.append("TZNAME:CST").append(CRLF);
        sb.append("DTSTART:19700101T000000").append(CRLF);
        sb.append("END:STANDARD").append(CRLF);
        sb.append("END:VTIMEZONE").append(CRLF);

        for (CalendarEventDto event : safeEvents) {
            if (event == null || event.startTime() == null || event.endTime() == null) {
                continue;
            }
            ZonedDateTime startZdt = CalendarTimeUtils.parseShanghaiDateTime(event.startTime());
            ZonedDateTime endZdt = CalendarTimeUtils.parseShanghaiDateTime(event.endTime());
            if (!endZdt.isAfter(startZdt)) {
                continue;
            }

            String typeLabel = formatTypeLabel(event.type());
            String summary = "[" + typeLabel + "] " + nullToEmpty(event.title());
            StringBuilder desc = new StringBuilder();
            if (event.courseName() != null && !event.courseName().isBlank()) {
                desc.append("课程：").append(event.courseName()).append("\n");
            }
            if (event.sourceText() != null && !event.sourceText().isBlank()) {
                desc.append("原文摘录：").append(event.sourceText());
            }

            sb.append("BEGIN:VEVENT").append(CRLF);
            sb.append("UID:oneterm-event-").append(event.id()).append("@oneterm.local").append(CRLF);
            sb.append("DTSTAMP:").append(dtStamp).append(CRLF);
            sb.append("DTSTART;TZID=Asia/Shanghai:")
                    .append(startZdt.format(CalendarTimeUtils.ICS_LOCAL_FORMATTER)).append(CRLF);
            sb.append("DTEND;TZID=Asia/Shanghai:")
                    .append(endZdt.format(CalendarTimeUtils.ICS_LOCAL_FORMATTER)).append(CRLF);
            sb.append("SUMMARY:").append(escapeIcsText(summary)).append(CRLF);
            if (event.location() != null && !event.location().isBlank()) {
                sb.append("LOCATION:").append(escapeIcsText(event.location())).append(CRLF);
            }
            if (!desc.isEmpty()) {
                sb.append("DESCRIPTION:").append(escapeIcsText(desc.toString())).append(CRLF);
            }
            sb.append("CATEGORIES:").append(escapeIcsText(typeLabel)).append(CRLF);
            sb.append("END:VEVENT").append(CRLF);
        }

        for (ReviewTopicDto topic : safeTopics) {
            if (topic == null || topic.plannedDate() == null || topic.plannedDate().isBlank()) {
                continue;
            }
            LocalDate date = CalendarTimeUtils.parseLocalDate(topic.plannedDate());
            // 默认将考前复习任务安排在当日 20:00 - 21:30（Asia/Shanghai）
            ZonedDateTime reviewStart = ZonedDateTime.of(date, LocalTime.of(20, 0), CalendarTimeUtils.SHANGHAI_ZONE);
            ZonedDateTime reviewEnd = ZonedDateTime.of(date, LocalTime.of(21, 30), CalendarTimeUtils.SHANGHAI_ZONE);

            String coursePrefix = (topic.courseName() != null && !topic.courseName().isBlank())
                    ? "《" + topic.courseName() + "》"
                    : (topic.eventTitle() != null && !topic.eventTitle().isBlank() ? topic.eventTitle() + " - " : "");
            String summary = "[考前复习] " + coursePrefix + nullToEmpty(topic.topic());

            StringBuilder desc = new StringBuilder();
            desc.append("复习知识点：").append(nullToEmpty(topic.topic())).append("\n");
            if (topic.eventTitle() != null && !topic.eventTitle().isBlank()) {
                desc.append("关联考试/课程：").append(topic.eventTitle()).append("\n");
            }
            if (topic.examDate() != null && !topic.examDate().isBlank()) {
                desc.append("目标考试日期：").append(topic.examDate()).append("\n");
            }
            desc.append("完成状态：").append(topic.done() ? "已完成" : "待复习");

            sb.append("BEGIN:VEVENT").append(CRLF);
            sb.append("UID:oneterm-review-").append(topic.id()).append("@oneterm.local").append(CRLF);
            sb.append("DTSTAMP:").append(dtStamp).append(CRLF);
            sb.append("DTSTART;TZID=Asia/Shanghai:")
                    .append(reviewStart.format(CalendarTimeUtils.ICS_LOCAL_FORMATTER)).append(CRLF);
            sb.append("DTEND;TZID=Asia/Shanghai:")
                    .append(reviewEnd.format(CalendarTimeUtils.ICS_LOCAL_FORMATTER)).append(CRLF);
            sb.append("SUMMARY:").append(escapeIcsText(summary)).append(CRLF);
            sb.append("DESCRIPTION:").append(escapeIcsText(desc.toString())).append(CRLF);
            sb.append("CATEGORIES:考前复习").append(CRLF);
            sb.append("STATUS:").append(topic.done() ? "COMPLETED" : "CONFIRMED").append(CRLF);
            sb.append("END:VEVENT").append(CRLF);
        }

        sb.append("END:VCALENDAR").append(CRLF);
        return sb.toString();
    }

    private static String formatTypeLabel(String type) {
        if (type == null) {
            return "日程";
        }
        return switch (type.trim().toLowerCase()) {
            case "exam" -> "考试";
            case "deadline" -> "作业截止";
            case "course" -> "课程";
            case "activity" -> "活动";
            case "notice" -> "通知";
            default -> "日程";
        };
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    /**
     * 按 RFC 5545 规范转义反斜杠、分号、逗号与换行符。
     */
    public static String escapeIcsText(String raw) {
        if (raw == null || raw.isEmpty()) {
            return "";
        }
        return raw
                .replace("\\", "\\\\")
                .replace(";", "\\;")
                .replace(",", "\\,")
                .replace("\r\n", "\\n")
                .replace("\n", "\\n")
                .replace("\r", "\\n");
    }
}
