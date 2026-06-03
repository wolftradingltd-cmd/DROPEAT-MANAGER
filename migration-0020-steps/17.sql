CREATE TABLE IF NOT EXISTS tranches_recalcul_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  before_snapshot TEXT,
  after_snapshot TEXT,
  executed_by INTEGER,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);