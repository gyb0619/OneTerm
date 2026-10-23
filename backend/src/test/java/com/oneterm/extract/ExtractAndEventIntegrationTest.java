package com.oneterm.extract;

import com.oneterm.common.BusinessException;
import com.oneterm.common.CurrentUser;
import com.oneterm.common.ErrorCode;
import com.oneterm.common.VectorUtils;
import com.oneterm.extract.controller.EventController;
import com.oneterm.extract.controller.ExtractController;
import com.oneterm.extract.core.EventJsonParser;
import com.oneterm.extract.dto.BatchEventRequest;
import com.oneterm.extract.dto.EventDto;
import com.oneterm.extract.dto.EventInputDto;
import com.oneterm.extract.dto.FileExtractResponse;
import com.oneterm.llm.MockLlmGateway;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 文件解析（txt / xlsx / 图片）、事件批量入库与 chunks 向量同步、以及 user_id 租户隔离越权返回 404 集成测试。
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-extract.db")
class ExtractAndEventIntegrationTest {

    private static final long USER_A_ID = 1001L;
    private static final long USER_B_ID = 1002L;

    @Autowired
    private ExtractController extractController;

    @Autowired
    private EventController eventController;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM chunks WHERE user_id IN (?, ?)", USER_A_ID, USER_B_ID);
        jdbcTemplate.update("DELETE FROM events WHERE user_id IN (?, ?)", USER_A_ID, USER_B_ID);
        authenticateAs(USER_A_ID, "student_a");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void authenticateAs(long userId, String username) {
        CurrentUser principal = new CurrentUser(userId, username, "USER", 100000);
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                principal,
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @Test
    void shouldParseTxtXlsxAndImageFiles() throws Exception {
        // 1. 测试 .txt UTF-8 解析
        String sampleTxt = "1. 《算法设计与分析》 2026-11-04 08:00-09:40 教学楼 A302";
        MockMultipartFile txtFile = new MockMultipartFile(
                "file",
                "schedule.txt",
                "text/plain",
                sampleTxt.getBytes(StandardCharsets.UTF_8)
        );
        ResponseEntity<FileExtractResponse> txtResp = extractController.extractFile(txtFile);
        assertEquals(HttpStatus.OK, txtResp.getStatusCode());
        assertNotNull(txtResp.getBody());
        assertEquals("txt", txtResp.getBody().sourceType());
        assertEquals(sampleTxt, txtResp.getBody().extractedText());

        // 2. 测试 .xlsx 内存生成字节流并通过 Apache POI XSSFWorkbook 解析
        byte[] xlsxBytes;
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("秋季课表");
            Row header = sheet.createRow(0);
            header.createCell(0).setCellValue("课程名称");
            header.createCell(1).setCellValue("上课时间");
            header.createCell(2).setCellValue("上课地点");

            Row row1 = sheet.createRow(1);
            row1.createCell(0).setCellValue("《计算机网络》实验课");
            row1.createCell(1).setCellValue("2026-11-04 14:00 至 2026-11-04 16:00");
            row1.createCell(2).setCellValue("实验楼 B205");
            wb.write(bos);
            xlsxBytes = bos.toByteArray();
        }
        MockMultipartFile xlsxFile = new MockMultipartFile(
                "file",
                "courses.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                xlsxBytes
        );
        ResponseEntity<FileExtractResponse> xlsxResp = extractController.extractFile(xlsxFile);
        assertEquals(HttpStatus.OK, xlsxResp.getStatusCode());
        assertNotNull(xlsxResp.getBody());
        assertEquals("xlsx", xlsxResp.getBody().sourceType());
        assertTrue(xlsxResp.getBody().extractedText().contains("秋季课表"));
        assertTrue(xlsxResp.getBody().extractedText().contains("《计算机网络》实验课"));
        assertTrue(xlsxResp.getBody().extractedText().contains("实验楼 B205"));

        // 3. 测试图片文件调用 Mock 识图模型转为文字
        MockMultipartFile imageFile = new MockMultipartFile(
                "file",
                "timetable.png",
                "image/png",
                new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47}
        );
        ResponseEntity<FileExtractResponse> imgResp = extractController.extractFile(imageFile);
        assertEquals(HttpStatus.OK, imgResp.getStatusCode());
        assertNotNull(imgResp.getBody());
        assertEquals("image", imgResp.getBody().sourceType());
        assertTrue(imgResp.getBody().extractedText().contains("算法设计与分析"));
    }

    @Test
    void shouldBatchImport9SampleEventsSyncChunksAndEnforceUserIsolationWith404() {
        // 1. 用户 A 批量入库示例数据的全部 9 条事件
        List<EventInputDto> sampleDrafts = EventJsonParser.parse(MockLlmGateway.loadExpectedEventsJson());
        assertEquals(9, sampleDrafts.size());

        ResponseEntity<List<EventDto>> batchResp = eventController.batchCreateEvents(new BatchEventRequest(sampleDrafts));
        assertEquals(HttpStatus.CREATED, batchResp.getStatusCode());
        List<EventDto> savedEvents = batchResp.getBody();
        assertNotNull(savedEvents);
        assertEquals(9, savedEvents.size());

        // 校验 chunks 表同步写入了 9 条记录且包含非空 float32 BLOB 向量
        Integer chunkCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM chunks WHERE user_id = ?",
                Integer.class,
                USER_A_ID
        );
        assertEquals(9, chunkCount, "批量入库 9 条事件应同步生成 9 条 RAG chunks");

        byte[] sampleBlob = jdbcTemplate.queryForObject(
                "SELECT embedding FROM chunks WHERE user_id = ? AND event_id = ?",
                byte[].class,
                USER_A_ID,
                savedEvents.get(0).id()
        );
        assertNotNull(sampleBlob, "chunks 表中的 embedding BLOB 不应为空");
        float[] vector = VectorUtils.fromFloat32Blob(sampleBlob);
        assertTrue(vector.length > 0, "反序列化出的 float32 向量维度应大于 0");

        // 2. 用户 A 按类型过滤查询 exam 事件（共 3 场考试）
        ResponseEntity<List<EventDto>> examListResp = eventController.listEvents("exam", null, null);
        assertNotNull(examListResp.getBody());
        assertEquals(3, examListResp.getBody().size());

        // 3. 切换到用户 B：验证无法读取、修改或删除用户 A 的任何事件（越权访问返回 404 NOT_FOUND）
        authenticateAs(USER_B_ID, "student_b");

        ResponseEntity<List<EventDto>> userBEvents = eventController.listEvents(null, null, null);
        assertNotNull(userBEvents.getBody());
        assertTrue(userBEvents.getBody().isEmpty(), "用户 B 不应看到用户 A 的任何事件");

        long userAFirstEventId = savedEvents.get(0).id();
        EventInputDtotamperAttempt:
        {
            EventInputDto tamperDto = new EventInputDto(
                    "course",
                    "越权篡改标题",
                    "2026-11-04T08:00:00+08:00",
                    "2026-11-04T09:40:00+08:00",
                    "A302",
                    "算法",
                    "篡改原文"
            );
            BusinessException updateEx = assertThrows(
                    BusinessException.class,
                    () -> eventController.updateEvent(userAFirstEventId, tamperDto)
            );
            assertEquals(ErrorCode.NOT_FOUND, updateEx.getErrorCode());
            assertEquals(HttpStatus.NOT_FOUND, updateEx.getErrorCode().getStatus());
        }

        BusinessException deleteEx = assertThrows(
                BusinessException.class,
                () -> eventController.deleteEvent(userAFirstEventId)
        );
        assertEquals(ErrorCode.NOT_FOUND, deleteEx.getErrorCode());
        assertEquals(HttpStatus.NOT_FOUND, deleteEx.getErrorCode().getStatus());

        // 4. 切换回用户 A：验证正常编辑与删除自己的事件并同步维护 chunks
        authenticateAs(USER_A_ID, "student_a");
        EventInputDto updatedInput = new EventInputDto(
                "course",
                "《算法设计与分析》调整教室",
                "2026-11-04T08:00:00+08:00",
                "2026-11-04T09:40:00+08:00",
                "教学楼 B108",
                "算法设计与分析",
                "原定 A302 教室调整至教学楼 B108"
        );
        ResponseEntity<EventDto> updateResp = eventController.updateEvent(userAFirstEventId, updatedInput);
        assertEquals(HttpStatus.OK, updateResp.getStatusCode());
        assertEquals("教学楼 B108", updateResp.getBody().location());

        eventController.deleteEvent(userAFirstEventId);
        Integer remainingChunksForDeleted = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM chunks WHERE user_id = ? AND event_id = ?",
                Integer.class,
                USER_A_ID,
                userAFirstEventId
        );
        assertEquals(0, remainingChunksForDeleted, "删除事件后应同步清理关联的 chunks 记录");
    }
}
