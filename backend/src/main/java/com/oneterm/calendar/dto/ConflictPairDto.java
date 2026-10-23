package com.oneterm.calendar.dto;

/**
 * 日程时间冲突对 DTO（严格对应 OpenAPI ConflictPairDto）。
 *
 * @param eventA       事件 A（按开始时间与 ID 排序在前）
 * @param eventB       事件 B（按开始时间与 ID 排序在后）
 * @param conflictType 冲突类型：FULL_OVERLAP（完全重叠/包含）或 PARTIAL_OVERLAP（部分重叠）
 * @param overlapStart 重叠区间开始时间（ISO 8601 Asia/Shanghai）
 * @param overlapEnd   重叠区间结束时间（ISO 8601 Asia/Shanghai）
 */
public record ConflictPairDto(
        CalendarEventDto eventA,
        CalendarEventDto eventB,
        String conflictType,
        String overlapStart,
        String overlapEnd
) {
    public static final String FULL_OVERLAP = "FULL_OVERLAP";
    public static final String PARTIAL_OVERLAP = "PARTIAL_OVERLAP";
}
