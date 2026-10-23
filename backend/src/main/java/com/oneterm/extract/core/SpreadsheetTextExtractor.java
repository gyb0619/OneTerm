package com.oneterm.extract.core;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * 纯函数文件文本提取工具（无 Spring 依赖）：
 * 支持 UTF-8 .txt 与 Apache POI XSSFWorkbook .xlsx 表格结构化文本拼接。
 */
public final class SpreadsheetTextExtractor {

    private SpreadsheetTextExtractor() {
    }

    /**
     * 读取 UTF-8 纯文本字节流。
     */
    public static String extractTxt(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new IllegalArgumentException("上传的文本文件内容为空");
        }
        String text = new String(bytes, StandardCharsets.UTF_8);
        // 去除 UTF-8 BOM（如果存在）
        if (text.startsWith("\uFEFF")) {
            text = text.substring(1);
        }
        String trimmed = text.trim();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("上传的文本文件内容为空");
        }
        return trimmed;
    }

    /**
     * 使用 Apache POI XSSFWorkbook 读取 .xlsx 所有工作表非空单元格并拼接为结构化文本。
     */
    public static String extractXlsx(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new IllegalArgumentException("上传的 Excel 文件内容为空");
        }
        DataFormatter formatter = new DataFormatter();
        StringBuilder sb = new StringBuilder();

        try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            int sheetCount = workbook.getNumberOfSheets();
            for (int s = 0; s < sheetCount; s++) {
                Sheet sheet = workbook.getSheetAt(s);
                if (sheet == null) {
                    continue;
                }
                List<String> sheetLines = new ArrayList<>();
                for (Row row : sheet) {
                    if (row == null) {
                        continue;
                    }
                    List<String> cellValues = new ArrayList<>();
                    short lastCellNum = row.getLastCellNum();
                    for (int c = 0; c < lastCellNum; c++) {
                        Cell cell = row.getCell(c, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                        if (cell != null) {
                            String val = formatter.formatCellValue(cell);
                            if (val != null && !val.isBlank()) {
                                cellValues.add(val.trim());
                            }
                        }
                    }
                    if (!cellValues.isEmpty()) {
                        sheetLines.add(String.join(" | ", cellValues));
                    }
                }
                if (!sheetLines.isEmpty()) {
                    if (sb.length() > 0) {
                        sb.append("\n\n");
                    }
                    String sheetName = sheet.getSheetName();
                    if (sheetName != null && !sheetName.isBlank()) {
                        sb.append("【工作表：").append(sheetName.trim()).append("】\n");
                    }
                    sb.append(String.join("\n", sheetLines));
                }
            }
        } catch (IOException | RuntimeException e) {
            throw new IllegalArgumentException("解析 .xlsx 文件失败，请确认文件格式有效: " + e.getMessage(), e);
        }

        String result = sb.toString().trim();
        if (result.isEmpty()) {
            throw new IllegalArgumentException("Excel 文件中未包含任何非空单元格内容");
        }
        return result;
    }
}
