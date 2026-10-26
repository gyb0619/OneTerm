package com.oneterm.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    private final ObjectMapper objectMapper;

    public GlobalExceptionHandler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<?> handleBusinessException(BusinessException ex, HttpServletRequest request) {
        ErrorCode code = ex.getErrorCode();
        return buildErrorResponse(new ApiError(code.name(), ex.getMessage()), code.getStatus(), request);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<?> handleNoResourceFound(NoResourceFoundException ex, HttpServletRequest request) {
        return buildErrorResponse(new ApiError(ErrorCode.NOT_FOUND.name(), "资源不存在"), ErrorCode.NOT_FOUND.getStatus(), request);
    }

    @ExceptionHandler({
            MethodArgumentNotValidException.class,
            MissingServletRequestParameterException.class,
            IllegalArgumentException.class
    })
    public ResponseEntity<?> handleBadRequest(Exception ex, HttpServletRequest request) {
        String msg = ex.getMessage() != null ? ex.getMessage() : ErrorCode.BAD_REQUEST.getDefaultMessage();
        if (ex instanceof MethodArgumentNotValidException manv && manv.getBindingResult().getFieldError() != null) {
            msg = manv.getBindingResult().getFieldError().getDefaultMessage();
        }
        return buildErrorResponse(new ApiError(ErrorCode.BAD_REQUEST.name(), msg), ErrorCode.BAD_REQUEST.getStatus(), request);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<?> handleMaxUploadSize(MaxUploadSizeExceededException ex, HttpServletRequest request) {
        return buildErrorResponse(
                new ApiError(ErrorCode.BAD_REQUEST.name(), "上传文件体积超出限制（最大 10MB）"),
                ErrorCode.BAD_REQUEST.getStatus(),
                request
        );
    }

    @ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
    public ResponseEntity<String> handleMediaTypeNotAcceptable(HttpMediaTypeNotAcceptableException ex) {
        return ResponseEntity
                .status(ErrorCode.BAD_REQUEST.getStatus())
                .contentType(MediaType.TEXT_PLAIN)
                .body("Bad Request: Not Acceptable Media Type");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> handleGenericException(Exception ex, HttpServletRequest request) {
        log.error("Unhandled server exception: ", ex);
        return buildErrorResponse(
                new ApiError(ErrorCode.INTERNAL_ERROR.name(), ErrorCode.INTERNAL_ERROR.getDefaultMessage()),
                ErrorCode.INTERNAL_ERROR.getStatus(),
                request
        );
    }

    private ResponseEntity<?> buildErrorResponse(ApiError error, HttpStatus status, HttpServletRequest request) {
        String accept = request != null ? request.getHeader("Accept") : null;
        if (accept != null && accept.contains(MediaType.TEXT_EVENT_STREAM_VALUE)) {
            String sseData;
            try {
                sseData = objectMapper.writeValueAsString(error);
            } catch (Exception e) {
                sseData = "{\"code\":\"" + error.code() + "\",\"message\":\"" + error.message() + "\"}";
            }
            String ssePayload = "event: error\ndata: " + sseData + "\n\n";
            return ResponseEntity
                    .status(status)
                    .contentType(MediaType.parseMediaType("text/event-stream;charset=UTF-8"))
                    .body(ssePayload);
        }
        return ResponseEntity
                .status(status)
                .contentType(MediaType.APPLICATION_JSON)
                .body(error);
    }
}

