package com.oneterm;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class OneTermApplicationTests {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void contextLoadsAndMigrationsApplied() {
        List<String> tables = jdbcTemplate.queryForList(
                "SELECT name FROM sqlite_master WHERE type='table'",
                String.class
        );
        assertTrue(tables.contains("users"), "users table should exist");
        assertTrue(tables.contains("llm_config"), "llm_config table should exist");
        assertTrue(tables.contains("usage_log"), "usage_log table should exist");
        assertTrue(tables.contains("events"), "events table should exist");
        assertTrue(tables.contains("chunks"), "chunks table should exist");
        assertTrue(tables.contains("review_topics"), "review_topics table should exist");
        assertTrue(tables.contains("visualizations"), "visualizations table should exist");
    }
}
