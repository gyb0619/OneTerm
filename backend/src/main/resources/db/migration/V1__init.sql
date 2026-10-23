-- V1__init.sql
-- 一学期 OneTerm 初始数据库表结构（严格对应 PRD 第 7 节数据模型）

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'USER',
    enabled INTEGER NOT NULL DEFAULT 1,
    daily_token_limit INTEGER NOT NULL DEFAULT 100000,
    failed_count INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    preferred_model_id INTEGER
);

CREATE TABLE IF NOT EXISTS llm_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    course_name TEXT NOT NULL DEFAULT '',
    source_text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    embedding BLOB,
    event_id INTEGER
);

CREATE TABLE IF NOT EXISTS review_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    event_id INTEGER,
    topic TEXT NOT NULL,
    planned_date TEXT,
    done INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS visualizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    topic_id INTEGER NOT NULL,
    html TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- 索引：保障按 user_id 租户隔离过滤与高频范围查询性能
CREATE INDEX IF NOT EXISTS idx_usage_log_user_created ON usage_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_user_time ON events(user_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_chunks_user_event ON chunks(user_id, event_id);
CREATE INDEX IF NOT EXISTS idx_review_topics_user_event ON review_topics(user_id, event_id);
CREATE INDEX IF NOT EXISTS idx_visualizations_user_topic ON visualizations(user_id, topic_id);
