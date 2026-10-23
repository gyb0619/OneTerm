package com.oneterm.qa;

import com.oneterm.common.VectorUtils;
import com.oneterm.llm.MockLlmGateway;
import com.oneterm.qa.core.Retriever;
import com.oneterm.qa.core.Retriever.ChunkRecord;
import com.oneterm.qa.core.Retriever.RetrievalResult;
import com.oneterm.qa.core.Retriever.ScoredChunk;
import com.oneterm.qa.core.TextChunker;
import com.oneterm.qa.core.TextChunker.EventSource;
import com.oneterm.qa.core.TextChunker.TextChunk;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 纯算法单元测试：覆盖 TextChunker 原文按段切片、float32 BLOB 向量余弦相似度 Top-4 排序及 BM25 自动降级检索。
 */
class QaCoreTest {

    private final MockLlmGateway mockLlmGateway = new MockLlmGateway();

    @Test
    void shouldChunkEventWithRichMetadataAndSplitMultiParagraphText() {
        String multiParaText = "第一段：本周讲授冒泡排序与快速排序的平均与最坏时间复杂度证明，请提前预习教材第三章。\n\n"
                + "第二段：课后需完成分治策略课后习题 3.1 至 3.5，并于下周实验课前提交纸质解答。";

        EventSource event = new EventSource(
                101L,
                "course",
                "《算法设计与分析》课程",
                "2026-11-04T08:00:00+08:00",
                "2026-11-04T09:40:00+08:00",
                "教学楼 A302",
                "算法设计与分析",
                multiParaText
        );

        List<TextChunk> chunks = TextChunker.chunkEvent(event, 120);
        assertEquals(2, chunks.size());

        TextChunk first = chunks.get(0);
        assertEquals(101L, first.eventId());
        assertEquals("《算法设计与分析》课程", first.eventTitle());
        assertEquals(0, first.chunkIndex());
        assertTrue(first.text().contains("周三/星期三"), "切片元信息应自动解析并附带中文星期标签");
        assertTrue(first.text().contains("教学楼 A302"));
        assertTrue(first.text().contains("第一段：本周讲授冒泡排序"));

        TextChunk second = chunks.get(1);
        assertEquals(1, second.chunkIndex());
        assertTrue(second.text().contains("第二段：课后需完成分治策略"));
    }

    @Test
    void shouldSerializeFloat32BlobAndRankTop4ByCosineSimilarity() {
        List<EventSource> sampleEvents = buildSampleEvents();
        List<TextChunk> chunks = TextChunker.chunkEvents(sampleEvents);
        assertEquals(9, chunks.size());

        List<ChunkRecord> records = new ArrayList<>();
        long chunkId = 1L;
        for (TextChunk chunk : chunks) {
            float[] vec = mockLlmGateway.embed(1L, chunk.text());
            byte[] blob = VectorUtils.toFloat32Blob(vec);
            assertNotNull(blob);
            assertEquals(vec.length * Float.BYTES, blob.length);

            float[] decoded = VectorUtils.fromFloat32Blob(blob);
            assertArrayEquals(vec, decoded, 1e-6f);

            records.add(new ChunkRecord(chunkId++, 1L, chunk.eventId(), chunk.eventTitle(), chunk.text(), blob));
        }

        // 1. 提问「下周三有空吗」—— 应检索出 Top-4，且包含 2026-11-04（周三）的课程与随堂测验
        String q1 = "下周三有空吗？";
        float[] q1Vec = mockLlmGateway.embed(1L, q1);
        RetrievalResult res1 = Retriever.retrieve(q1, q1Vec, true, records, 4);

        assertEquals(Retriever.MODE_EMBEDDING, res1.mode());
        assertEquals(4, res1.chunks().size());
        assertTrue(res1.chunks().get(0).score() >= res1.chunks().get(1).score());
        assertTrue(res1.chunks().get(1).score() >= res1.chunks().get(2).score());
        assertTrue(res1.chunks().get(2).score() >= res1.chunks().get(3).score());
        assertTrue(res1.chunks().stream().anyMatch(c -> c.text().contains("2026-11-04")),
                "检索结果应包含周三（2026-11-04）的日程片段");

        // 2. 提问「期末前哪几门最紧」—— 应优先命中期末考试、期中测验或实验报告截止
        String q2 = "期末前哪几门最紧？";
        float[] q2Vec = mockLlmGateway.embed(1L, q2);
        RetrievalResult res2 = Retriever.retrieve(q2, q2Vec, true, records, 4);

        assertEquals(Retriever.MODE_EMBEDDING, res2.mode());
        assertEquals(4, res2.chunks().size());
        assertTrue(res2.chunks().stream().anyMatch(c ->
                c.eventTitle().contains("考试") || c.eventTitle().contains("测验") || c.eventTitle().contains("截止")),
                "检索结果应包含考试或截止提醒事件");
    }

    @Test
    void shouldFallbackToBm25WhenEmbeddingDisabledOrMissingBlob() {
        List<EventSource> sampleEvents = buildSampleEvents();
        List<TextChunk> chunks = TextChunker.chunkEvents(sampleEvents);

        List<ChunkRecord> recordsWithoutBlob = new ArrayList<>();
        long chunkId = 1L;
        for (TextChunk chunk : chunks) {
            recordsWithoutBlob.add(new ChunkRecord(
                    chunkId++,
                    1L,
                    chunk.eventId(),
                    chunk.eventTitle(),
                    chunk.text(),
                    null
            ));
        }

        // 当 embeddingEnabled = false 时，自动降级为 BM25
        RetrievalResult wedResult = Retriever.retrieve("下周三有空吗？", null, false, recordsWithoutBlob, 4);
        assertEquals(Retriever.MODE_BM25, wedResult.mode());
        assertEquals(4, wedResult.chunks().size());
        for (ScoredChunk hit : wedResult.chunks()) {
            assertTrue(hit.score() > 0.0, "BM25 命中片段分值应大于 0");
            assertTrue(hit.text().contains("2026-11-04") || hit.text().contains("周三"),
                    "BM25 检索『下周三有空吗』应命中周三事件");
        }

        // 提问「期末前哪几门最紧」在 BM25 模式下同样能命中考试与截止任务
        RetrievalResult tightResult = Retriever.retrieve("期末前哪几门最紧？", null, false, recordsWithoutBlob, 4);
        assertEquals(Retriever.MODE_BM25, tightResult.mode());
        assertEquals(4, tightResult.chunks().size());
        assertTrue(tightResult.chunks().get(0).score() >= tightResult.chunks().get(1).score());
        assertTrue(tightResult.chunks().stream().anyMatch(c ->
                c.eventTitle().contains("期末考试") || c.eventTitle().contains("截止") || c.eventTitle().contains("测验")));
    }

    private List<EventSource> buildSampleEvents() {
        return List.of(
                new EventSource(1L, "course", "《算法设计与分析》课程",
                        "2026-11-04T08:00:00+08:00", "2026-11-04T09:40:00+08:00",
                        "教学楼 A302", "算法设计与分析",
                        "1. 课程名称：《算法设计与分析》 上课时间：2026-11-04 08:00 至 09:40 上课地点：教学楼 A302 备注：本周讲授冒泡排序、快速排序复杂度分析与分治策略。"),
                new EventSource(2L, "course", "《操作系统》课程",
                        "2026-11-04T09:40:00+08:00", "2026-11-04T11:20:00+08:00",
                        "教学楼 A302", "操作系统",
                        "2. 课程名称：《操作系统》 上课时间：2026-11-04 09:40 至 11:20 上课地点：教学楼 A302 备注：紧接算法课之后上课，讲授进程同步与死锁避免。"),
                new EventSource(3L, "course", "《计算机网络》实验课",
                        "2026-11-04T14:00:00+08:00", "2026-11-04T16:00:00+08:00",
                        "实验楼 B205", "计算机网络",
                        "3. 课程名称：《计算机网络》实验课 上课时间：2026-11-04 14:00 至 16:00 上课地点：实验楼 B205 备注：实验主题为 TCP 三次握手连接建立与报文分析。"),
                new EventSource(4L, "exam", "《算法设计与分析》期中随堂测验",
                        "2026-11-04T15:00:00+08:00", "2026-11-04T17:00:00+08:00",
                        "教学楼 C101", "算法设计与分析",
                        "4. 【教务考试通知】《算法设计与分析》期中随堂测验定于 2026-11-04 15:00 至 17:00 在教学楼 C101 举行，重点考查冒泡排序、归并排序及贪心算法证明。"),
                new EventSource(5L, "exam", "《操作系统》期中上机考核",
                        "2026-11-06T19:00:00+08:00", "2026-11-06T21:00:00+08:00",
                        "信息中心机房 D401", "操作系统",
                        "5. 【机考通知】《操作系统》期中上机考核定于 2026-11-06 19:00 至 21:00 在信息中心机房 D401 进行，主要考查银行家算法与页面置换模拟实现。"),
                new EventSource(6L, "exam", "《计算机网络》期末考试",
                        "2026-11-13T09:00:00+08:00", "2026-11-13T11:00:00+08:00",
                        "第一教学楼 A105", "计算机网络",
                        "6. 【期末统考预告】《计算机网络》课程期末考试将于 2026-11-13 09:00 至 11:00 在第一教学楼 A105 考场进行，核心复习范围包括 TCP 三次握手与四次挥手状态机。"),
                new EventSource(7L, "deadline", "《算法设计与分析》第二次实验报告截止",
                        "2026-11-11T22:00:00+08:00", "2026-11-11T23:59:00+08:00",
                        "课程中心线上提交", "算法设计与分析",
                        "7. 【作业截止提醒】《算法设计与分析》第二次实验报告提交窗口将于 2026-11-11 22:00 至 23:59 截止，请登录课程中心上传 PDF 报告。"),
                new EventSource(8L, "deadline", "《计算机网络》抓包实验分析报告截止",
                        "2026-11-12T20:00:00+08:00", "2026-11-12T22:00:00+08:00",
                        "课程中心线上提交", "计算机网络",
                        "8. 【作业截止提醒】《计算机网络》TCP 三次握手抓包实验分析报告最后提交时段为 2026-11-12 20:00 至 22:00，请务必在期末考试前一天完成提交。"),
                new EventSource(9L, "activity", "ACM 协会秋季招新沙龙暨算法分享会",
                        "2026-11-06T19:00:00+08:00", "2026-11-06T21:00:00+08:00",
                        "学生活动中心 203 室", "",
                        "9. 【ACM协会通知】ACM 程序设计竞赛协会秋季招新沙龙暨算法分享会将于 2026-11-06 19:00 至 21:00 在学生活动中心 203 室举行。")
        );
    }
}
