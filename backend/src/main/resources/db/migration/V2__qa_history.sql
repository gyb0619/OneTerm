-- V2__qa_history.sql
-- 智能问答历史记录持久化表
CREATE TABLE IF NOT EXISTS qa_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    retrieval_mode TEXT NOT NULL DEFAULT 'bm25',
    citations TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_qa_history_user_created ON qa_history(user_id, created_at);
