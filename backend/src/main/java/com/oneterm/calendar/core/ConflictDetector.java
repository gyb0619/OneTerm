package com.oneterm.calendar.core;

import com.oneterm.calendar.dto.CalendarEventDto;
import com.oneterm.calendar.dto.ConflictPairDto;

import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * 日程时间冲突检测纯算法类（无框架依赖）。
 * <p>
 * 规则（严格对齐 PRD F3 与 CONVENTIONS 5.2）：
 * 设有时间区间 A = [startA, endA) 与 B = [startB, endB)（start < end）：
 * - 当 max(startA, startB) < min(endA, endB) 时判定为冲突：
 *   - 若任一区间完整包含另一区间（含起止时间完全一致），标记为 {@link ConflictPairDto#FULL_OVERLAP}
 *   - 否则标记为 {@link ConflictPairDto#PARTIAL_OVERLAP}
 * - 当 endA == startB 或 endB == startA（首尾相接）时，max(startA, startB) == min(endA, endB)，不算冲突。
 * - 支持跨天事件重叠检测。
 */
public final class ConflictDetector {

    private ConflictDetector() {
    }

    private record ParsedEvent(
            CalendarEventDto dto,
            ZonedDateTime start,
            ZonedDateTime end,
            int originalIndex
    ) {
    }

    /**
     * 检测事件列表中的所有两两时间冲突对。
     */
    public static List<ConflictPairDto> detectConflicts(List<CalendarEventDto> events) {
        if (events == null || events.size() < 2) {
            return List.of();
        }

        List<ParsedEvent> parsed = new ArrayList<>(events.size());
        for (int i = 0; i < events.size(); i++) {
            CalendarEventDto event = events.get(i);
            if (event == null || event.startTime() == null || event.endTime() == null) {
                continue;
            }
            ZonedDateTime start = CalendarTimeUtils.parseShanghaiDateTime(event.startTime());
            ZonedDateTime end = CalendarTimeUtils.parseShanghaiDateTime(event.endTime());
            if (!end.isAfter(start)) {
                continue;
            }
            parsed.add(new ParsedEvent(event, start, end, i));
        }

        parsed.sort(Comparator
                .comparing(ParsedEvent::start)
                .thenComparing(ParsedEvent::end)
                .thenComparingLong(pe -> pe.dto().id())
                .thenComparingInt(ParsedEvent::originalIndex));

        List<ConflictPairDto> conflicts = new ArrayList<>();
        for (int i = 0; i < parsed.size(); i++) {
            ParsedEvent a = parsed.get(i);
            for (int j = i + 1; j < parsed.size(); j++) {
                ParsedEvent b = parsed.get(j);
                if (a.dto().id() != 0 && a.dto().id() == b.dto().id() && a.originalIndex() == b.originalIndex()) {
                    continue;
                }
                // 由于已按 start 升序排列，当 b.start >= a.end 时，后续事件的 start 均 >= a.end，可提前剪枝
                if (!b.start().isBefore(a.end())) {
                    break;
                }

                ZonedDateTime overlapStart = a.start().isAfter(b.start()) ? a.start() : b.start();
                ZonedDateTime overlapEnd = a.end().isBefore(b.end()) ? a.end() : b.end();

                if (overlapStart.isBefore(overlapEnd)) {
                    boolean aCoversB = !a.start().isAfter(b.start()) && !a.end().isBefore(b.end());
                    boolean bCoversA = !b.start().isAfter(a.start()) && !b.end().isBefore(a.end());
                    String conflictType = (aCoversB || bCoversA)
                            ? ConflictPairDto.FULL_OVERLAP
                            : ConflictPairDto.PARTIAL_OVERLAP;

                    conflicts.add(new ConflictPairDto(
                            a.dto(),
                            b.dto(),
                            conflictType,
                            CalendarTimeUtils.formatShanghaiDateTime(overlapStart),
                            CalendarTimeUtils.formatShanghaiDateTime(overlapEnd)
                    ));
                }
            }
        }
        return conflicts;
    }

    /**
     * 提取所有发生时间冲突的自然日集合（供考前复习排期算法避开冲突日使用）。
     */
    public static Set<LocalDate> extractConflictDates(List<CalendarEventDto> events) {
        List<ConflictPairDto> conflicts = detectConflicts(events);
        if (conflicts.isEmpty()) {
            return Set.of();
        }
        Set<LocalDate> dates = new LinkedHashSet<>();
        for (ConflictPairDto pair : conflicts) {
            ZonedDateTime overlapStart = CalendarTimeUtils.parseShanghaiDateTime(pair.overlapStart());
            ZonedDateTime overlapEnd = CalendarTimeUtils.parseShanghaiDateTime(pair.overlapEnd());
            LocalDate startDate = overlapStart.toLocalDate();
            LocalDate endDate = CalendarTimeUtils.resolveInclusiveEndDate(overlapStart, overlapEnd);
            for (LocalDate d = startDate; !d.isAfter(endDate); d = d.plusDays(1)) {
                dates.add(d);
            }
        }
        return Objects.requireNonNull(dates);
    }
}
