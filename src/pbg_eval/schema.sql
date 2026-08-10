CREATE TABLE IF NOT EXISTS pipeline_version (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL UNIQUE,
    prompt_hash TEXT NOT NULL,
    model_config TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    notes TEXT
);

CREATE TABLE IF NOT EXISTS run (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id INTEGER NOT NULL REFERENCES pipeline_version(id),
    job_id INTEGER REFERENCES eval_job(id),
    doc_id TEXT NOT NULL,
    backend_doc_id TEXT,
    backend_job_id TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    latency_seconds REAL,
    raw_qwen_output TEXT,
    thinking_trace TEXT,
    master_text TEXT,
    vendor_text TEXT,
    extraction_ok INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    exclusion_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_run_version ON run(version_id);
CREATE INDEX IF NOT EXISTS idx_run_doc ON run(version_id, doc_id);

CREATE TABLE IF NOT EXISTS grade (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL UNIQUE REFERENCES run(id),
    deviation_recall REAL NOT NULL,
    deviation_precision REAL NOT NULL,
    severity_correctness REAL NOT NULL,
    reasoning_quality REAL NOT NULL,
    schema_integrity REAL NOT NULL,
    scope_discipline REAL NOT NULL,
    overall_score REAL NOT NULL,
    independent_read TEXT NOT NULL,
    grader_notes TEXT
);

CREATE TABLE IF NOT EXISTS eval_job (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id INTEGER NOT NULL REFERENCES pipeline_version(id),
    status TEXT NOT NULL DEFAULT 'running',
    total INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    stopped INTEGER NOT NULL DEFAULT 0
);
