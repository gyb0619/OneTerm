package com.oneterm.calendar.core;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

/**
 * 日历模块纯时间解析与格式化工具（无外部框架依赖，统一使用 Asia/Shanghai 时区）。
 */
public final class CalendarTimeUtils {

    public static final ZoneId SHANGHAI_ZONE = ZoneId.of("Asia/Shanghai");

    public static final DateTimeFormatter ISO_OFFSET_FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX").withZone(SHANGHAI_ZONE);

    public static final DateTimeFormatter ICS_LOCAL_FORMATTER =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss");

    private static final DateTimeFormatter SPACE_DATETIME_SECONDS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private static final DateTimeFormatter SPACE_DATETIME_MINUTES =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private CalendarTimeUtils() {
    }

    /**
     * 解析 ISO 8601 时间字符串（带偏移量或不带偏移量）为 Asia/Shanghai 时区的 ZonedDateTime。
     */
    public static ZonedDateTime parseShanghaiDateTime(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("时间字符串不能为空");
        }
        String trimmed = raw.trim();
        try {
            return OffsetDateTime.parse(trimmed).atZoneSameInstant(SHANGHAI_ZONE);
        } catch (DateTimeParseException ignored) {
            // 继续尝试本地格式
        }
        try {
            return ZonedDateTime.parse(trimmed).withZoneSameInstant(SHANGHAI_ZONE);
        } catch (DateTimeParseException ignored) {
            // 继续尝试无偏移量的 LocalDateTime
        }
        try {
            return LocalDateTime.parse(trimmed).atZone(SHANGHAI_ZONE);
        } catch (DateTimeParseException ignored) {
            // 继续尝试空格分隔或纯日期
        }
        try {
            return LocalDateTime.parse(trimmed, SPACE_DATETIME_SECONDS).atZone(SHANGHAI_ZONE);
        } catch (DateTimeParseException ignored) {
            // 继续尝试分钟级格式
        }
        try {
            return LocalDateTime.parse(trimmed, SPACE_DATETIME_MINUTES).atZone(SHANGHAI_ZONE);
        } catch (DateTimeParseException ignored) {
            // 继续尝试纯日期 YYYY-MM-DD
        }
        try {
            return LocalDate.parse(trimmed).atStartOfDay(SHANGHAI_ZONE);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException("无法解析的时间格式: " + raw, ex);
        }
    }

    /**
     * 解析日期或时间戳字符串为 Asia/Shanghai 下的 LocalDate。
     */
    public static LocalDate parseLocalDate(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("日期字符串不能为空");
        }
        String trimmed = raw.trim();
        if (trimmed.length() == 10) {
            return LocalDate.parse(trimmed);
        }
        return parseShanghaiDateTime(trimmed).toLocalDate();
    }

    /**
     * 格式化为标准 ISO 8601 带 +08:00 偏移的字符串。
     */
    public static String formatShanghaiDateTime(ZonedDateTime zdt) {
        return zdt.withZoneSameInstant(SHANGHAI_ZONE).format(ISO_OFFSET_FORMATTER);
    }

    /**
     * 计算半开区间 [start, end) 覆盖的最后一个自然日（若 end 恰为次日 00:00:00，则归属前一日）。
     */
    public static LocalDate resolveInclusiveEndDate(ZonedDateTime start, ZonedDateTime end) {
        ZonedDateTime shanghaiStart = start.withZoneSameInstant(SHANGHAI_ZONE);
        ZonedDateTime shanghaiEnd = end.withZoneSameInstant(SHANGHAI_ZONE);
        if (shanghaiEnd.isAfter(shanghaiStart) && shanghaiEnd.toLocalTime().equals(LocalTime.MIDNIGHT)) {
            return shanghaiEnd.minusNanos(1).toLocalDate();
        }
        return shanghaiEnd.toLocalDate();
    }

    /**
     * 根据 CONVENTIONS 5.1 返回事件类型的周负载密度权重。
     * exam=5, deadline=3, course=2, activity=1, notice=1
     */
    public static int getEventTypeWeight(String type) {
        if (type == null) {
            return 1;
        }
        return switch (type.trim().toLowerCase()) {
            case "exam" -> 5;
            case "deadline" -> 3;
            case "course" -> 2;
            case "activity" -> 1;
            case "notice" -> 1;
            default -> 1;
        };
    }
}
