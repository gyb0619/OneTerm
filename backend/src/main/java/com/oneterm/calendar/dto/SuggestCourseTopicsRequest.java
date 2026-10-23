package com.oneterm.calendar.dto;

/**
 * 智能提炼单科考点大纲请求 DTO。
 */
public record SuggestCourseTopicsRequest(
        Long eventId,
        String courseName
) {
}
