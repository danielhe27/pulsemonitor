import Database from "better-sqlite3";

export const db = new Database("data.sqlite");

// Create tables if they do not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS endpoints (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint_id INTEGER NOT NULL,
    ok INTEGER NOT NULL,
    status INTEGER,
    ms INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
  );
`);