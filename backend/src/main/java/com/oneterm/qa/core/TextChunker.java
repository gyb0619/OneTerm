package com.oneterm.qa.core;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 教务事件原文按段切片纯函数工具（无框架依赖）。
 * 将事件结构化元信息（标题、时间、星期、地点、课程名、类型）与原文（source_text）结合，
 * 按段落与语义边界切分为高信息密度的检索片段。
 */
public final class TextChunker {

    public static final int DEFAULT_MAX_CHUNK_CHARS = 280;
    private static final Pattern PARAGRAPH_SPLIT = Pattern.compile("\\r?\\n\\s*\\r?\\n+");
    private static final Pattern SENTENCE_SPLIT = Pattern.compile("(?<=[。！？；;\\n])");

    private TextChunker() {
    }

    /**
     * 待切片的事件源数据对象（纯数据载体，不依赖持久层或 Web 框架）。
     */
    public record EventSource(
            long eventId,
            String type,
            String title,
            String startTime,
            String endTime,
            String location,
            String courseName,
            String sourceText
    ) {
    }

    /**
     * 切片结果片段。
     */
    public record TextChunk(
            long eventId,
            String eventTitle,
            int chunkIndex,
            String text
    ) {
    }

    /**
     * 对单个事件进行切片（使用默认最大片段长度）。
     */
    public static List<TextChunk> chunkEvent(EventSource event) {
        return chunkEvent(event, DEFAULT_MAX_CHUNK_CHARS);
    }

    /**
     * 对单个事件进行按段/语义边界切片。
     */
    public static List<TextChunk> chunkEvent(EventSource event, int maxChunkChars) {
        if (event == null) {
            return Collections.emptyList();
        }
        int effectiveMax = Math.max(80, maxChunkChars);
        String header = buildMetadataHeader(event);
        String rawSource = event.sourceText() == null ? "" : event.sourceText().trim();

        List<String> segments = splitParagraphs(rawSource, effectiveMax);
        if (segments.isEmpty()) {
            return List.of(new TextChunk(
                    event.eventId(),
                    safeStr(event.title()),
                    0,
                    header
            ));
        }

        List<TextChunk> result = new ArrayList<>(segments.size());
        for (int i = 0; i < segments.size(); i++) {
            String chunkText = header + "\n原文片段：" + segments.get(i);
            result.add(new TextChunk(
                    event.eventId(),
                    safeStr(event.title()),
                    i,
                    chunkText
            ));
        }
        return result;
    }

    /**
     * 批量对多个事件进行切片。
     */
    public static List<TextChunk> chunkEvents(List<EventSource> events) {
        return chunkEvents(events, DEFAULT_MAX_CHUNK_CHARS);
    }

    /**
     * 批量对多个事件进行切片（指定最大片段长度）。
     */
    public static List<TextChunk> chunkEvents(List<EventSource> events, int maxChunkChars) {
        if (events == null || events.isEmpty()) {
            return Collections.emptyList();
        }
        List<TextChunk> allChunks = new ArrayList<>();
        for (EventSource event : events) {
            allChunks.addAll(chunkEvent(event, maxChunkChars));
        }
        return allChunks;
    }

    /**
     * 纯文本按段落与句子边界切分纯函数。
     * 1. 优先按空行（段落边界 \n\n）切分；
     * 2. 若单段超过 maxChunkChars，则按句号/分号/换行等语义边界二次切分并合并为紧凑片段。
     */
    public static List<String> splitParagraphs(String rawText, int maxChunkChars) {
        if (rawText == null || rawText.isBlank()) {
            return Collections.emptyList();
        }
        int limit = Math.max(40, maxChunkChars);
        String normalized = rawText.replace("\r\n", "\n").trim();

        String[] rawParagraphs = PARAGRAPH_SPLIT.split(normalized);
        List<String> segments = new ArrayList<>();

        for (String para : rawParagraphs) {
            String trimmed = para.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            if (trimmed.length() <= limit) {
                segments.add(trimmed);
            } else {
                segments.addAll(splitLongParagraph(trimmed, limit));
            }
        }
        return segments;
    }

    private static List<String> splitLongParagraph(String paragraph, int limit) {
        String[] sentences = SENTENCE_SPLIT.split(paragraph);
        List<String> chunks = new ArrayList<>();
        StringBuilder current = new StringBuilder();

        for (String sentence : sentences) {
            String s = sentence.trim();
            if (s.isEmpty()) {
                continue;
            }
            if (current.length() > 0 && current.length() + 1 + s.length() > limit) {
                chunks.add(current.toString().trim());
                current.setLength(0);
            }
            if (s.length() > limit) {
                if (current.length() > 0) {
                    chunks.add(current.toString().trim());
                    current.setLength(0);
                }
                for (int offset = 0; offset < s.length(); offset += limit) {
                    chunks.add(s.substring(offset, Math.min(s.length(), offset + limit)));
                }
            } else {
                if (current.length() > 0) {
                    current.append(' ');
                }
                current.append(s);
            }
        }
        if (current.length() > 0) {
            chunks.add(current.toString().trim());
        }
        return chunks;
    }

    private static String buildMetadataHeader(EventSource event) {
        StringBuilder sb = new StringBuilder();
        String typeLabel = formatTypeLabel(event.type());
        sb.append("【").append(typeLabel).append("】");
        sb.append(safeStr(event.title()));

        if (event.courseName() != null && !event.courseName().isBlank()) {
            sb.append(" | 课程：").append(event.courseName().trim());
        }

        String timeDesc = formatTimeRangeWithWeekday(event.startTime(), event.endTime());
        if (!timeDesc.isEmpty()) {
            sb.append(" | 时间：").append(timeDesc);
        }

        if (event.location() != null && !event.location().isBlank()) {
            sb.append(" | 地点：").append(event.location().trim());
        }
        return sb.toString();
    }

    private static String formatTypeLabel(String type) {
        if (type == null) {
            return "日程事件";
        }
        return switch (type.trim().toLowerCase()) {
            case "course" -> "课程安排/上课";
            case "exam" -> "考试/期末/随堂测验/考核";
            case "deadline" -> "作业截止/实验报告提交/期末前任务";
            case "activity" -> "校园社团活动/讲座";
            case "notice" -> "教务通知/提醒";
            default -> "日程事件";
        };
    }

    static String formatTimeRangeWithWeekday(String startTime, String endTime) {
        String start = safeStr(startTime);
        String end = safeStr(endTime);
        if (start.isEmpty() && end.isEmpty()) {
            return "";
        }
        String weekdayTag = extractWeekdayTag(start);
        if (!weekdayTag.isEmpty()) {
            return start + "（" + weekdayTag + "）至 " + end;
        }
        return start + " 至 " + end;
    }

    static String extractWeekdayTag(String isoTime) {
        if (isoTime == null || isoTime.length() < 10) {
            return "";
        }
        try {
            LocalDate date;
            if (isoTime.contains("T")) {
                try {
                    date = OffsetDateTime.parse(isoTime, DateTimeFormatter.ISO_OFFSET_DATE_TIME).toLocalDate();
                } catch (Exception ex) {
                    date = LocalDate.parse(isoTime.substring(0, 10));
                }
            } else {
                date = LocalDate.parse(isoTime.substring(0, 10));
            }
            DayOfWeek dow = date.getDayOfWeek();
            return switch (dow) {
                case MONDAY -> "周一/星期一";
                case TUESDAY -> "周二/星期二";
                case WEDNESDAY -> "周三/星期三";
                case THURSDAY -> "周四/星期四";
                case FRIDAY -> "周五/星期五";
                case SATURDAY -> "周六/星期六";
                case SUNDAY -> "周日/星期日";
            };
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String safeStr(String s) {
        return s == null ? "" : s.trim();
    }
}
