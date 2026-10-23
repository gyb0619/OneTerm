package com.oneterm.visualize.core;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 知识点可视化 HTML 安全沙箱校验器（纯 Java 实现，无任何外部框架依赖）。
 * <p>
 * 严格对齐 PRD F5 安全规范：
 * 1. 非空且包含基本 HTML 结构，支持自动剥离大模型可能包裹的 Markdown 代码块标记（```html ... ```）。
 * 2. UTF-8 字节体积不超过 100KB（102,400 字节）。
 * 3. 严禁出现任何外部网络请求与外链资源（http://、https://、// 协议相对外链、fetch、XMLHttpRequest、
 *    WebSocket、EventSource、navigator.sendBeacon、script[src]、link[href]、@import、import() 等）。
 * 4. 校验知识点类型是否为第一版支持的「算法与数据结构」或「计算机网络协议」类别，并拦截提示词注入指令。
 */
public final class HtmlSandboxValidator {

    /**
     * 单文件 HTML 最大允许体积：100KB（102,400 字节）。
     */
    public static final int MAX_HTML_BYTES = 100 * 1024;

    /**
     * 知识点最长允许字符数。
     */
    public static final int MAX_TOPIC_LENGTH = 80;

    /**
     * 匹配 ```html ... ``` 或 ``` ... ``` 代码块包裹。
     */
    private static final Pattern CODE_FENCE_PATTERN = Pattern.compile(
            "(?is)```(?:html|htm|xml)?\\s*(<!doctype\\s+html[^>]*>.*?</html>|<html[^>]*>.*?</html>)\\s*```"
    );

    private static final Pattern LEADING_FENCE_PATTERN = Pattern.compile("(?is)^\\s*```(?:html|htm|xml)?\\s*");
    private static final Pattern TRAILING_FENCE_PATTERN = Pattern.compile("(?is)\\s*```\\s*$");

    private static final Pattern HTML_OPEN_TAG_PATTERN = Pattern.compile("(?is)<html\\b");
    private static final Pattern HTML_CLOSE_TAG_PATTERN = Pattern.compile("(?is)</html\\s*>");
    private static final Pattern BODY_OR_SCRIPT_PATTERN = Pattern.compile("(?is)<(?:body|script)\\b");
    private static final Pattern BUTTON_CONTROL_PATTERN = Pattern.compile("(?is)<button\\b");
    private static final Pattern RANGE_SLIDER_PATTERN = Pattern.compile("(?is)<input\\b[^>]*\\btype\\s*=\\s*[\"']?range\\b");

    private record ForbiddenRule(String code, String description, Pattern pattern) {
    }

    /**
     * 禁止出现的外部网络请求与外链特征规则集。
     */
    private static final List<ForbiddenRule> FORBIDDEN_NETWORK_RULES = List.of(
            new ForbiddenRule(
                    "HTTP_URL",
                    "禁止包含 http:// 或 https:// 外部链接",
                    Pattern.compile("(?i)https?://")
            ),
            new ForbiddenRule(
                    "PROTOCOL_RELATIVE_URL",
                    "禁止包含 // 协议相对外部链接",
                    Pattern.compile("(?i)(?:(?:src|href|action|data|poster|formaction)\\s*=\\s*[\"']?\\s*//|url\\s*\\(\\s*[\"']?\\s*//|[\"'`]\\s*//[a-z0-9][-a-z0-9.]*\\.[a-z]{2,}|(?:^|[\\s(])//[a-z0-9][-a-z0-9.]*\\.[a-z]{2,}/)")
            ),
            new ForbiddenRule(
                    "FETCH_API",
                    "禁止调用 fetch() 网络请求接口",
                    Pattern.compile("(?i)\\bfetch\\s*\\(")
            ),
            new ForbiddenRule(
                    "XHR_API",
                    "禁止使用 XMLHttpRequest 网络请求对象",
                    Pattern.compile("(?i)\\bXMLHttpRequest\\b")
            ),
            new ForbiddenRule(
                    "WEBSOCKET_API",
                    "禁止使用 WebSocket 建立外部长连接",
                    Pattern.compile("(?i)\\bWebSocket\\b")
            ),
            new ForbiddenRule(
                    "EVENTSOURCE_API",
                    "禁止使用 EventSource 建立外部事件流连接",
                    Pattern.compile("(?i)\\bEventSource\\b")
            ),
            new ForbiddenRule(
                    "SEND_BEACON_API",
                    "禁止使用 navigator.sendBeacon 发送外部数据",
                    Pattern.compile("(?i)(?:navigator\\s*\\.\\s*sendBeacon|\\bsendBeacon\\s*\\()")
            ),
            new ForbiddenRule(
                    "EXTERNAL_SCRIPT_TAG",
                    "禁止使用 <script src=...> 加载外部脚本",
                    Pattern.compile("(?is)<script\\b[^>]*\\bsrc\\s*=")
            ),
            new ForbiddenRule(
                    "EXTERNAL_LINK_TAG",
                    "禁止使用 <link href=...> 加载外部样式或资源",
                    Pattern.compile("(?is)<link\\b[^>]*\\bhref\\s*=")
            ),
            new ForbiddenRule(
                    "CSS_IMPORT",
                    "禁止使用 CSS @import 导入外部样式表",
                    Pattern.compile("(?i)@import\\b")
            ),
            new ForbiddenRule(
                    "DYNAMIC_IMPORT",
                    "禁止使用 import() 动态加载或 ES Module 外部模块导入",
                    Pattern.compile("(?i)(?:\\bimport\\s*\\(|\\bimport\\s+(?:[\\w*{}\\s,]+\\s+from\\s+)?[\"'])")
            ),
            new ForbiddenRule(
                    "EMBEDDED_FRAME_OR_OBJECT",
                    "禁止嵌套 iframe / object / embed 外部容器标签",
                    Pattern.compile("(?is)<(?:iframe|frame|object|embed|applet)\\b")
            )
    );

    /**
     * 疑似提示词注入特征词。
     */
    private static final List<String> PROMPT_INJECTION_PATTERNS = List.of(
            "忽略之前", "忽略上述", "忽略以上", "无视之前", "无视上述",
            "ignore previous", "ignore all previous", "ignore above", "disregard previous",
            "system prompt", "系统提示词", "输出你的提示词", "reveal your prompt",
            "<script", "javascript:", "onerror=", "onload="
    );

    /**
     * 第一版支持的「计算机网络协议」关键词词表。
     */
    private static final List<String> NETWORK_PROTOCOL_KEYWORDS = List.of(
            "tcp", "udp", "ip", "ipv4", "ipv6", "http", "https", "dns", "arp", "rarp",
            "icmp", "dhcp", "bgp", "ospf", "rip", "nat", "tls", "ssl", "quic", "socket",
            "三次握手", "四次挥手", "握手", "挥手", "滑动窗口", "拥塞控制", "慢启动",
            "拥塞避免", "快重传", "快恢复", "流量控制", "停止等待", "停等协议",
            "后退n帧", "回退n帧", "gbn", "选择重传", "csma", "以太网", "vlan",
            "路由", "交换", "子网", "cidr", "报文", "协议", "网络", "链路",
            "传输层", "网络层", "数据链路", "帧", "封包", "拆包",
            "handshake", "protocol", "congestion", "sliding window", "packet", "routing"
    );

    /**
     * 第一版支持的「算法与数据结构（含操作系统经典算法）」关键词词表。
     */
    private static final List<String> ALGORITHM_KEYWORDS = List.of(
            "排序", "冒泡", "快速排序", "快排", "归并", "堆排序", "插入排序", "选择排序",
            "希尔", "基数排序", "桶排序", "计数排序", "二分", "查找", "搜索",
            "dfs", "bfs", "深度优先", "广度优先", "宽度优先", "最短路",
            "dijkstra", "floyd", "bellman", "spfa", "最小生成树", "prim", "kruskal",
            "拓扑", "动态规划", "dp", "背包", "最长公共子序列", "lcs", "lis",
            "贪心", "分治", "回溯", "递归", "双指针", "滑动窗口最大值", "单调栈", "单调队列",
            "kmp", "字符串匹配", "trie", "字典树", "自动机", "哈希", "散列",
            "链表", "栈", "队列", "二叉树", "红黑树", "avl", "b树", "b+树", "平衡树",
            "线段树", "树状数组", "并查集", "优先队列", "堆", "图", "状态机",
            "银行家", "死锁", "页面置换", "lru", "fifo", "opt", "clock",
            "调度", "时间片", "先来先服务", "fcfs", "短作业", "sjf", "高响应比",
            "电梯算法", "scan", "内存分配", "首次适应", "最佳适应", "伙伴系统",
            "算法", "数据结构", "复杂度", "遍历", "指针", "矩阵", "博弈",
            "sort", "bubble", "quick", "merge", "heap", "search", "binary",
            "tree", "graph", "algorithm", "linked list", "stack", "queue"
    );

    /**
     * 知识点类别枚举。
     */
    public enum TopicCategory {
        ALGORITHM,
        NETWORK_PROTOCOL,
        UNSUPPORTED
    }

    /**
     * 知识点类别校验结果。
     */
    public record TopicValidationResult(
            boolean valid,
            TopicCategory category,
            String normalizedTopic,
            String reason
    ) {
    }

    /**
     * HTML 安全沙箱校验结果。
     */
    public record ValidationResult(
            boolean valid,
            String sanitizedHtml,
            int utf8ByteLength,
            String reason,
            List<String> violations
    ) {
    }

    /**
     * 剥离大模型可能输出的 Markdown 代码块包裹（如 ```html ... ```）。
     */
    public String stripCodeFences(String raw) {
        if (raw == null) {
            return "";
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return "";
        }

        Matcher fencedMatcher = CODE_FENCE_PATTERN.matcher(trimmed);
        if (fencedMatcher.find()) {
            return fencedMatcher.group(1).trim();
        }

        if (trimmed.startsWith("```")) {
            trimmed = LEADING_FENCE_PATTERN.matcher(trimmed).replaceFirst("");
            trimmed = TRAILING_FENCE_PATTERN.matcher(trimmed).replaceFirst("");
        }

        return trimmed.trim();
    }

    /**
     * 执行完整的 HTML 安全沙箱校验。
     *
     * @param rawHtml 大模型原始输出文本
     * @return 包含是否通过、剥离后的干净 HTML、UTF-8 字节数及违规原因列表的结果对象
     */
    public ValidationResult validateHtml(String rawHtml) {
        if (rawHtml == null || rawHtml.isBlank()) {
            return new ValidationResult(false, "", 0, "生成的 HTML 内容为空", List.of("EMPTY_HTML"));
        }

        String sanitized = stripCodeFences(rawHtml);
        if (sanitized.isBlank()) {
            return new ValidationResult(false, "", 0, "剥离代码块后 HTML 内容为空", List.of("EMPTY_HTML"));
        }

        int byteLength = sanitized.getBytes(StandardCharsets.UTF_8).length;
        if (byteLength > MAX_HTML_BYTES) {
            String msg = "HTML 体积超出 100KB 安全上限（当前 " + byteLength + " 字节，上限 " + MAX_HTML_BYTES + " 字节）";
            return new ValidationResult(false, sanitized, byteLength, msg, List.of("EXCEEDS_MAX_SIZE_100KB"));
        }

        List<String> violations = new ArrayList<>();
        List<String> descriptions = new ArrayList<>();
        for (ForbiddenRule rule : FORBIDDEN_NETWORK_RULES) {
            if (rule.pattern().matcher(sanitized).find()) {
                violations.add(rule.code());
                descriptions.add(rule.description());
            }
        }

        if (!violations.isEmpty()) {
            String reason = "检测到违禁外部网络请求或外链特征：" + String.join("；", descriptions);
            return new ValidationResult(false, sanitized, byteLength, reason, List.copyOf(violations));
        }

        if (!HTML_OPEN_TAG_PATTERN.matcher(sanitized).find()
                || !HTML_CLOSE_TAG_PATTERN.matcher(sanitized).find()
                || !BODY_OR_SCRIPT_PATTERN.matcher(sanitized).find()) {
            return new ValidationResult(
                    false,
                    sanitized,
                    byteLength,
                    "缺少完整的 HTML 基本结构（需包含 <html>...</html> 及 <body>/<script>）",
                    List.of("INVALID_HTML_STRUCTURE")
            );
        }

        return new ValidationResult(true, sanitized, byteLength, "安全沙箱校验通过", List.of());
    }

    /**
     * 检查 HTML 是否同时包含交互按钮（button）与滑块（input[type=range]）。
     */
    public boolean hasInteractiveControls(String html) {
        if (html == null || html.isBlank()) {
            return false;
        }
        return BUTTON_CONTROL_PATTERN.matcher(html).find()
                && RANGE_SLIDER_PATTERN.matcher(html).find();
    }

    /**
     * 校验知识点名称是否合法且属于第一版支持的「算法」或「网络协议」类别。
     */
    public TopicValidationResult validateTopic(String rawTopic) {
        if (rawTopic == null || rawTopic.isBlank()) {
            return new TopicValidationResult(
                    false,
                    TopicCategory.UNSUPPORTED,
                    "",
                    "知识点名称不能为空"
            );
        }

        String normalized = rawTopic.trim();
        if (normalized.length() > MAX_TOPIC_LENGTH) {
            return new TopicValidationResult(
                    false,
                    TopicCategory.UNSUPPORTED,
                    normalized,
                    "知识点名称长度不能超过 " + MAX_TOPIC_LENGTH + " 个字符"
            );
        }

        String lower = normalized.toLowerCase(Locale.ROOT);
        for (String injection : PROMPT_INJECTION_PATTERNS) {
            if (lower.contains(injection)) {
                return new TopicValidationResult(
                        false,
                        TopicCategory.UNSUPPORTED,
                        normalized,
                        "检测到疑似提示词注入或越权指令，请仅输入算法或网络协议知识点名称"
                );
            }
        }

        for (String kw : NETWORK_PROTOCOL_KEYWORDS) {
            if (lower.contains(kw)) {
                return new TopicValidationResult(
                        true,
                        TopicCategory.NETWORK_PROTOCOL,
                        normalized,
                        "网络协议类知识点"
                );
            }
        }

        for (String kw : ALGORITHM_KEYWORDS) {
            if (lower.contains(kw)) {
                return new TopicValidationResult(
                        true,
                        TopicCategory.ALGORITHM,
                        normalized,
                        "算法与数据结构类知识点"
                );
            }
        }

        return new TopicValidationResult(
                false,
                TopicCategory.UNSUPPORTED,
                normalized,
                "第一版可视化工坊仅支持「算法与数据结构」与「计算机网络协议」类知识点（例如：冒泡排序、快速排序、TCP 三次握手、滑动窗口协议）"
        );
    }

    /**
     * 判断给定知识点名称是否受第一版支持。
     */
    public boolean isSupportedTopic(String rawTopic) {
        return validateTopic(rawTopic).valid();
    }
}
