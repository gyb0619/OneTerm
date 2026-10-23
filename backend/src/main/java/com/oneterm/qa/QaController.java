package com.oneterm.qa;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

/**
 * 教务 RAG 问答控制器（严格对应 OpenAPI /api/qa/** 契约）。
 * Controller 仅负责接收参数与返回响应，业务逻辑委托给 {@link QaService}。
 */
@RestController
@RequestMapping("/api/qa")
public class QaController {

    private final QaService qaService;

    public QaController(QaService qaService) {
        this.qaService = qaService;
    }

    /**
     * POST /api/qa/index
     * 重建当前登录用户的事件原文切片与向量索引。
     */
    @PostMapping("/index")
    public QaIndexResponse rebuildIndex() {
        return qaService.indexEventsForCurrentUser();
    }

    /**
     * POST /api/qa/ask/stream
     * 自然语言 RAG 流式问答（带原文引用，SSE）。
     */
    @PostMapping(
            value = "/ask/stream",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = "text/event-stream;charset=UTF-8"
    )
    public SseEmitter askStream(@RequestBody(required = false) QaAskRequest request) {
        return qaService.streamAskForCurrentUser(request);
    }

    /**
     * GET /api/qa/history
     * 获取当前用户的问答历史记录（按时间倒序排列）。
     */
    @GetMapping("/history")
    public List<QaHistoryDto> getHistory(@RequestParam(defaultValue = "50") int limit) {
        return qaService.getHistoryForCurrentUser(limit);
    }

    /**
     * DELETE /api/qa/history/{id}
     * 删除指定单条问答历史记录。
     */
    @DeleteMapping("/history/{id}")
    public void deleteHistoryItem(@PathVariable long id) {
        qaService.deleteHistoryItemForCurrentUser(id);
    }

    /**
     * DELETE /api/qa/history
     * 清空当前用户的全部问答历史记录。
     */
    @DeleteMapping("/history")
    public void clearHistory() {
        qaService.clearHistoryForCurrentUser();
    }
}
