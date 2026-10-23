package com.oneterm.extract.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * 事件新增/编辑/抽取草稿输入 DTO（对齐 OpenAPI EventInputDto）。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record EventInputDto(
        String type,
        String title,
        String startTime,
        String endTime,
        String location,
        String courseName,
        String sourceText
) {
    public EventInputDto {
        location = location == null ? "" : location.trim();
        courseName = courseName == null ? "" : courseName.trim();
    }
}
