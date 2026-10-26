package com.oneterm.extract.controller;

import com.oneterm.common.BusinessException;
import com.oneterm.common.CurrentUserProvider;
import com.oneterm.common.ErrorCode;
import com.oneterm.extract.dto.FileExtractResponse;
import com.oneterm.extract.dto.StreamExtractRequest;
import com.oneterm.extract.service.ExtractService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 教务文件导入解析与大模型流式事件抽取控制器。
 */
@RestController
@RequestMapping("/api/extract")
public class ExtractController {

    private final ExtractService extractService;
    private final CurrentUserProvider currentUserProvider;

    public ExtractController(ExtractService extractService, CurrentUserProvider currentUserProvider) {
        this.extractService = extractService;
        this.currentUserProvider = currentUserProvider;
    }

    /**
     * POST /api/extract/file
     * 上传 .txt / .xlsx / 图片文件（.png/.jpg/.jpeg/.webp）解析为待抽取文本。
     */
    @PostMapping(value = "/file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<FileExtractResponse> extractFile(
            @RequestParam(value = "file", required = false) MultipartFile file
    ) {
        long userId = currentUserProvider.requireCurrentUserId();
        FileExtractResponse response = extractService.parseUploadedFile(userId, file);
        return ResponseEntity.ok(response);
    }

    /**
     * POST /api/extract/timetable
     * 上传周次课表文件（.xls / .xlsx），结合学期开学日期与周次范围自动计算并展开日程。
     */
    @PostMapping(value = "/timetable")
    public ResponseEntity<com.oneterm.extract.core.TimetableWeekParser.ParseResult> parseTimetable(
            @RequestParam(value = "file", required = false) MultipartFile file,
            @RequestParam(value = "semesterStartDate", required = false) String semesterStartDate,
            @RequestParam(value = "startWeek", required = false) Integer startWeek,
            @RequestParam(value = "endWeek", required = false) Integer endWeek
    ) {
        long userId = currentUserProvider.requireCurrentUserId();
        var result = extractService.parseTimetable(userId, file, semesterStartDate, startWeek, endWeek);
        return ResponseEntity.ok(result);
    }

    /**
     * POST /api/extract/stream
     * 从教务文本流式抽取结构化事件（SSE）。
     */
    @PostMapping(value = "/stream")
    public SseEmitter streamExtract(@RequestBody(required = false) StreamExtractRequest request) {
        long userId = currentUserProvider.requireCurrentUserId();
        if (request == null || request.text() == null || request.text().isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "待抽取的教务文本不能为空");
        }
        SseEmitter emitter = new SseEmitter(180_000L);
        extractService.streamExtract(userId, request.text(), emitter);
        return emitter;
    }
}
