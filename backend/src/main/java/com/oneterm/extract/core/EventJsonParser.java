package com.oneterm.extract.core;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.oneterm.common.EventType;
import com.oneterm.extract.dto.EventInputDto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 大模型抽取结果 JSON 纯函数解析与字段校验器（无任何 Spring 依赖）。
 * 支持剥离 Markdown 代码块包裹、校验必填字段、EventType 枚举与 ISO 8601 时间格式。
 */
public final class EventJsonParser {

    private static final ObjectMapper MAPPER = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private static final ZoneOffset SHANGHAI_OFFSET = ZoneOffset.of("+08:00");
    private static final DateTimeFormatter ISO_OFFSET_FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX");

    private static final Pattern CODE_FENCE_PATTERN = Pattern.compile(
            "```(?:json|JSON)?\\s*([\\s\\S]*?)```"
    );

    private EventJsonParser() {
    }

    /**
     * 解析并校验大模型返回的 JSON 文本为结构化事件列表。
     *
     * @param rawContent 大模型原始输出文本（可能包含 ```json 代码块包裹）
     * @return 校验通过且标准化后的 EventInputDto 列表
     * @throws EventParseException 当 JSON 非法、结果为空、必填字段缺失或枚举不合法时抛出
     */
    public static List<EventInputDto> parse(String rawContent) {
        if (rawContent == null || rawContent.isBlank()) {
            throw new EventParseException("大模型返回内容为空");
        }

        String cleaned = stripMarkdownCodeFence(rawContent);
        if (cleaned.isEmpty()) {
            throw new EventParseException("剥离代码块后 JSON 内容为空");
        }

        JsonNode rootNode;
        try {
            rootNode = MAPPER.readTree(cleaned);
        } catch (Exception e) {
            throw new EventParseException("JSON 语法解析失败: " + e.getMessage(), e);
        }

        if (rootNode == null || !rootNode.isArray()) {
            throw new EventParseException("抽取结果必须是 JSON 数组格式");
        }

        List<EventInputDto> rawList;
        try {
            rawList = MAPPER.convertValue(rootNode, new TypeReference<List<EventInputDto>>() {
            });
        } catch (Exception e) {
            throw new EventParseException("JSON 数组转换为事件结构失败: " + e.getMessage(), e);
        }

        if (rawList == null || rawList.isEmpty()) {
            throw new EventParseException("未识别到任何有效事件");
        }

        List<EventInputDto> validated = new ArrayList<>(rawList.size());
        for (int i = 0; i < rawList.size(); i++) {
            EventInputDto item = rawList.get(i);
            validated.add(validateAndNormalizeItem(item, i + 1));
        }
        return List.copyOf(validated);
    }

    /**
     * 剥离 Markdown 代码块（```json ... ``` 或 ``` ... ```）及前后多余空白。
     */
    public static String stripMarkdownCodeFence(String rawContent) {
        if (rawContent == null) {
            return "";
        }
        String trimmed = rawContent.trim();
        Matcher matcher = CODE_FENCE_PATTERN.matcher(trimmed);
        if (matcher.find()) {
            return matcher.group(1).trim();
        }
        // 若存在首尾 [ ... ] 包裹且前后带有说明文字，则提取最外层 JSON 数组
        int firstBracket = trimmed.indexOf('[');
        int lastBracket = trimmed.lastIndexOf(']');
        if (firstBracket >= 0 && lastBracket > firstBracket) {
            return trimmed.substring(firstBracket, lastBracket + 1).trim();
        }
        return trimmed;
    }

    /**
     * 校验单条事件并标准化字段格式。
     */
    public static EventInputDto validateAndNormalizeItem(EventInputDto item, int index) {
        String prefix = "第 " + index + " 条事件";
        if (item == null) {
            throw new EventParseException(prefix + "为空对象");
        }
        if (item.type() == null || item.type().isBlank()) {
            throw new EventParseException(prefix + "缺少必填字段 type");
        }
        String normalizedType = item.type().trim().toLowerCase(Locale.ROOT);
        try {
            EventType.valueOf(normalizedType);
        } catch (IllegalArgumentException e) {
            throw new EventParseException(prefix + "包含不支持的事件类型: " + item.type());
        }

        if (item.title() == null || item.title().isBlank()) {
            throw new EventParseException(prefix + "缺少必填字段 title");
        }
        if (item.startTime() == null || item.startTime().isBlank()) {
            throw new EventParseException(prefix + "缺少必填字段 startTime");
        }
        if (item.endTime() == null || item.endTime().isBlank()) {
            throw new EventParseException(prefix + "缺少必填字段 endTime");
        }
        if (item.sourceText() == null || item.sourceText().isBlank()) {
            throw new EventParseException(prefix + "缺少必填字段 sourceText（必须保留原文片段）");
        }

        OffsetDateTime startOdt = parseShanghaiDateTime(item.startTime(), prefix + " startTime");
        OffsetDateTime endOdt = parseShanghaiDateTime(item.endTime(), prefix + " endTime");
        if (endOdt.isBefore(startOdt)) {
            throw new EventParseException(prefix + "结束时间 endTime 不能早于开始时间 startTime");
        }

        String formattedStart = startOdt.format(ISO_OFFSET_FORMATTER);
        String formattedEnd = endOdt.format(ISO_OFFSET_FORMATTER);

        return new EventInputDto(
                normalizedType,
                item.title().trim(),
                formattedStart,
                formattedEnd,
                item.location() == null ? "" : item.location().trim(),
                item.courseName() == null ? "" : item.courseName().trim(),
                item.sourceText().trim()
        );
    }

    /**
     * 解析并转换为 Asia/Shanghai (+08:00) 的 OffsetDateTime。
     */
    public static OffsetDateTime parseShanghaiDateTime(String raw, String fieldLabel) {
        if (raw == null || raw.isBlank()) {
            throw new EventParseException(fieldLabel + " 不能为空");
        }
        String s = raw.trim();
        try {
            return OffsetDateTime.parse(s).withOffsetSameInstant(SHANGHAI_OFFSET);
        } catch (DateTimeParseException ignored) {
        }

        String normalizedLocal = s.replace(' ', 'T');
        if (normalizedLocal.length() == 16) {
            normalizedLocal = normalizedLocal + ":00";
        }
        try {
            LocalDateTime ldt = LocalDateTime.parse(normalizedLocal);
            return ldt.atOffset(SHANGHAI_OFFSET);
        } catch (DateTimeParseException ignored) {
        }

        try {
            LocalDate ld = LocalDate.parse(s);
            return ld.atStartOfDay().atOffset(SHANGHAI_OFFSET);
        } catch (DateTimeParseException e) {
            throw new EventParseException(fieldLabel + " 时间格式不合法: " + raw, e);
        }
    }

    /**
     * 统计流式输出过程中已识别的事件条目数（用于真实流式增量进度推算）。
     */
    public static int countRecognizedEventsInPartialStream(String partialText) {
        if (partialText == null || partialText.isEmpty()) {
            return 0;
        }
        int count = 0;
        int idx = 0;
        String needle = "\"sourceText\"";
        while ((idx = partialText.indexOf(needle, idx)) != -1) {
            count++;
            idx += needle.length();
        }
        return count;
    }

    public static class EventParseException extends IllegalArgumentException {
        public EventParseException(String message) {
            super(message);
        }

        public EventParseException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
