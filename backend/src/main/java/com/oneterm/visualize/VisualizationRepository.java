package com.oneterm.visualize;

import com.oneterm.common.BusinessException;
import com.oneterm.common.ErrorCode;
import com.oneterm.visualize.dto.VisualizationDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Types;
import java.util.List;
import java.util.Optional;

/**
 * 知识点可视化数据访问层。
 * 所有查询、关联校验与删除操作均强制携带 user_id 过滤，确保租户数据严格隔离。
 */
@Repository
public class VisualizationRepository {

    private static final RowMapper<VisualizationDto> ROW_MAPPER = (rs, rowNum) -> new VisualizationDto(
            rs.getLong("id"),
            rs.getLong("user_id"),
            rs.getLong("topic_id"),
            rs.getString("topic"),
            rs.getString("html"),
            rs.getString("prompt_version"),
            rs.getString("created_at")
    );

    private final JdbcTemplate jdbcTemplate;

    public VisualizationRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * 解析或自动创建关联的 review_topics 记录并返回 topicId。
     * 若传入了不属于当前用户的 topicId 或 eventId，一律抛出 404 NOT_FOUND。
     */
    public long resolveOrCreateTopicId(long userId, Long requestedTopicId, Long eventId, String topic) {
        if (requestedTopicId != null) {
            List<Long> existingIds = jdbcTemplate.query(
                    "SELECT id FROM review_topics WHERE id = ? AND user_id = ?",
                    (rs, rowNum) -> rs.getLong("id"),
                    requestedTopicId,
                    userId
            );
            if (existingIds.isEmpty()) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "关联的复习知识点不存在");
            }
            return existingIds.get(0);
        }

        if (eventId != null) {
            List<Long> eventIds = jdbcTemplate.query(
                    "SELECT id FROM events WHERE id = ? AND user_id = ?",
                    (rs, rowNum) -> rs.getLong("id"),
                    eventId,
                    userId
            );
            if (eventIds.isEmpty()) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "关联的考试或课程事件不存在");
            }

            List<Long> matchedByEventAndTopic = jdbcTemplate.query(
                    "SELECT id FROM review_topics WHERE user_id = ? AND event_id = ? AND topic = ? ORDER BY id DESC LIMIT 1",
                    (rs, rowNum) -> rs.getLong("id"),
                    userId,
                    eventId,
                    topic
            );
            if (!matchedByEventAndTopic.isEmpty()) {
                return matchedByEventAndTopic.get(0);
            }
        } else {
            List<Long> matchedByTopic = jdbcTemplate.query(
                    "SELECT id FROM review_topics WHERE user_id = ? AND topic = ? ORDER BY id DESC LIMIT 1",
                    (rs, rowNum) -> rs.getLong("id"),
                    userId,
                    topic
            );
            if (!matchedByTopic.isEmpty()) {
                return matchedByTopic.get(0);
            }
        }

        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO review_topics (user_id, event_id, topic, planned_date, done) VALUES (?, ?, ?, NULL, 0)",
                    Statement.RETURN_GENERATED_KEYS
            );
            ps.setLong(1, userId);
            if (eventId != null) {
                ps.setLong(2, eventId);
            } else {
                ps.setNull(2, Types.INTEGER);
            }
            ps.setString(3, topic);
            return ps;
        }, keyHolder);

        Number key = keyHolder.getKey();
        if (key != null) {
            return key.longValue();
        }
        Long fallbackId = jdbcTemplate.queryForObject(
                "SELECT id FROM review_topics WHERE user_id = ? AND topic = ? ORDER BY id DESC LIMIT 1",
                Long.class,
                userId,
                topic
        );
        return fallbackId != null ? fallbackId : 0L;
    }

    /**
     * 查询知识点关联的课程/考试上下文描述，用于提示词补充背景。
     */
    public String findEventContextDescription(long userId, Long eventId, long topicId) {
        Long resolvedEventId = eventId;
        if (resolvedEventId == null) {
            List<Long> eventIds = jdbcTemplate.query(
                    "SELECT event_id FROM review_topics WHERE id = ? AND user_id = ? AND event_id IS NOT NULL",
                    (rs, rowNum) -> rs.getLong("event_id"),
                    topicId,
                    userId
            );
            if (!eventIds.isEmpty()) {
                resolvedEventId = eventIds.get(0);
            }
        }
        if (resolvedEventId == null) {
            return "通用计算机科学课程与考前复习";
        }
        List<String> descriptions = jdbcTemplate.query(
                "SELECT title, course_name, type FROM events WHERE id = ? AND user_id = ?",
                (rs, rowNum) -> {
                    String courseName = rs.getString("course_name");
                    String title = rs.getString("title");
                    String type = rs.getString("type");
                    if (courseName != null && !courseName.isBlank()) {
                        return courseName + " - " + title + " (" + type + ")";
                    }
                    return title + " (" + type + ")";
                },
                resolvedEventId,
                userId
        );
        return descriptions.isEmpty() ? "通用计算机科学课程与考前复习" : descriptions.get(0);
    }

    /**
     * 保存通过安全沙箱校验的可视化记录。
     */
    public VisualizationDto insert(
            long userId,
            long topicId,
            String topic,
            String html,
            String promptVersion,
            String createdAt
    ) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO visualizations (user_id, topic_id, html, prompt_version, created_at) VALUES (?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS
            );
            ps.setLong(1, userId);
            ps.setLong(2, topicId);
            ps.setString(3, html);
            ps.setString(4, promptVersion);
            ps.setString(5, createdAt);
            return ps;
        }, keyHolder);

        long id;
        Number key = keyHolder.getKey();
        if (key != null) {
            id = key.longValue();
        } else {
            Long queriedId = jdbcTemplate.queryForObject(
                    "SELECT id FROM visualizations WHERE user_id = ? AND topic_id = ? ORDER BY id DESC LIMIT 1",
                    Long.class,
                    userId,
                    topicId
            );
            id = queriedId != null ? queriedId : 0L;
        }

        return new VisualizationDto(id, userId, topicId, topic, html, promptVersion, createdAt);
    }

    /**
     * 查询当前用户的可视化列表（支持按 topicId 过滤）。
     */
    public List<VisualizationDto> findAllByUserId(long userId, Long topicId) {
        if (topicId != null) {
            return jdbcTemplate.query(
                    """
                    SELECT v.id, v.user_id, v.topic_id, COALESCE(rt.topic, '') AS topic,
                           v.html, v.prompt_version, v.created_at
                    FROM visualizations v
                    LEFT JOIN review_topics rt ON v.topic_id = rt.id AND rt.user_id = v.user_id
                    WHERE v.user_id = ? AND v.topic_id = ?
                    ORDER BY v.id DESC
                    """,
                    ROW_MAPPER,
                    userId,
                    topicId
            );
        }
        return jdbcTemplate.query(
                """
                SELECT v.id, v.user_id, v.topic_id, COALESCE(rt.topic, '') AS topic,
                       v.html, v.prompt_version, v.created_at
                FROM visualizations v
                LEFT JOIN review_topics rt ON v.topic_id = rt.id AND rt.user_id = v.user_id
                WHERE v.user_id = ?
                ORDER BY v.id DESC
                """,
                ROW_MAPPER,
                userId
        );
    }

    /**
     * 按 ID 与当前登录用户查询单条可视化记录。
     */
    public Optional<VisualizationDto> findByIdAndUserId(long id, long userId) {
        List<VisualizationDto> list = jdbcTemplate.query(
                """
                SELECT v.id, v.user_id, v.topic_id, COALESCE(rt.topic, '') AS topic,
                       v.html, v.prompt_version, v.created_at
                FROM visualizations v
                LEFT JOIN review_topics rt ON v.topic_id = rt.id AND rt.user_id = v.user_id
                WHERE v.id = ? AND v.user_id = ?
                """,
                ROW_MAPPER,
                id,
                userId
        );
        return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
    }

    /**
     * 按 ID 与当前登录用户删除可视化记录。
     */
    public boolean deleteByIdAndUserId(long id, long userId) {
        int rows = jdbcTemplate.update(
                "DELETE FROM visualizations WHERE id = ? AND user_id = ?",
                id,
                userId
        );
        return rows > 0;
    }
}
