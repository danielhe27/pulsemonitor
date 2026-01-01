// server/pi/pi.schema.js
export function ensurePiTables(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS pi_devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS pi_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pi_id TEXT NOT NULL,
      ts TEXT DEFAULT (datetime('now')),
      cpu_temp_c REAL,
      cpu_usage REAL,
      load1 REAL,
      load5 REAL,
      load15 REAL,
      mem_total_mb INTEGER,
      mem_used_mb INTEGER,
      disk_total_gb REAL,
      disk_used_gb REAL,
      uptime_s INTEGER,
      ip TEXT,
      rx_kbps REAL,
      tx_kbps REAL,
      FOREIGN KEY (pi_id) REFERENCES pi_devices(id)
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_pi_metrics_pi_ts ON pi_metrics(pi_id, ts DESC)`).run();
}