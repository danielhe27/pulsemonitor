// server/pi/pi.routes.js
import express from "express";

export function makePiRouter(db) {
  const router = express.Router();

  const PI_INGEST_TOKEN = process.env.PI_INGEST_TOKEN || "";

  function requireToken(req, res, next) {
    if (!PI_INGEST_TOKEN) return next();
    const token = req.headers["x-pi-token"];
    if (!token || token !== PI_INGEST_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  }

  router.get("/devices", (req, res) => {
    const rows = db.prepare(`SELECT id, name, created_at FROM pi_devices ORDER BY created_at DESC`).all();
    res.json(rows);
  });

  router.post("/ingest", requireToken, (req, res) => {
    const {
      piId,
      name,
      cpuTempC,
      cpuUsage,
      load1,
      load5,
      load15,
      memTotalMb,
      memUsedMb,
      diskTotalGb,
      diskUsedGb,
      uptimeS,
      ip,
      rxKbps,
      txKbps
    } = req.body || {};

    if (!piId) return res.status(400).json({ error: "piId required" });

    const deviceName = String(name || "Raspberry Pi").slice(0, 60);

    db.prepare(`
      INSERT INTO pi_devices (id, name)
      VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name
    `).run(String(piId), deviceName);

    db.prepare(`
      INSERT INTO pi_metrics (
        pi_id, cpu_temp_c, cpu_usage, load1, load5, load15,
        mem_total_mb, mem_used_mb, disk_total_gb, disk_used_gb,
        uptime_s, ip, rx_kbps, tx_kbps
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(piId),
      cpuTempC ?? null,
      cpuUsage ?? null,
      load1 ?? null,
      load5 ?? null,
      load15 ?? null,
      memTotalMb ?? null,
      memUsedMb ?? null,
      diskTotalGb ?? null,
      diskUsedGb ?? null,
      uptimeS ?? null,
      ip ?? null,
      rxKbps ?? null,
      txKbps ?? null
    );

    res.json({ ok: true });
  });

  router.get("/latest/:piId", (req, res) => {
    const piId = String(req.params.piId);

    const device = db.prepare(`SELECT id, name, created_at FROM pi_devices WHERE id = ?`).get(piId);
    if (!device) return res.status(404).json({ error: "Pi not found" });

    const row = db.prepare(`
      SELECT *
      FROM pi_metrics
      WHERE pi_id = ?
      ORDER BY ts DESC
      LIMIT 1
    `).get(piId);

    res.json({ device, latest: row || null });
  });

  router.get("/history/:piId", (req, res) => {
    const piId = String(req.params.piId);
    const limit = Math.max(10, Math.min(500, Number(req.query.limit || 200)));

    const rows = db.prepare(`
      SELECT *
      FROM pi_metrics
      WHERE pi_id = ?
      ORDER BY ts DESC
      LIMIT ?
    `).all(piId, limit);

    res.json(rows);
  });

  return router;
}