package com.oneterm.calendar.dto;

/**
 * 考前复习知识点及排期 DTO（严格对应 OpenAPI ReviewTopicDto）。
 */
public record ReviewTopicDto(
        long id,
        long userId,
        long eventId,
        String eventTitle,
        String courseName,
        String examDate,
        String topic,
        String plannedDate,
        boolean done,
        Long visualizationId
) {
    public ReviewTopicDto withPlannedDate(String newPlannedDate) {
        return new ReviewTopicDto(
                id,
                userId,
                eventId,
                eventTitle,
                courseName,
                examDate,
                topic,
                newPlannedDate,
                done,
                visualizationId
        );
    }
}
