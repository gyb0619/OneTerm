package com.oneterm.calendar;

import com.oneterm.calendar.dto.BatchCreateReviewTopicsRequest;
import com.oneterm.calendar.dto.CalendarOverviewResponse;
import com.oneterm.calendar.dto.ConflictPairDto;
import com.oneterm.calendar.dto.CreateReviewTopicRequest;
import com.oneterm.calendar.dto.ReviewTopicDto;
import com.oneterm.calendar.dto.ScheduleReviewTopicsRequest;
import com.oneterm.calendar.dto.SuggestCourseTopicsRequest;
import com.oneterm.calendar.dto.SuggestCourseTopicsResponse;
import com.oneterm.calendar.dto.UpdateReviewTopicRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * 日历、冲突检测、学期负载热力图、考前复习路径与 ICS 导出控制器。
 * 严格遵循 docs/api/openapi.yaml 中 calendar 标签下的接口契约。
 */
@RestController
@RequestMapping("/api/calendar")
public class CalendarController {

    private static final MediaType TEXT_CALENDAR_UTF8 =
            new MediaType("text", "calendar", StandardCharsets.UTF_8);

    private final CalendarService calendarService;

    public CalendarController(CalendarService calendarService) {
        this.calendarService = calendarService;
    }

    @GetMapping("/overview")
    public ResponseEntity<CalendarOverviewResponse> getOverview(
            @RequestParam(name = "semesterStart", required = false) String semesterStart,
            @RequestParam(name = "semesterEnd", required = false) String semesterEnd
    ) {
        return ResponseEntity.ok(calendarService.getOverview(semesterStart, semesterEnd));
    }

    @GetMapping("/conflicts")
    public ResponseEntity<List<ConflictPairDto>> getConflicts() {
        return ResponseEntity.ok(calendarService.getConflicts());
    }

    @GetMapping("/review-topics")
    public ResponseEntity<List<ReviewTopicDto>> getReviewTopics(
            @RequestParam(name = "eventId", required = false) Long eventId
    ) {
        return ResponseEntity.ok(calendarService.getReviewTopics(eventId));
    }

    @PostMapping("/review-topics")
    public ResponseEntity<ReviewTopicDto> createReviewTopic(
            @RequestBody CreateReviewTopicRequest request
    ) {
        ReviewTopicDto created = calendarService.createReviewTopic(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PostMapping("/courses/suggest-topics")
    public ResponseEntity<SuggestCourseTopicsResponse> suggestCourseTopics(
            @RequestBody(required = false) SuggestCourseTopicsRequest request
    ) {
        return ResponseEntity.ok(calendarService.suggestCourseTopics(request));
    }

    @PostMapping("/review-topics/batch")
    public ResponseEntity<List<ReviewTopicDto>> batchCreateReviewTopics(
            @RequestBody BatchCreateReviewTopicsRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(calendarService.batchCreateReviewTopics(request));
    }

    @PostMapping("/review-topics/schedule")
    public ResponseEntity<List<ReviewTopicDto>> scheduleReviewTopics(
            @RequestBody(required = false) ScheduleReviewTopicsRequest request
    ) {
        return ResponseEntity.ok(calendarService.scheduleReviewTopics(request));
    }

    @PutMapping("/review-topics/{id}")
    public ResponseEntity<ReviewTopicDto> updateReviewTopic(
            @PathVariable("id") long id,
            @RequestBody UpdateReviewTopicRequest request
    ) {
        return ResponseEntity.ok(calendarService.updateReviewTopic(id, request));
    }

    @DeleteMapping("/review-topics/{id}")
    public ResponseEntity<Map<String, Object>> deleteReviewTopic(
            @PathVariable("id") long id
    ) {
        calendarService.deleteReviewTopic(id);
        return ResponseEntity.ok(Map.of("success", true, "message", "复习知识点已删除"));
    }

    @GetMapping(value = "/export.ics", produces = "text/calendar;charset=UTF-8")
    public ResponseEntity<String> exportIcs() {
        String icsContent = calendarService.exportUserCalendarIcs();
        return ResponseEntity.ok()
                .contentType(TEXT_CALENDAR_UTF8)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"oneterm-calendar.ics\"")
                .body(icsContent);
    }
}
