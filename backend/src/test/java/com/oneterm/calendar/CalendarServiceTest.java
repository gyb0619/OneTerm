package com.oneterm.calendar;

import com.oneterm.calendar.dto.CalendarOverviewResponse;
import com.oneterm.calendar.dto.CreateReviewTopicRequest;
import com.oneterm.calendar.dto.ReviewTopicDto;
import com.oneterm.calendar.dto.ScheduleReviewTopicsRequest;
import com.oneterm.calendar.dto.UpdateReviewTopicRequest;
import com.oneterm.common.BusinessException;
import com.oneterm.common.CurrentUser;
import com.oneterm.common.CurrentUserProvider;
import com.oneterm.common.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CalendarServiceTest {

    private JdbcTemplate jdbcTemplate;
    private final AtomicLong activeUserId = new AtomicLong(1L);
    private CalendarController calendarController;

    @BeforeEach
    void setUp() throws Exception {
        Path dbFile = Path.of("target/test-calendar.db");
        if (dbFile.getParent() != null) {
            Files.createDirectories(dbFile.getParent());
        }
        DriverManagerDataSource dataSource = new DriverManagerDataSource("jdbc:sqlite:" + dbFile.toAbsolutePath());
        dataSource.setDriverClassName("org.sqlite.JDBC");
        jdbcTemplate = new JdbcTemplate(dataSource);

        String schemaSql = Files.readString(resolveMigrationPath());
        for (String statement : schemaSql.split(";")) {
            String trimmed = statement.trim();
            if (!trimmed.isEmpty()) {
                jdbcTemplate.execute(trimmed);
            }
        }

        jdbcTemplate.update("DELETE FROM visualizations");
        jdbcTemplate.update("DELETE FROM review_topics");
        jdbcTemplate.update("DELETE FROM events");

        CurrentUserProvider userProvider = () -> new CurrentUser(
                activeUserId.get(),
                "user-" + activeUserId.get(),
                "USER",
                100000
        );
        CalendarRepository repository = new CalendarRepository(jdbcTemplate);
        CalendarService service = new CalendarService(repository, userProvider);
        calendarController = new CalendarController(service);
    }

    @Test
    @DisplayName("日历全景、考前复习知识点增删改查、自动排期写回与 .ics 导出完整链路")
    void shouldManageReviewTopicsScheduleAndExportIcs() {
        activeUserId.set(101L);

        // 插入用户 101 的两场事件（11-04 存在冲突，11-10 为期末考试）
        jdbcTemplate.update(
                """
                INSERT INTO events (id, user_id, type, title, start_time, end_time, location, course_name, source_text)
                VALUES (1, 101, 'course', '计算机网络实验', '2026-11-04T14:00:00+08:00', '2026-11-04T16:00:00+08:00', 'B205', '计算机网络', '实验'),
                       (2, 101, 'exam', '算法随堂测验', '2026-11-04T15:00:00+08:00', '2026-11-04T17:00:00+08:00', 'C101', '算法设计与分析', '测验'),
                       (3, 101, 'exam', '计算机网络期末考试', '2026-11-08T09:00:00+08:00', '2026-11-08T11:00:00+08:00', 'A105', '计算机网络', '期末')
                """
        );

        // 1. 新增两个考前复习知识点
        ReviewTopicDto created1 = calendarController.createReviewTopic(
                new CreateReviewTopicRequest(3L, "TCP 三次握手", null)
        ).getBody();
        ReviewTopicDto created2 = calendarController.createReviewTopic(
                new CreateReviewTopicRequest(3L, "滑动窗口流量控制", null)
        ).getBody();

        assertNotNull(created1);
        assertNotNull(created2);
        assertEquals("计算机网络期末考试", created1.eventTitle());
        assertEquals("2026-11-08", created1.examDate());

        // 2. 自动生成考前复习路径并写回数据库
        List<ReviewTopicDto> scheduled = calendarController.scheduleReviewTopics(
                new ScheduleReviewTopicsRequest("2026-11-04")
        ).getBody();
        assertNotNull(scheduled);
        assertEquals(2, scheduled.size());
        // 11-04 是冲突日，考前窗口 [11-04, 11-07] 中自动避开 11-04，分配在 11-06 与 11-07
        assertEquals("2026-11-06", scheduled.get(0).plannedDate());
        assertEquals("2026-11-07", scheduled.get(1).plannedDate());

        // 3. 调整日期并标记完成
        ReviewTopicDto updated = calendarController.updateReviewTopic(
                created1.id(),
                new UpdateReviewTopicRequest("TCP 三次握手与四次挥手", "2026-11-05", true)
        ).getBody();
        assertNotNull(updated);
        assertEquals("TCP 三次握手与四次挥手", updated.topic());
        assertEquals("2026-11-05", updated.plannedDate());
        assertTrue(updated.done());

        // 4. 获取日历全景（含冲突与已排期复习任务热力图加分）
        CalendarOverviewResponse overview = calendarController.getOverview("2026-11-02", "2026-11-08").getBody();
        assertNotNull(overview);
        assertEquals(3, overview.events().size());
        assertEquals(2, overview.reviewTopics().size());
        assertEquals(1, overview.conflicts().size());
        assertNotNull(overview.freestDay());
        assertNotNull(overview.busiestDay());
        assertNotNull(overview.busiestWeek());

        // 5. 导出标准 .ics 文件
        ResponseEntity<String> icsResp = calendarController.exportIcs();
        String ics = icsResp.getBody();
        assertNotNull(ics);
        assertTrue(ics.contains("BEGIN:VCALENDAR"));
        assertTrue(ics.contains("X-WR-TIMEZONE:Asia/Shanghai"));
        assertTrue(ics.contains("SUMMARY:[考试] 计算机网络期末考试"));
        assertTrue(ics.contains("SUMMARY:[考前复习] 《计算机网络》TCP 三次握手与四次挥手"));
        assertTrue(ics.contains("END:VCALENDAR"));

        // 6. 删除复习知识点
        calendarController.deleteReviewTopic(created2.id());
        List<ReviewTopicDto> remaining = calendarController.getReviewTopics(null).getBody();
        assertNotNull(remaining);
        assertEquals(1, remaining.size());
    }

    @Test
    @DisplayName("租户隔离：用户 B 越权读取、修改或删除用户 A 的复习知识点一律返回 404 NOT_FOUND")
    void shouldEnforceStrictUserIdTenantIsolation() {
        activeUserId.set(1L);
        jdbcTemplate.update(
                """
                INSERT INTO events (id, user_id, type, title, start_time, end_time, location, course_name, source_text)
                VALUES (10, 1, 'exam', '用户A的算法考试', '2026-11-10T09:00:00+08:00', '2026-11-10T11:00:00+08:00', 'A101', '算法', '原文')
                """
        );
        ReviewTopicDto userATopic = calendarController.createReviewTopic(
                new CreateReviewTopicRequest(10L, "冒泡排序", "2026-11-09")
        ).getBody();
        assertNotNull(userATopic);

        // 切换为登录用户 2
        activeUserId.set(2L);

        // 用户 2 查询只能看到空列表
        List<ReviewTopicDto> userBTopics = calendarController.getReviewTopics(null).getBody();
        assertNotNull(userBTopics);
        assertTrue(userBTopics.isEmpty());

        // 用户 2 尝试在用户 1 的事件下创建知识点 -> 404 NOT_FOUND
        BusinessException createEx = assertThrows(BusinessException.class, () ->
                calendarController.createReviewTopic(new CreateReviewTopicRequest(10L, "越权知识点", null))
        );
        assertEquals(ErrorCode.NOT_FOUND, createEx.getErrorCode());

        // 用户 2 尝试修改用户 1 的复习知识点 -> 404 NOT_FOUND
        BusinessException updateEx = assertThrows(BusinessException.class, () ->
                calendarController.updateReviewTopic(userATopic.id(), new UpdateReviewTopicRequest("篡改", "2026-11-08", true))
        );
        assertEquals(ErrorCode.NOT_FOUND, updateEx.getErrorCode());

        // 用户 2 尝试删除用户 1 的复习知识点 -> 404 NOT_FOUND
        BusinessException deleteEx = assertThrows(BusinessException.class, () ->
                calendarController.deleteReviewTopic(userATopic.id())
        );
        assertEquals(ErrorCode.NOT_FOUND, deleteEx.getErrorCode());

        // 切回用户 1，确认数据完好无损
        activeUserId.set(1L);
        List<ReviewTopicDto> checkUserA = calendarController.getReviewTopics(null).getBody();
        assertNotNull(checkUserA);
        assertFalse(checkUserA.isEmpty());
        assertEquals("冒泡排序", checkUserA.get(0).topic());
    }

    private static Path resolveMigrationPath() {
        Path direct = Path.of("backend/src/main/resources/db/migration/V1__init.sql");
        if (Files.exists(direct)) {
            return direct;
        }
        return Path.of("src/main/resources/db/migration/V1__init.sql");
    }
}
