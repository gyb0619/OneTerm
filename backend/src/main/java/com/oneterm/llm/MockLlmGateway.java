package com.oneterm.llm;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Locale;

/**
 * 大模型网关的 Mock 实现。
 * 当环境变量 ONETERM_MOCK=true 或数据库中尚无有效大模型配置时启用。
 * 对固定示例输入返回预置的结构化抽取结果、问答与可视化页面，并模拟逐字流式输出。
 */
@Service
public class MockLlmGateway implements LlmGateway {

    private static final int EMBEDDING_DIM = 64;
    private static final String MOCK_MODEL_NAME = "mock-deepseek-chat";

    @Value("${oneterm.mock:true}")
    private boolean mockConfigFlag;

    private volatile boolean embeddingEnabled = true;

    @Override
    public boolean isMockMode() {
        return true;
    }

    @Override
    public boolean hasActiveEmbeddingModel() {
        return embeddingEnabled;
    }

    public void setEmbeddingEnabled(boolean embeddingEnabled) {
        this.embeddingEnabled = embeddingEnabled;
    }

    @Override
    public ChatResult chat(long userId, String kind, List<ChatMessage> messages) {
        String promptText = concatMessages(messages);
        String response = generateMockContent(kind, messages);
        TokenUsage usage = TokenUsage.estimate(promptText, response);
        return new ChatResult(response, usage, MOCK_MODEL_NAME, true);
    }

    @Override
    public void streamChat(long userId, String kind, List<ChatMessage> messages, LlmStreamListener listener) {
        try {
            String normalizedKind = kind == null ? "chat" : kind.trim().toLowerCase(Locale.ROOT);
            String fullResponse = generateMockContent(normalizedKind, messages);
            String promptText = concatMessages(messages);

            if ("extract".equals(normalizedKind)) {
                int totalEvents = 9;
                for (int i = 1; i <= totalEvents; i++) {
                    listener.onProgress("extracting", i, totalEvents, "正在识别第 " + i + " 条事件");
                }
            } else if ("qa".equals(normalizedKind)) {
                listener.onProgress("retrieving", 1, 2, "正在检索相关教务原文片段");
                listener.onProgress("generating", 2, 2, "正在结合课表与通知生成回答");
            } else if ("visualize".equals(normalizedKind)) {
                listener.onProgress("generating", 1, 2, "正在构建知识点交互式动画脚本");
                listener.onProgress("validating", 2, 2, "正在执行沙箱安全校验");
            }

            // 模拟逐字/分块流式输出
            int chunkSize = "visualize".equals(normalizedKind) ? 120 : 16;
            for (int offset = 0; offset < fullResponse.length(); offset += chunkSize) {
                int end = Math.min(fullResponse.length(), offset + chunkSize);
                listener.onDelta(fullResponse.substring(offset, end));
            }

            TokenUsage usage = TokenUsage.estimate(promptText, fullResponse);
            listener.onComplete(new ChatResult(fullResponse, usage, MOCK_MODEL_NAME, true));
        } catch (Exception ex) {
            listener.onError(ex);
        }
    }

    @Override
    public ChatResult extractTextFromImage(long userId, byte[] imageBytes, String mimeType, String prompt) {
        String sampleText = loadSampleText();
        TokenUsage usage = new TokenUsage(260, TokenUsage.estimateCount(sampleText));
        return new ChatResult(sampleText, usage, "mock-vision-ocr", true);
    }

    @Override
    public float[] embed(long userId, String text) {
        float[] vec = new float[EMBEDDING_DIM];
        if (text == null || text.isBlank()) {
            vec[0] = 1.0f;
            return vec;
        }
        String normalized = text.toLowerCase(Locale.ROOT);

        // 注入教务高频语义锚点特征，使得余弦相似度检索对「周三有空吗」「期末哪几门最紧」等具备高区分度
        String[] keywords = {
                "周三", "11-04", "有空", "算法设计与分析", "操作系统", "计算机网络",
                "期末", "考试", "测验", "上机", "截止", "实验报告", "冒泡排序",
                "三次握手", "tcp", "acm", "社团", "11-06", "11-11", "11-12", "11-13"
        };
        for (int i = 0; i < keywords.length && i < EMBEDDING_DIM / 2; i++) {
            if (normalized.contains(keywords[i])) {
                vec[i] += 3.0f;
            }
        }
        // 结合周三日期语义关联（2026-11-04 为周三）
        if (normalized.contains("周三") || normalized.contains("11-04")) {
            vec[0] += 4.0f;
            vec[1] += 4.0f;
        }
        if (normalized.contains("期末") || normalized.contains("最紧") || normalized.contains("考试") || normalized.contains("截止")) {
            vec[6] += 3.5f;
            vec[7] += 3.5f;
            vec[10] += 3.0f;
        }

        // 字符二元语法哈希分布到其余维度
        for (int i = 0; i < normalized.length(); i++) {
            int h = normalized.charAt(i) * 31 + (i + 1 < normalized.length() ? normalized.charAt(i + 1) : 0);
            int bucket = (Math.abs(h) % (EMBEDDING_DIM / 2)) + (EMBEDDING_DIM / 2);
            vec[bucket] += 1.0f;
        }

        // L2 归一化
        double norm = 0.0;
        for (float v : vec) {
            norm += (double) v * v;
        }
        norm = Math.sqrt(norm);
        if (norm > 1e-8) {
            for (int i = 0; i < vec.length; i++) {
                vec[i] = (float) (vec[i] / norm);
            }
        } else {
            vec[0] = 1.0f;
        }
        return vec;
    }

    private String generateMockContent(String kind, List<ChatMessage> messages) {
        String lastUserMsg = "";
        if (messages != null) {
            for (int i = messages.size() - 1; i >= 0; i--) {
                if ("user".equalsIgnoreCase(messages.get(i).role())) {
                    lastUserMsg = messages.get(i).content();
                    break;
                }
            }
        }
        String allText = concatMessages(messages);

        if ("extract".equalsIgnoreCase(kind) || allText.contains("sourceText") && allText.contains("JSON")) {
            return loadExpectedEventsJson();
        }
        if ("visualize".equalsIgnoreCase(kind) || allText.contains("<!DOCTYPE html>")) {
            return MockVisualizationPresets.getHtmlForTopic(lastUserMsg);
        }
        if ("qa".equalsIgnoreCase(kind)) {
            return buildMockQaAnswer(lastUserMsg);
        }
        return buildMockQaAnswer(lastUserMsg);
    }

    private String buildMockQaAnswer(String question) {
        String q = question == null ? "" : question;
        if (q.contains("周三") || q.contains("有空")) {
            return "根据您的课表与考试通知，**2026-11-04（周三）** 日程较为密集，但仍有两段空闲时间：\n\n"
                    + "1. **已安排日程**：\n"
                    + "   - `08:00 - 09:40`：《算法设计与分析》课程（教学楼 A302）\n"
                    + "   - `09:40 - 11:20`：《操作系统》课程（教学楼 A302，与上一节首尾相接）\n"
                    + "   - `14:00 - 16:00`：《计算机网络》实验课（实验楼 B205）\n"
                    + "   - `15:00 - 17:00`：《算法设计与分析》期中随堂测验（教学楼 C101，**注意：与计算机网络实验课在 15:00-16:00 存在冲突**）\n\n"
                    + "2. **可用空闲时段**：\n"
                    + "   - **午间时段 `11:20 - 14:00`** 完全空闲；\n"
                    + "   - **晚间时段 `17:00` 之后** 完全空闲，适合安排考前复习。";
        }
        if (q.contains("期末") || q.contains("最紧") || q.contains("哪几门")) {
            return "结合本学期考试与作业截止安排，期末前任务最紧的是 **《计算机网络》** 与 **《算法设计与分析》**，其次是 **《操作系统》**：\n\n"
                    + "1. **《计算机网络》（最紧迫）**：\n"
                    + "   - `2026-11-12 20:00-22:00` 需提交 TCP 三次握手抓包实验分析报告；\n"
                    + "   - 紧接着次日 `2026-11-13 09:00-11:00` 即进行期末统考（第一教学楼 A105），复习窗口非常紧凑。\n"
                    + "2. **《算法设计与分析》**：\n"
                    + "   - `2026-11-04 15:00-17:00` 有期中随堂测验（考查冒泡排序、归并排序与贪心策略）；\n"
                    + "   - `2026-11-11 22:00-23:59` 需提交第二次实验报告。\n"
                    + "3. **《操作系统》**：\n"
                    + "   - `2026-11-06 19:00-21:00` 进行期中上机考核（机房 D401，且与同时间段 ACM 协会招新沙龙存在时间冲突）。";
        }
        return "根据您已导入的学期教务日程，当前共有 **3 门课程、3 场考试、2 项作业截止与 1 项社团活动**，其中存在 **2 处时间冲突**（11月4日下午算法期中测验与计网实验课部分重叠、11月6日晚操作系统机考与 ACM 活动完全重叠）。建议优先处理冲突日程并按复习路径推进《算法设计与分析》和《计算机网络》的核心考点复习。";
    }

    private String concatMessages(List<ChatMessage> messages) {
        if (messages == null || messages.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (ChatMessage msg : messages) {
            sb.append(msg.role()).append(": ").append(msg.content()).append('\n');
        }
        return sb.toString();
    }

    public static String loadExpectedEventsJson() {
        Path[] candidates = {
                Paths.get("../docs/samples/expected-events.json"),
                Paths.get("docs/samples/expected-events.json")
        };
        for (Path p : candidates) {
            if (Files.exists(p)) {
                try {
                    return Files.readString(p, StandardCharsets.UTF_8);
                } catch (IOException ignored) {
                }
            }
        }
        try {
            ClassPathResource resource = new ClassPathResource("samples/expected-events.json");
            if (resource.exists()) {
                return new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            }
        } catch (IOException ignored) {
        }
        return FALLBACK_EXPECTED_EVENTS_JSON;
    }

    public static String loadSampleText() {
        Path[] candidates = {
                Paths.get("../docs/samples/semester-sample.txt"),
                Paths.get("docs/samples/semester-sample.txt")
        };
        for (Path p : candidates) {
            if (Files.exists(p)) {
                try {
                    return Files.readString(p, StandardCharsets.UTF_8);
                } catch (IOException ignored) {
                }
            }
        }
        return "【教务处课表导出】《算法设计与分析》2026-11-04 08:00-09:40 教学楼 A302";
    }

    private static final String FALLBACK_EXPECTED_EVENTS_JSON = """
            [
              {
                "type": "course",
                "title": "《算法设计与分析》课程",
                "startTime": "2026-11-04T08:00:00+08:00",
                "endTime": "2026-11-04T09:40:00+08:00",
                "location": "教学楼 A302",
                "courseName": "算法设计与分析",
                "sourceText": "1. 课程名称：《算法设计与分析》\\n上课时间：2026-11-04 08:00 至 2026-11-04 09:40\\n上课地点：教学楼 A302\\n备注：主讲林教授，本周讲授冒泡排序、快速排序复杂度分析与分治策略。"
              }
            ]
            """;
}
