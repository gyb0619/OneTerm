package com.oneterm.calendar;

import com.oneterm.calendar.core.CalendarTimeUtils;
import com.oneterm.calendar.core.ConflictDetector;
import com.oneterm.calendar.core.IcsExporter;
import com.oneterm.calendar.core.ReviewPathScheduler;
import com.oneterm.calendar.core.WorkloadCalculator;
import com.oneterm.calendar.dto.CalendarEventDto;
import com.oneterm.calendar.dto.CalendarOverviewResponse;
import com.oneterm.calendar.dto.ConflictPairDto;
import com.oneterm.calendar.dto.CreateReviewTopicRequest;
import com.oneterm.calendar.dto.ReviewTopicDto;
import com.oneterm.calendar.dto.ScheduleReviewTopicsRequest;
import com.oneterm.calendar.dto.UpdateReviewTopicRequest;
import com.oneterm.common.BusinessException;
import com.oneterm.common.CurrentUserProvider;
import com.oneterm.common.ErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

/**
 * 日历、冲突检测、任务密度热力图、考前复习排期与 ICS 导出业务服务。
 */
@Service
public class CalendarService {

    private final CalendarRepository calendarRepository;
    private final CurrentUserProvider currentUserProvider;

    public CalendarService(CalendarRepository calendarRepository, CurrentUserProvider currentUserProvider) {
        this.calendarRepository = calendarRepository;
        this.currentUserProvider = currentUserProvider;
    }

    public CalendarOverviewResponse getOverview(String semesterStartRaw, String semesterEndRaw) {
        long userId = currentUserProvider.requireCurrentUserId();
        LocalDate semesterStart = parseOptionalDate(semesterStartRaw, "semesterStart");
        LocalDate semesterEnd = parseOptionalDate(semesterEndRaw, "semesterEnd");

        List<CalendarEventDto> events = calendarRepository.findEventsByUserId(userId);
        List<ReviewTopicDto> reviewTopics = calendarRepository.findReviewTopicsByUserId(userId, null);
        List<ConflictPairDto> conflicts = ConflictDetector.detectConflicts(events);

        WorkloadCalculator.WorkloadSummary summary = WorkloadCalculator.calculate(
                events,
                reviewTopics,
                semesterStart,
                semesterEnd
        );

        return new CalendarOverviewResponse(
                events,
                reviewTopics,
                conflicts,
                summary.dailyHeatmap(),
                summary.weeklyDensity(),
                summary.freestDay(),
                summary.busiestDay(),
                summary.busiestWeek()
        );
    }

    public List<ConflictPairDto> getConflicts() {
        long userId = currentUserProvider.requireCurrentUserId();
        List<CalendarEventDto> events = calendarRepository.findEventsByUserId(userId);
        return ConflictDetector.detectConflicts(events);
    }

    public List<ReviewTopicDto> getReviewTopics(Long eventId) {
        long userId = currentUserProvider.requireCurrentUserId();
        return calendarRepository.findReviewTopicsByUserId(userId, eventId);
    }

    @Transactional
    public ReviewTopicDto createReviewTopic(CreateReviewTopicRequest request) {
        long userId = currentUserProvider.requireCurrentUserId();
        if (request == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "请求体不能为空");
        }
        if (request.eventId() == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "关联事件 ID (eventId) 不能为空");
        }
        if (request.topic() == null || request.topic().isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "复习知识点名称 (topic) 不能为空");
        }

        // 校验关联事件存在且归属当前用户（跨用户访问返回 404）
        calendarRepository.findEventByIdAndUserId(request.eventId(), userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "关联的考试或课程事件不存在"));

        String normalizedPlannedDate = null;
        if (request.plannedDate() != null && !request.plannedDate().isBlank()) {
            normalizedPlannedDate = parseOptionalDate(request.plannedDate(), "plannedDate").toString();
        }

        long topicId = calendarRepository.insertReviewTopic(
                userId,
                request.eventId(),
                request.topic().trim(),
                normalizedPlannedDate
        );

        return calendarRepository.findReviewTopicByIdAndUserId(topicId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INTERNAL_ERROR, "创建复习知识点失败"));
    }

    @Transactional
    public List<ReviewTopicDto> scheduleReviewTopics(ScheduleReviewTopicsRequest request) {
        long userId = currentUserProvider.requireCurrentUserId();
        LocalDate startDate = null;
        if (request != null && request.startDate() != null && !request.startDate().isBlank()) {
            startDate = parseOptionalDate(request.startDate(), "startDate");
        }

        List<CalendarEventDto> events = calendarRepository.findEventsByUserId(userId);
        List<ReviewTopicDto> existingTopics = calendarRepository.findReviewTopicsByUserId(userId, null);
        if (existingTopics.isEmpty()) {
            return List.of();
        }

        List<ReviewTopicDto> scheduledTopics = ReviewPathScheduler.schedule(existingTopics, events, startDate);
        for (ReviewTopicDto item : scheduledTopics) {
            calendarRepository.updatePlannedDate(item.id(), userId, item.plannedDate());
        }

        return calendarRepository.findReviewTopicsByUserId(userId, null);
    }

    @Transactional
    public ReviewTopicDto updateReviewTopic(long id, UpdateReviewTopicRequest request) {
        long userId = currentUserProvider.requireCurrentUserId();
        if (request == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "请求体不能为空");
        }

        ReviewTopicDto existing = calendarRepository.findReviewTopicByIdAndUserId(id, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "复习知识点不存在"));

        String newTopic = existing.topic();
        if (request.topic() != null) {
            if (request.topic().isBlank()) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "复习知识点名称不能为空");
            }
            newTopic = request.topic().trim();
        }

        String newPlannedDate = existing.plannedDate();
        if (request.plannedDate() != null) {
            if (request.plannedDate().isBlank()) {
                newPlannedDate = null;
            } else {
                newPlannedDate = parseOptionalDate(request.plannedDate(), "plannedDate").toString();
            }
        }

        boolean newDone = request.done() != null ? request.done() : existing.done();

        int updated = calendarRepository.updateReviewTopic(id, userId, newTopic, newPlannedDate, newDone);
        if (updated == 0) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "复习知识点不存在");
        }

        return calendarRepository.findReviewTopicByIdAndUserId(id, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "复习知识点不存在"));
    }

    @Transactional
    public void deleteReviewTopic(long id) {
        long userId = currentUserProvider.requireCurrentUserId();
        int deleted = calendarRepository.deleteReviewTopicByIdAndUserId(id, userId);
        if (deleted == 0) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "复习知识点不存在");
        }
    }

    public String exportUserCalendarIcs() {
        long userId = currentUserProvider.requireCurrentUserId();
        List<CalendarEventDto> events = calendarRepository.findEventsByUserId(userId);
        List<ReviewTopicDto> reviewTopics = calendarRepository.findReviewTopicsByUserId(userId, null);
        return IcsExporter.exportIcs(events, reviewTopics);
    }

    private static LocalDate parseOptionalDate(String raw, String fieldName) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return CalendarTimeUtils.parseLocalDate(raw);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, fieldName + " 日期格式不合法，应为 YYYY-MM-DD");
        }
    }
}
