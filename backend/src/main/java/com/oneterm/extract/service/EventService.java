package com.oneterm.extract.service;

import com.oneterm.common.BusinessException;
import com.oneterm.common.ErrorCode;
import com.oneterm.common.EventType;
import com.oneterm.common.VectorUtils;
import com.oneterm.extract.core.EventJsonParser;
import com.oneterm.extract.dto.EventDto;
import com.oneterm.extract.dto.EventInputDto;
import com.oneterm.llm.LlmGateway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * 事件持久化管理与 RAG 原文切片（chunks 表）同步服务。
 * 所有查询、修改、删除操作均强制携带 user_id 过滤，跨用户越权访问一律抛出 404 NOT_FOUND。
 */
@Service
public class EventService {

    private static final DateTimeFormatter ISO_OFFSET_FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX");

    private static final RowMapper<EventDto> EVENT_ROW_MAPPER = (rs, rowNum) -> new EventDto(
            rs.getLong("id"),
            rs.getLong("user_id"),
            rs.getString("type"),
            rs.getString("title"),
            rs.getString("start_time"),
            rs.getString("end_time"),
            rs.getString("location"),
            rs.getString("course_name"),
            rs.getString("source_text")
    );

    private final JdbcTemplate jdbcTemplate;
    private final LlmGateway llmGateway;

    public EventService(JdbcTemplate jdbcTemplate, LlmGateway llmGateway) {
        this.jdbcTemplate = jdbcTemplate;
        this.llmGateway = llmGateway;
    }

    /**
     * 批量确认入库事件列表，并同步写入 chunks 表（含向量化 embedding）。
     */
    @Transactional
    public List<EventDto> batchCreateEvents(long userId, List<EventInputDto> inputs) {
        if (inputs == null || inputs.isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "批量入库事件列表不能为空");
        }
        List<EventDto> saved = new ArrayList<>(inputs.size());
        for (int i = 0; i < inputs.size(); i++) {
            EventInputDto normalized = validateInput(inputs.get(i), i + 1);
            EventDto dto = insertSingleEvent(userId, normalized);
            syncChunkForEvent(userId, dto);
            saved.add(dto);
        }
        return saved;
    }

    /**
     * 查询当前登录用户的事件列表（支持按 type、start、end 过滤）。
     */
    public List<EventDto> listEvents(long userId, String type, String start, String end) {
        StringBuilder sql = new StringBuilder(
                "SELECT id, user_id, type, title, start_time, end_time, location, course_name, source_text " +
                "FROM events WHERE user_id = ?"
        );
        List<Object> params = new ArrayList<>();
        params.add(userId);

        if (type != null && !type.isBlank()) {
            EventType eventType = EventType.fromValue(type);
            sql.append(" AND type = ?");
            params.add(eventType.name());
        }
        if (start != null && !start.isBlank()) {
            String normalizedStart = normalizeQueryTimeBound(start.trim(), false);
            sql.append(" AND end_time >= ?");
            params.add(normalizedStart);
        }
        if (end != null && !end.isBlank()) {
            String normalizedEnd = normalizeQueryTimeBound(end.trim(), true);
            sql.append(" AND start_time <= ?");
            params.add(normalizedEnd);
        }

        sql.append(" ORDER BY start_time ASC, id ASC");
        return jdbcTemplate.query(sql.toString(), EVENT_ROW_MAPPER, params.toArray());
    }

    /**
     * 手动新增单条事件，并同步写入 chunks 表。
     */
    @Transactional
    public EventDto createEvent(long userId, EventInputDto input) {
        EventInputDto normalized = validateInput(input, 1);
        EventDto created = insertSingleEvent(userId, normalized);
        syncChunkForEvent(userId, created);
        return created;
    }

    /**
     * 编辑指定事件（强制校验 user_id，不存在或越权返回 404），并同步更新 chunks 表关联记录。
     */
    @Transactional
    public EventDto updateEvent(long userId, long eventId, EventInputDto input) {
        EventInputDto normalized = validateInput(input, 1);
        int affected = jdbcTemplate.update(
                "UPDATE events SET type = ?, title = ?, start_time = ?, end_time = ?, " +
                "location = ?, course_name = ?, source_text = ? WHERE id = ? AND user_id = ?",
                normalized.type(),
                normalized.title(),
                normalized.startTime(),
                normalized.endTime(),
                normalized.location(),
                normalized.courseName(),
                normalized.sourceText(),
                eventId,
                userId
        );
        if (affected == 0) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "事件不存在或无权访问");
        }
        EventDto updated = new EventDto(
                eventId,
                userId,
                normalized.type(),
                normalized.title(),
                normalized.startTime(),
                normalized.endTime(),
                normalized.location(),
                normalized.courseName(),
                normalized.sourceText()
        );
        syncChunkForEvent(userId, updated);
        return updated;
    }

    /**
     * 删除指定事件（强制校验 user_id，不存在或越权返回 404），并同步删除 chunks 表关联记录。
     */
    @Transactional
    public void deleteEvent(long userId, long eventId) {
        int affected = jdbcTemplate.update(
                "DELETE FROM events WHERE id = ? AND user_id = ?",
                eventId,
                userId
        );
        if (affected == 0) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "事件不存在或无权访问");
        }
        jdbcTemplate.update(
                "DELETE FROM chunks WHERE event_id = ? AND user_id = ?",
                eventId,
                userId
        );
    }

    private EventDto insertSingleEvent(long userId, EventInputDto normalized) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO events (user_id, type, title, start_time, end_time, location, course_name, source_text) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS
            );
            ps.setLong(1, userId);
            ps.setString(2, normalized.type());
            ps.setString(3, normalized.title());
            ps.setString(4, normalized.startTime());
            ps.setString(5, normalized.endTime());
            ps.setString(6, normalized.location());
            ps.setString(7, normalized.courseName());
            ps.setString(8, normalized.sourceText());
            return ps;
        }, keyHolder);

        Number key = keyHolder.getKey();
        long eventId = key != null ? key.longValue() : 0L;
        return new EventDto(
                eventId,
                userId,
                normalized.type(),
                normalized.title(),
                normalized.startTime(),
                normalized.endTime(),
                normalized.location(),
                normalized.courseName(),
                normalized.sourceText()
        );
    }

    /**
     * 同步维护单条事件在 chunks 表中的原文切片与 float32 BLOB 向量。
     */
    private void syncChunkForEvent(long userId, EventDto event) {
        jdbcTemplate.update(
                "DELETE FROM chunks WHERE user_id = ? AND event_id = ?",
                userId,
                event.id()
        );
        String chunkText = buildChunkText(event);
        byte[] embeddingBlob = null;
        try {
            float[] vector = llmGateway.embed(userId, chunkText);
            if (vector != null && vector.length > 0) {
                embeddingBlob = VectorUtils.toFloat32Blob(vector);
            }
        } catch (Exception ignored) {
            // 若未配置向量模型或向量生成失败，保留 embedding 为 null 以支持降级检索
        }
        jdbcTemplate.update(
                "INSERT INTO chunks (user_id, text, embedding, event_id) VALUES (?, ?, ?, ?)",
                userId,
                chunkText,
                embeddingBlob,
                event.id()
        );
    }

    /**
     * 拼接事件结构化摘要与原文片段 sourceText，供 RAG 检索问答使用。
     */
    public static String buildChunkText(EventDto event) {
        EventType eventType = EventType.fromValue(event.type());
        StringBuilder sb = new StringBuilder();
        sb.append("【").append(eventType.getLabel()).append("】").append(event.title());
        if (event.courseName() != null && !event.courseName().isBlank()) {
            sb.append("（课程：").append(event.courseName()).append("）");
        }
        sb.append("\n时间：").append(event.startTime()).append(" 至 ").append(event.endTime());
        if (event.location() != null && !event.location().isBlank()) {
            sb.append("\n地点：").append(event.location());
        }
        sb.append("\n原文：").append(event.sourceText());
        return sb.toString();
    }

    private static EventInputDto validateInput(EventInputDto input, int index) {
        try {
            return EventJsonParser.validateAndNormalizeItem(input, index);
        } catch (EventJsonParser.EventParseException e) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, e.getMessage());
        }
    }

    private static String normalizeQueryTimeBound(String bound, boolean isEndOfRange) {
        if (bound.length() == 10 && isEndOfRange) {
            bound = bound + "T23:59:59+08:00";
        }
        try {
            OffsetDateTime odt = EventJsonParser.parseShanghaiDateTime(bound, "查询时间参数");
            return odt.format(ISO_OFFSET_FORMATTER);
        } catch (EventJsonParser.EventParseException e) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, e.getMessage());
        }
    }
}
