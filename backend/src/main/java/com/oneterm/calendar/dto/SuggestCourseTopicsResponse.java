package com.oneterm.calendar.dto;

import java.util.List;

/**
 * 智能提炼单科考点大纲响应 DTO。
 */
public record SuggestCourseTopicsResponse(
        Long eventId,
        String courseName,
        List<String> topics
) {
}
