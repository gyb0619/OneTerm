package com.oneterm.extract.controller;

import com.oneterm.common.BusinessException;
import com.oneterm.common.CurrentUserProvider;
import com.oneterm.common.ErrorCode;
import com.oneterm.extract.dto.BatchEventRequest;
import com.oneterm.extract.dto.EventDto;
import com.oneterm.extract.dto.EventInputDto;
import com.oneterm.extract.dto.SimpleSuccessResponse;
import com.oneterm.extract.service.EventService;
import org.springframework.http.HttpStatus;
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

import java.util.List;

/**
 * 教务事件确认入库与增删改查控制器（强制按当前登录 user_id 隔离）。
 */
@RestController
@RequestMapping("/api/events")
public class EventController {

    private final EventService eventService;
    private final CurrentUserProvider currentUserProvider;

    public EventController(EventService eventService, CurrentUserProvider currentUserProvider) {
        this.eventService = eventService;
        this.currentUserProvider = currentUserProvider;
    }

    /**
     * POST /api/events/batch
     * 批量确认入库已核对编辑的事件列表，并同步生成 RAG 原文切片与向量。
     */
    @PostMapping("/batch")
    public ResponseEntity<List<EventDto>> batchCreateEvents(
            @RequestBody(required = false) BatchEventRequest request
    ) {
        long userId = currentUserProvider.requireCurrentUserId();
        if (request == null || request.events() == null || request.events().isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "批量入库事件列表不能为空");
        }
        List<EventDto> created = eventService.batchCreateEvents(userId, request.events());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /**
     * GET /api/events
     * 查询当前登录用户的事件列表（支持可选 type、start、end 过滤）。
     */
    @GetMapping
    public ResponseEntity<List<EventDto>> listEvents(
            @RequestParam(value = "type", required = false) String type,
            @RequestParam(value = "start", required = false) String start,
            @RequestParam(value = "end", required = false) String end
    ) {
        long userId = currentUserProvider.requireCurrentUserId();
        List<EventDto> events = eventService.listEvents(userId, type, start, end);
        return ResponseEntity.ok(events);
    }

    /**
     * POST /api/events
     * 手动新增单条事件。
     */
    @PostMapping
    public ResponseEntity<EventDto> createEvent(
            @RequestBody(required = false) EventInputDto request
    ) {
        long userId = currentUserProvider.requireCurrentUserId();
        if (request == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "事件内容不能为空");
        }
        EventDto created = eventService.createEvent(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /**
     * PUT /api/events/{id}
     * 编辑指定事件（强制校验 user_id，越权或不存在返回 404）。
     */
    @PutMapping("/{id}")
    public ResponseEntity<EventDto> updateEvent(
            @PathVariable("id") long id,
            @RequestBody(required = false) EventInputDto request
    ) {
        long userId = currentUserProvider.requireCurrentUserId();
        if (request == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "事件内容不能为空");
        }
        EventDto updated = eventService.updateEvent(userId, id, request);
        return ResponseEntity.ok(updated);
    }

    /**
     * DELETE /api/events/{id}
     * 删除指定事件（强制校验 user_id，越权或不存在返回 404）。
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<SimpleSuccessResponse> deleteEvent(@PathVariable("id") long id) {
        long userId = currentUserProvider.requireCurrentUserId();
        eventService.deleteEvent(userId, id);
        return ResponseEntity.ok(new SimpleSuccessResponse(true, "事件已删除"));
    }
}
