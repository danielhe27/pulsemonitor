// server/routes/pi.js
import express from "express";

const router = express.Router();

// In-memory store (works without Pi connected, resets on server restart)
let latestByPi = {};   // { [piId]: latestPayload }
let historyByPi = {};  // { [piId]: [payload, ...] }

function pushHistory(piId, payload, limit = 300) {
  if (!historyByPi[piId]) historyByPi[piId] = [];
  historyByPi[piId].unshift(payload);
  if (historyByPi[piId].length > limit) historyByPi[piId].length = limit;
}

function num(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

// Health
router.get("/pi/health", (req, res) => res.json({ ok: true }));

// Pi posts metrics here
router.post("/pi/ingest", (req, res) => {
  const body = req.body || {};

  // Accept both styles: piId or pi_id
  const piId = body.piId || body.pi_id;
  if (!piId) return res.status(400).json({ error: "piId required" });

  // Accept both naming styles for temperature
  const cpuTemp =
    body.cpu_temp_c !== undefined ? body.cpu_temp_c :
    body.temp_c !== undefined ? body.temp_c :
    0;

  // Optional: accept "percent style" payload
  // cpu_pct, mem_pct, disk_pct are fine for a dashboard even if totals unknown.
  const row = {
    piId: String(piId),

    hostname: body.hostname || null,
    ip: body.ip || null,

    // detailed metrics (if you send them)
    cpu_temp_c: num(cpuTemp),
    cpu_load_1: num(body.cpu_load_1),
    cpu_load_5: num(body.cpu_load_5),
    cpu_load_15: num(body.cpu_load_15),

    mem_used_mb: num(body.mem_used_mb),
    mem_total_mb: num(body.mem_total_mb),

    disk_used_gb: num(body.disk_used_gb),
    disk_total_gb: num(body.disk_total_gb),

    uptime_s: num(body.uptime_s),

    // percent-style shortcut fields (if you send them)
    cpu_pct: body.cpu_pct !== undefined ? num(body.cpu_pct) : null,
    mem_pct: body.mem_pct !== undefined ? num(body.mem_pct) : null,
    disk_pct: body.disk_pct !== undefined ? num(body.disk_pct) : null,

    created_at: body.created_at || new Date().toISOString()
  };

  latestByPi[row.piId] = row;
  pushHistory(row.piId, row);

  res.json({ ok: true });
});

// Frontend reads this list
router.get("/pi", (req, res) => {
  const list = Object.values(latestByPi).sort((a, b) =>
    String(a.piId).localeCompare(String(b.piId))
  );
  res.json(list);
});

// Frontend reads history for one Pi
router.get("/pi/:piId/history", (req, res) => {
  const { piId } = req.params;
  res.json(historyByPi[piId] || []);
});

export default router;