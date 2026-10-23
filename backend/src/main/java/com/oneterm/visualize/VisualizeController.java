package com.oneterm.visualize;

import com.oneterm.visualize.dto.GenerateVisualizationRequest;
import com.oneterm.visualize.dto.VisualizationDto;
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

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 知识点交互式可视化工坊控制器（严格对应 OpenAPI visualize 标签下四个接口）。
 */
@RestController
@RequestMapping("/api/visualize")
public class VisualizeController {

    private final VisualizeService visualizeService;

    public VisualizeController(VisualizeService visualizeService) {
        this.visualizeService = visualizeService;
    }

    /**
     * POST /api/visualize/generate/stream
     * 流式生成知识点交互式可视化单文件 HTML（SSE）。
     */
    @PostMapping(path = "/generate/stream", produces = "text/event-stream;charset=UTF-8")
    public SseEmitter generateStream(@RequestBody(required = false) GenerateVisualizationRequest request) {
        return visualizeService.streamGenerate(request);
    }

    /**
     * GET /api/visualize
     * 获取当前用户已生成的知识点可视化列表（支持按 topicId 过滤）。
     */
    @GetMapping
    public List<VisualizationDto> listVisualizations(
            @RequestParam(name = "topicId", required = false) Long topicId
    ) {
        return visualizeService.listVisualizations(topicId);
    }

    /**
     * GET /api/visualize/{id}
     * 获取单个知识点可视化详情（含完整 HTML，越权访问返回 404）。
     */
    @GetMapping("/{id}")
    public VisualizationDto getVisualization(@PathVariable("id") long id) {
        return visualizeService.getVisualization(id);
    }

    /**
     * DELETE /api/visualize/{id}
     * 删除指定可视化记录（越权访问返回 404）。
     */
    @DeleteMapping("/{id}")
    public Map<String, Object> deleteVisualization(@PathVariable("id") long id) {
        visualizeService.deleteVisualization(id);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("message", "可视化记录已删除");
        return response;
    }
}
