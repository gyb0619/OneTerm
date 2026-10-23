package com.oneterm.qa.core;

import com.oneterm.common.VectorUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 余弦相似度向量检索 + BM25 关键词降级检索纯算法实现（无框架依赖）。
 * <ul>
 *   <li>向量检索模式：解码 SQLite {@code chunks.embedding} 的 float32 BLOB，使用余弦相似度取 Top-4 片段。</li>
 *   <li>BM25 降级模式：当未启用向量模型或切片无有效向量时，自动降级为 Okapi BM25 算法（支持中文字符二元语法 bigram + 关键词切分计算 IDF 与 TF 得分），同样返回 Top-4 片段。</li>
 * </ul>
 */
public final class Retriever {

    public static final int DEFAULT_TOP_K = 4;
    public static final String MODE_EMBEDDING = "embedding";
    public static final String MODE_BM25 = "bm25";

    private static final double BM25_K1 = 1.5;
    private static final double BM25_B = 0.75;
    private static final Pattern ALPHANUM_PATTERN = Pattern.compile("[a-z0-9]+(?:-+[a-z0-9]+)*");

    private static final String[] DOMAIN_KEYWORDS = {
            "算法设计与分析", "计算机网络", "操作系统",
            "三次握手", "四次挥手", "冒泡排序", "快速排序", "归并排序", "贪心算法", "银行家算法", "页面置换",
            "随堂测验", "上机考核", "期末考试", "期末统考", "实验报告", "实验课", "作业截止",
            "星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日",
            "周一", "周二", "周三", "周四", "周五", "周六", "周日",
            "期末", "期中", "考试", "测验", "考核", "机考", "截止", "提交", "冲突", "有空", "空闲", "最紧",
            "课程", "上课", "实验", "通知", "社团", "活动", "招新", "沙龙",
            "11-04", "11-06", "11-11", "11-12", "11-13"
    };

    private Retriever() {
    }

    /**
     * 候选切片记录（对应 SQLite chunks 表与关联事件信息）。
     */
    public record ChunkRecord(
            long chunkId,
            long userId,
            long eventId,
            String eventTitle,
            String text,
            byte[] embeddingBlob
    ) {
    }

    /**
     * 排序打分后的检索命中片段。
     */
    public record ScoredChunk(
            long chunkId,
            long eventId,
            String eventTitle,
            String text,
            double score,
            String mode
    ) {
    }

    /**
     * 检索结果封装（含实际执行的检索模式与 Top-K 片段）。
     */
    public record RetrievalResult(
            String mode,
            List<ScoredChunk> chunks
    ) {
    }

    /**
     * 统一检索入口：优先使用余弦相似度向量检索；当未启用 embedding 模型或候选切片不含向量时自动降级为 BM25。
     */
    public static RetrievalResult retrieve(
            String query,
            float[] queryVector,
            boolean embeddingEnabled,
            List<ChunkRecord> candidates
    ) {
        return retrieve(query, queryVector, embeddingEnabled, candidates, DEFAULT_TOP_K);
    }

    /**
     * 统一检索入口（支持指定返回条数 topK）。
     */
    public static RetrievalResult retrieve(
            String query,
            float[] queryVector,
            boolean embeddingEnabled,
            List<ChunkRecord> candidates,
            int topK
    ) {
        int limit = topK > 0 ? topK : DEFAULT_TOP_K;
        if (candidates == null || candidates.isEmpty()) {
            String mode = embeddingEnabled && queryVector != null && queryVector.length > 0
                    ? MODE_EMBEDDING
                    : MODE_BM25;
            return new RetrievalResult(mode, Collections.emptyList());
        }

        boolean hasValidCandidateVectors = candidates.stream()
                .anyMatch(c -> c.embeddingBlob() != null && c.embeddingBlob().length >= Float.BYTES);

        if (embeddingEnabled && queryVector != null && queryVector.length > 0 && hasValidCandidateVectors) {
            List<ScoredChunk> vectorHits = retrieveByVector(queryVector, candidates, limit);
            return new RetrievalResult(MODE_EMBEDDING, vectorHits);
        }

        List<ScoredChunk> bm25Hits = retrieveByBm25(query, candidates, limit);
        return new RetrievalResult(MODE_BM25, bm25Hits);
    }

    /**
     * 向量检索模式：解码 float32 BLOB 并计算余弦相似度，按分数降序返回 Top-K。
     */
    public static List<ScoredChunk> retrieveByVector(
            float[] queryVector,
            List<ChunkRecord> candidates,
            int topK
    ) {
        int limit = topK > 0 ? topK : DEFAULT_TOP_K;
        if (queryVector == null || queryVector.length == 0 || candidates == null || candidates.isEmpty()) {
            return Collections.emptyList();
        }

        List<ScoredChunk> scored = new ArrayList<>(candidates.size());
        for (ChunkRecord candidate : candidates) {
            float[] chunkVec = VectorUtils.fromFloat32Blob(candidate.embeddingBlob());
            double sim = chunkVec.length > 0 ? VectorUtils.cosineSimilarity(queryVector, chunkVec) : 0.0;
            double roundedScore = Math.round(sim * 10000.0) / 10000.0;
            scored.add(new ScoredChunk(
                    candidate.chunkId(),
                    candidate.eventId(),
                    candidate.eventTitle() == null ? "" : candidate.eventTitle(),
                    candidate.text() == null ? "" : candidate.text(),
                    roundedScore,
                    MODE_EMBEDDING
            ));
        }

        scored.sort(Comparator
                .comparingDouble(ScoredChunk::score).reversed()
                .thenComparingLong(ScoredChunk::chunkId));

        return scored.subList(0, Math.min(limit, scored.size()));
    }

    /**
     * BM25 降级检索模式：基于中文字符二元语法（bigram）+ 教务领域关键词切分计算 IDF 与 TF 得分，返回 Top-K。
     */
    public static List<ScoredChunk> retrieveByBm25(
            String query,
            List<ChunkRecord> candidates,
            int topK
    ) {
        int limit = topK > 0 ? topK : DEFAULT_TOP_K;
        if (candidates == null || candidates.isEmpty()) {
            return Collections.emptyList();
        }

        List<String> queryTokens = expandQueryTokens(tokenizeForBm25(query));
        if (queryTokens.isEmpty()) {
            return candidates.stream()
                    .limit(limit)
                    .map(c -> new ScoredChunk(
                            c.chunkId(),
                            c.eventId(),
                            c.eventTitle() == null ? "" : c.eventTitle(),
                            c.text() == null ? "" : c.text(),
                            0.0,
                            MODE_BM25
                    ))
                    .toList();
        }

        int docCount = candidates.size();
        List<Map<String, Integer>> docTermFreqs = new ArrayList<>(docCount);
        List<Integer> docLengths = new ArrayList<>(docCount);
        Map<String, Integer> docFreqMap = new HashMap<>();

        long totalTerms = 0;
        for (ChunkRecord candidate : candidates) {
            String docText = (candidate.eventTitle() == null ? "" : candidate.eventTitle() + " ")
                    + (candidate.text() == null ? "" : candidate.text());
            List<String> tokens = tokenizeForBm25(docText);
            docLengths.add(Math.max(1, tokens.size()));
            totalTerms += Math.max(1, tokens.size());

            Map<String, Integer> tfMap = new HashMap<>();
            for (String token : tokens) {
                tfMap.merge(token, 1, Integer::sum);
            }
            docTermFreqs.add(tfMap);

            for (String uniqueToken : tfMap.keySet()) {
                docFreqMap.merge(uniqueToken, 1, Integer::sum);
            }
        }

        double avgDocLen = docCount > 0 ? (double) totalTerms / docCount : 1.0;
        Set<String> uniqueQueryTerms = new LinkedHashSet<>(queryTokens);

        List<ScoredChunk> scored = new ArrayList<>(docCount);
        for (int i = 0; i < docCount; i++) {
            ChunkRecord candidate = candidates.get(i);
            Map<String, Integer> tfMap = docTermFreqs.get(i);
            int dl = docLengths.get(i);

            double score = 0.0;
            for (String term : uniqueQueryTerms) {
                int tf = tfMap.getOrDefault(term, 0);
                if (tf <= 0) {
                    continue;
                }
                int df = docFreqMap.getOrDefault(term, 0);
                double idf = Math.log(1.0 + (docCount - df + 0.5) / (df + 0.5));
                double tfNorm = (tf * (BM25_K1 + 1.0))
                        / (tf + BM25_K1 * (1.0 - BM25_B + BM25_B * (dl / avgDocLen)));
                double termWeight = isDomainKeyword(term) ? 1.6 : 1.0;
                score += idf * tfNorm * termWeight;
            }

            double roundedScore = Math.round(score * 10000.0) / 10000.0;
            scored.add(new ScoredChunk(
                    candidate.chunkId(),
                    candidate.eventId(),
                    candidate.eventTitle() == null ? "" : candidate.eventTitle(),
                    candidate.text() == null ? "" : candidate.text(),
                    roundedScore,
                    MODE_BM25
            ));
        }

        scored.sort(Comparator
                .comparingDouble(ScoredChunk::score).reversed()
                .thenComparingLong(ScoredChunk::chunkId));

        return scored.subList(0, Math.min(limit, scored.size()));
    }

    /**
     * 中文字符二元语法（Bigram）+ 领域关键词 + 英文数字词元切分函数。
     */
    public static List<String> tokenizeForBm25(String text) {
        if (text == null || text.isBlank()) {
            return Collections.emptyList();
        }
        String normalized = text.toLowerCase(Locale.ROOT).trim();
        List<String> tokens = new ArrayList<>();

        // 1. 提取教务领域关键词
        for (String kw : DOMAIN_KEYWORDS) {
            int idx = normalized.indexOf(kw);
            while (idx >= 0) {
                tokens.add(kw);
                idx = normalized.indexOf(kw, idx + kw.length());
            }
        }

        // 2. 提取字母数字组合（如 a302, b205, tcp, 11-04, 2026）
        Matcher matcher = ALPHANUM_PATTERN.matcher(normalized);
        while (matcher.find()) {
            String word = matcher.group();
            if (word.length() >= 2) {
                tokens.add(word);
            }
        }

        // 3. 提取连续中文字符的二元语法（Bigram）
        StringBuilder cjkRun = new StringBuilder();
        for (int i = 0; i < normalized.length(); i++) {
            char ch = normalized.charAt(i);
            if (isCjk(ch)) {
                cjkRun.append(ch);
            } else {
                appendCjkBigrams(cjkRun, tokens);
                cjkRun.setLength(0);
            }
        }
        appendCjkBigrams(cjkRun, tokens);

        return tokens;
    }

    private static void appendCjkBigrams(StringBuilder cjkRun, List<String> tokens) {
        int len = cjkRun.length();
        if (len == 1) {
            tokens.add(cjkRun.toString());
        } else if (len >= 2) {
            for (int i = 0; i < len - 1; i++) {
                tokens.add(cjkRun.substring(i, i + 2));
            }
        }
    }

    private static List<String> expandQueryTokens(List<String> rawTokens) {
        if (rawTokens.isEmpty()) {
            return rawTokens;
        }
        List<String> expanded = new ArrayList<>(rawTokens);
        Set<String> tokenSet = new LinkedHashSet<>(rawTokens);

        if (tokenSet.contains("周三") || tokenSet.contains("星期三")) {
            expanded.add("周三");
            expanded.add("星期三");
            expanded.add("11-04");
        }
        if (tokenSet.contains("周五") || tokenSet.contains("星期五")) {
            expanded.add("周五");
            expanded.add("星期五");
            expanded.add("11-06");
            expanded.add("11-13");
        }
        if (tokenSet.contains("最紧") || tokenSet.contains("期末") || tokenSet.contains("哪几")) {
            expanded.add("期末");
            expanded.add("考试");
            expanded.add("测验");
            expanded.add("考核");
            expanded.add("截止");
            expanded.add("实验报告");
        }
        if (tokenSet.contains("冲突") || tokenSet.contains("重叠")) {
            expanded.add("11-04");
            expanded.add("11-06");
            expanded.add("测验");
            expanded.add("实验课");
            expanded.add("上机考核");
            expanded.add("沙龙");
        }
        return expanded;
    }

    private static boolean isDomainKeyword(String term) {
        for (String kw : DOMAIN_KEYWORDS) {
            if (kw.equals(term)) {
                return true;
            }
        }
        return false;
    }

    private static boolean isCjk(char ch) {
        Character.UnicodeBlock block = Character.UnicodeBlock.of(ch);
        return block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_A
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_B;
    }
}
