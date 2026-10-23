package com.oneterm.calendar;

import com.oneterm.calendar.core.CalendarTimeUtils;
import com.oneterm.calendar.dto.CalendarEventDto;
import com.oneterm.calendar.dto.ReviewTopicDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Optional;

/**
 * 日历模块数据访问层。
 * 所有 SQL 查询、更新、删除均强制携带 user_id 过滤条件，保障租户级数据隔离。
 */
@Repository
public class CalendarRepository {

    private final JdbcTemplate jdbcTemplate;

    private static final RowMapper<CalendarEventDto> EVENT_ROW_MAPPER = (rs, rowNum) -> new CalendarEventDto(
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

    private static final RowMapper<ReviewTopicDto> REVIEW_TOPIC_ROW_MAPPER = (rs, rowNum) -> {
        String eventStartTime = rs.getString("event_start_time");
        String examDate = null;
        if (eventStartTime != null && !eventStartTime.isBlank()) {
            try {
                examDate = CalendarTimeUtils.parseLocalDate(eventStartTime).toString();
            } catch (IllegalArgumentException ignored) {
                examDate = eventStartTime;
            }
        }
        long visIdRaw = rs.getLong("visualization_id");
        Long visualizationId = rs.wasNull() ? null : visIdRaw;

        return new ReviewTopicDto(
                rs.getLong("id"),
                rs.getLong("user_id"),
                rs.getLong("event_id"),
                rs.getString("event_title"),
                rs.getString("course_name"),
                examDate,
                rs.getString("topic"),
                rs.getString("planned_date"),
                rs.getInt("done") != 0,
                visualizationId
        );
    };

    private static final String SELECT_REVIEW_TOPICS_BASE = """
            SELECT rt.id,
                   rt.user_id,
                   rt.event_id,
                   e.title AS event_title,
                   e.course_name AS course_name,
                   e.start_time AS event_start_time,
                   rt.topic,
                   rt.planned_date,
                   rt.done,
                   (SELECT v.id
                      FROM visualizations v
                     WHERE v.user_id = rt.user_id
                       AND v.topic_id = rt.id
                     ORDER BY v.id DESC
                     LIMIT 1) AS visualization_id
              FROM review_topics rt
              LEFT JOIN events e
                ON e.id = rt.event_id
               AND e.user_id = rt.user_id
            """;

    public CalendarRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<CalendarEventDto> findEventsByUserId(long userId) {
        return jdbcTemplate.query(
                """
                SELECT id, user_id, type, title, start_time, end_time, location, course_name, source_text
                  FROM events
                 WHERE user_id = ?
                 ORDER BY start_time ASC, id ASC
                """,
                EVENT_ROW_MAPPER,
                userId
        );
    }

    public Optional<CalendarEventDto> findEventByIdAndUserId(long eventId, long userId) {
        List<CalendarEventDto> list = jdbcTemplate.query(
                """
                SELECT id, user_id, type, title, start_time, end_time, location, course_name, source_text
                  FROM events
                 WHERE id = ? AND user_id = ?
                """,
                EVENT_ROW_MAPPER,
                eventId,
                userId
        );
        return list.stream().findFirst();
    }

    public List<ReviewTopicDto> findReviewTopicsByUserId(long userId, Long eventId) {
        if (eventId != null) {
            return jdbcTemplate.query(
                    SELECT_REVIEW_TOPICS_BASE + " WHERE rt.user_id = ? AND rt.event_id = ? ORDER BY rt.planned_date ASC, rt.id ASC",
                    REVIEW_TOPIC_ROW_MAPPER,
                    userId,
                    eventId
            );
        }
        return jdbcTemplate.query(
                SELECT_REVIEW_TOPICS_BASE + " WHERE rt.user_id = ? ORDER BY rt.planned_date ASC, rt.id ASC",
                REVIEW_TOPIC_ROW_MAPPER,
                userId
        );
    }

    public Optional<ReviewTopicDto> findReviewTopicByIdAndUserId(long topicId, long userId) {
        List<ReviewTopicDto> list = jdbcTemplate.query(
                SELECT_REVIEW_TOPICS_BASE + " WHERE rt.id = ? AND rt.user_id = ?",
                REVIEW_TOPIC_ROW_MAPPER,
                topicId,
                userId
        );
        return list.stream().findFirst();
    }

    public long insertReviewTopic(long userId, long eventId, String topic, String plannedDate) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO review_topics (user_id, event_id, topic, planned_date, done) VALUES (?, ?, ?, ?, 0)",
                    Statement.RETURN_GENERATED_KEYS
            );
            ps.setLong(1, userId);
            ps.setLong(2, eventId);
            ps.setString(3, topic);
            ps.setString(4, plannedDate);
            return ps;
        }, keyHolder);
        Number key = keyHolder.getKey();
        if (key != null) {
            return key.longValue();
        }
        Long fallbackId = jdbcTemplate.queryForObject("SELECT last_insert_rowid()", Long.class);
        return fallbackId != null ? fallbackId : 0L;
    }

    public int updateReviewTopic(long topicId, long userId, String topic, String plannedDate, boolean done) {
        return jdbcTemplate.update(
                """
                UPDATE review_topics
                   SET topic = ?,
                       planned_date = ?,
                       done = ?
                 WHERE id = ? AND user_id = ?
                """,
                topic,
                plannedDate,
                done ? 1 : 0,
                topicId,
                userId
        );
    }

    public void updatePlannedDate(long topicId, long userId, String plannedDate) {
        jdbcTemplate.update(
                "UPDATE review_topics SET planned_date = ? WHERE id = ? AND user_id = ?",
                plannedDate,
                topicId,
                userId
        );
    }

    public int deleteReviewTopicByIdAndUserId(long topicId, long userId) {
        return jdbcTemplate.update(
                "DELETE FROM review_topics WHERE id = ? AND user_id = ?",
                topicId,
                userId
        );
    }
}
