package com.oneterm;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.TimeZone;

@SpringBootApplication
public class OneTermApplication {

    public static void main(String[] args) {
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Shanghai"));
        ensureSqliteDirectory();
        SpringApplication.run(OneTermApplication.class, args);
    }

    @PostConstruct
    public void initTimeZone() {
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Shanghai"));
        ensureSqliteDirectory();
    }

    public static void ensureSqliteDirectory() {
        String dbPath = System.getenv().getOrDefault("ONETERM_DB_PATH", "./data/oneterm.db");
        try {
            Path path = Paths.get(dbPath).toAbsolutePath().normalize();
            Path parent = path.getParent();
            if (parent != null && !Files.exists(parent)) {
                Files.createDirectories(parent);
            }
        } catch (IOException ignored) {
        }
    }
}
