import express from "express";
import cors from "cors";
import { db } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

async function checkUrl(url) {
  const start = Date.now();
  try {
    const res = await fetch(url);
    const ms = Date.now() - start;
    return { ok: res.ok, status: res.status, ms };
  } catch (err) {
    const ms = Date.now() - start;
    return { ok: false, status: null, ms };
  }
}

app.get("/", (req, res) => {
  res.send("PulseMonitor API running");
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/endpoints", (req, res) => {
  const rows = db
    .prepare("SELECT id, name, method, url, created_at FROM endpoints ORDER BY created_at DESC")
    .all();
  res.json(rows);
});

app.post("/api/endpoints", (req, res) => {
  const { name, method, url } = req.body;

  if (!name || !method || !url) {
    return res.status(400).json({ error: "name, method, url required" });
  }

  const created = {
    id: Date.now(),
    name: String(name).trim(),
    method: String(method).trim().toUpperCase(),
    url: String(url).trim()
  };

  db.prepare("INSERT INTO endpoints (id, name, method, url) VALUES (?, ?, ?, ?)")
    .run(created.id, created.name, created.method, created.url);

  res.status(201).json(created);
});

app.delete("/api/endpoints/:id", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("DELETE FROM endpoints WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.post("/api/check/:id", async (req, res) => {
  const id = Number(req.params.id);

  const endpoint = db
    .prepare("SELECT id, name, method, url FROM endpoints WHERE id = ?")
    .get(id);

  if (!endpoint) {
    return res.status(404).json({ error: "Endpoint not found" });
  }

  const result = await checkUrl(endpoint.url);

  db.prepare("INSERT INTO checks (endpoint_id, ok, status, ms) VALUES (?, ?, ?, ?)")
    .run(endpoint.id, result.ok ? 1 : 0, result.status, result.ms);

  res.json({ endpointId: endpoint.id, ...result });
});

app.get("/api/checks/:id", (req, res) => {
  const id = Number(req.params.id);

  const rows = db
    .prepare(
      "SELECT ok, status, ms, created_at FROM checks WHERE endpoint_id = ? ORDER BY created_at DESC LIMIT 50"
    )
    .all(id);

  res.json(rows);
});

const PORT = process.env.PORT || 5050;

const AUTO_CHECK_MS = Number(process.env.AUTO_CHECK_MS || 2_000);

async function runAutoChecks() {
  try {
    // Read all endpoints from DB
    const endpoints = db
      .prepare("SELECT id, url FROM endpoints ORDER BY created_at DESC")
      .all();

    if (!endpoints || endpoints.length === 0) return;

    for (const e of endpoints) {
      const result = await checkUrl(e.url);

      // Save into checks table
      db.prepare(
        `INSERT INTO checks (endpoint_id, ok, status, ms)
         VALUES (?, ?, ?, ?)`
      ).run(
        e.id,
        result.ok ? 1 : 0,
        result.status,
        result.ms
      );
    }

    console.log(`[auto-check] ran ${endpoints.length} checks`);
  } catch (err) {
    console.error("[auto-check] error:", err);
  }
}

setInterval(runAutoChecks, AUTO_CHECK_MS);
runAutoChecks(); // run once on startup

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});