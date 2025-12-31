// src/App.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./App.module.css";

const API = ""; // Vite proxy -> /api => http://127.0.0.1:5050

// If your backend auto-check is not inserting rows, turn this ON.
// It will generate new checks by calling POST /api/check/:id automatically.
const AUTO_GENERATE = true;

async function fetchJSON(url, opts = {}) {
  // Prevent browser caches (important for repeated polling)
  const sep = url.includes("?") ? "&" : "?";
  const bust = `${sep}t=${Date.now()}`;

  const res = await fetch(`${url}${bust}`, {
    ...opts,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {})
    }
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = data?.error || `Request failed: ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

function Sparkline({ points = [], width = 140, height = 28, big = false }) {
  const vals = (points || [])
    .map((p) => Number(p?.ms ?? 0))
    .filter((n) => Number.isFinite(n));

  if (vals.length < 2) {
    return (
      <div className={big ? styles.sparklineBig : undefined}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className={styles.sparklineSvg}
        >
          <path
            d={`M 0 ${height - 4} L ${width} ${height - 4}`}
            className={styles.sparklineIdle}
          />
        </svg>
      </div>
    );
  }

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = 2;

  const norm = (v) => {
    if (max === min) return height / 2;
    const t = (v - min) / (max - min);
    return height - pad - t * (height - pad * 2);
  };

  const step = width / (vals.length - 1);

  let d = `M 0 ${norm(vals[0])}`;
  for (let i = 1; i < vals.length; i++) {
    d += ` L ${Math.round(i * step)} ${Math.round(norm(vals[i]))}`;
  }

  return (
    <div className={big ? styles.sparklineBig : undefined}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className={styles.sparklineSvg}
      >
        <path d={d} className={styles.sparklinePath} />
      </svg>
    </div>
  );
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export default function App() {
  const [endpoints, setEndpoints] = useState([]);
  const [name, setName] = useState("");
  const [method, setMethod] = useState("GET");
  const [defaultProtocol, setDefaultProtocol] = useState("https://");
  const [url, setUrl] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [latest, setLatest] = useState({});
  const [history, setHistory] = useState({});
  const [checking, setChecking] = useState({});

  // Telemetry drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEndpointId, setDrawerEndpointId] = useState(null);
  const [drawerWindow, setDrawerWindow] = useState("2m"); // 2m | 10m | 1h
  const [drawerSpeed, setDrawerSpeed] = useState("1s"); // 0.5s | 1s | 2s
  const [drawerPinned, setDrawerPinned] = useState(false);

  const endpointsById = useMemo(() => {
    const m = new Map();
    for (const e of endpoints) m.set(e.id, e);
    return m;
  }, [endpoints]);

  function normalizeUrl(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    return `${defaultProtocol}${s}`;
  }

  async function loadEndpoints() {
    try {
      const data = await fetchJSON(`${API}/api/endpoints`);
      setEndpoints(Array.isArray(data) ? data : []);
    } catch {
      // keep quiet during polling
    }
  }

  async function loadChecksFor(id, limit = 50) {
    try {
      const rows = await fetchJSON(`${API}/api/checks/${id}`);
      const arr = Array.isArray(rows) ? rows : [];
      return arr.slice(0, limit);
    } catch {
      return [];
    }
  }

  async function generateCheck(id) {
    // This is what clicking Check does, we just automate it when AUTO_GENERATE = true.
    try {
      await fetchJSON(`${API}/api/check/${id}`, { method: "POST" });
    } catch {
      // ignore generate failures
    }
  }

  async function refreshEndpointTelemetry(id) {
    // 1) Optionally create a new check row
    if (AUTO_GENERATE) await generateCheck(id);

    // 2) Pull fresh rows
    const rows = await loadChecksFor(id, 60);
    setLatest((p) => ({ ...p, [id]: rows[0] ?? null }));
    setHistory((p) => ({ ...p, [id]: rows.slice(0, 50) }));
  }

  // Initial load
  useEffect(() => {
    loadEndpoints();
  }, []);

  // Poll endpoints list
  useEffect(() => {
    const t = setInterval(loadEndpoints, 3000);
    return () => clearInterval(t);
  }, []);

  // Poll telemetry for all endpoints
  useEffect(() => {
    if (endpoints.length === 0) return;

    let cancelled = false;

    async function tick() {
      if (cancelled) return;

      // Run all endpoint refresh in parallel
      await Promise.all(
        endpoints.map(async (e) => {
          if (cancelled) return;
          await refreshEndpointTelemetry(e.id);
        })
      );
    }

    tick();
    const t = setInterval(tick, 2000);

    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoints.map((e) => e.id).join("|")]);

  const systemSummary = useMemo(() => {
    const latestRows = endpoints.map((e) => latest[e.id]).filter(Boolean);
    const checkedCount = latestRows.length;

    let upCount = 0;
    let downCount = 0;

    for (const r of latestRows) {
      const ok = r.ok === 1 || r.ok === true;
      if (ok) upCount += 1;
      else downCount += 1;
    }

    const avgMs =
      latestRows.length > 0
        ? Math.round(
            latestRows.reduce((sum, r) => sum + (Number(r.ms) || 0), 0) / latestRows.length
          )
        : null;

    let statusLabel = "No checks yet";
    let statusTone = "neutral";
    if (checkedCount > 0 && downCount === 0) {
      statusLabel = "All systems stable";
      statusTone = "good";
    }
    if (downCount > 0) {
      statusLabel = `${downCount} endpoint${downCount === 1 ? "" : "s"} down`;
      statusTone = "bad";
    }

    return { avgMs, statusLabel, statusTone, downCount, upCount, checkedCount };
  }, [endpoints, latest]);

  async function addEndpoint(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      const data = await fetchJSON(`${API}/api/endpoints`, {
        method: "POST",
        body: JSON.stringify({ name, method, url: normalizeUrl(url) })
      });

      setName("");
      setMethod("GET");
      setUrl("");
      setMsg("Endpoint added.");
      await loadEndpoints();

      // immediately create a first datapoint
      if (data?.id) await refreshEndpointTelemetry(data.id);
    } catch (err) {
      setMsg(err?.message || "Backend not reachable.");
    } finally {
      setLoading(false);
    }
  }

  async function removeEndpoint(id) {
    setMsg("");
    try {
      await fetchJSON(`${API}/api/endpoints/${id}`, { method: "DELETE" });
    } catch {
      // ignore
    }

    setLatest((p) => {
      const c = { ...p };
      delete c[id];
      return c;
    });
    setHistory((p) => {
      const c = { ...p };
      delete c[id];
      return c;
    });

    if (drawerEndpointId === id && !drawerPinned) {
      setDrawerOpen(false);
      setDrawerEndpointId(null);
    }

    await loadEndpoints();
  }

  async function runCheck(id) {
    setChecking((prev) => ({ ...prev, [id]: true }));
    setMsg("");

    try {
      await generateCheck(id);
      await refreshEndpointTelemetry(id);
    } catch (err) {
      setMsg(err?.message || "Check failed");
    } finally {
      setChecking((prev) => ({ ...prev, [id]: false }));
    }
  }

  function isUp(row) {
    if (!row) return null;
    return row.ok === 1 || row.ok === true;
  }

  function timeAgo(createdAt) {
    if (!createdAt) return "never";
    const iso = createdAt.replace(" ", "T") + "Z";
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return createdAt;

    const diff = Date.now() - t;
    const sec = Math.floor(diff / 1000);
    if (sec < 10) return "just now";
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    return `${d}d ago`;
  }

  function openTelemetry(id) {
    setDrawerEndpointId(id);
    setDrawerOpen(true);
  }

  function windowToCount(win) {
    // backend returns up to 50 rows anyway, keep it simple
    if (win === "2m") return 50;
    if (win === "10m") return 50;
    if (win === "1h") return 50;
    return 50;
  }

  function speedToMs(speed) {
    if (speed === "0.5s") return 500;
    if (speed === "1s") return 1000;
    if (speed === "2s") return 2000;
    return 1000;
  }

  const drawerEndpoint = drawerEndpointId ? endpointsById.get(drawerEndpointId) : null;
  const drawerRows = drawerEndpointId ? history[drawerEndpointId] || [] : [];
  const drawerLatest = drawerEndpointId ? latest[drawerEndpointId] : null;
  const drawerUp = isUp(drawerLatest);

  const drawerStats = useMemo(() => {
    const rows = drawerRows;
    if (!rows || rows.length === 0) {
      return { p95: null, min: null, max: null, downPct: null };
    }

    const msVals = rows
      .map((r) => Number(r.ms))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);

    const min = msVals.length ? msVals[0] : null;
    const max = msVals.length ? msVals[msVals.length - 1] : null;
    const p95 = msVals.length ? msVals[Math.floor(0.95 * (msVals.length - 1))] : null;

    const downCount = rows.reduce(
      (acc, r) => acc + ((r.ok === 1 || r.ok === true) ? 0 : 1),
      0
    );
    const downPct = rows.length ? Math.round((downCount / rows.length) * 100) : null;

    return { p95, min, max, downPct };
  }, [drawerRows]);

  // Drawer polling (faster)
  const drawerTimerRef = useRef(null);

  useEffect(() => {
    if (!drawerOpen || !drawerEndpointId) return;

    const intervalMs = speedToMs(drawerSpeed);
    let cancelled = false;

    async function tick() {
      if (cancelled) return;

      // Important: generate a new check to make it move
      if (AUTO_GENERATE) await generateCheck(drawerEndpointId);

      const rows = await loadChecksFor(drawerEndpointId, windowToCount(drawerWindow));
      setHistory((p) => ({ ...p, [drawerEndpointId]: rows.slice(0, 50) }));
      setLatest((p) => ({ ...p, [drawerEndpointId]: rows[0] ?? null }));
    }

    tick();

    drawerTimerRef.current = setInterval(tick, intervalMs);

    return () => {
      cancelled = true;
      if (drawerTimerRef.current) clearInterval(drawerTimerRef.current);
      drawerTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen, drawerEndpointId, drawerWindow, drawerSpeed]);

  function toneClass(up) {
    if (up === null) return styles.neutral;
    return up ? styles.good : styles.bad;
  }

  function safeNum(n) {
    if (n === null || n === undefined) return "—";
    if (Number.isFinite(Number(n))) return String(n);
    return "—";
  }

  const timeline = useMemo(() => {
    const rows = drawerRows.slice(0, 40).reverse();
    return rows.map((r) => {
      const ok = r.ok === 1 || r.ok === true;
      return { ok, ms: Number(r.ms) || 0 };
    });
  }, [drawerRows]);

  const insight = useMemo(() => {
    const rows = drawerRows;
    if (!rows || rows.length < 6) {
      return {
        volatility: "Low",
        anomaly: "No anomaly detected",
        recommendation: "Collect more samples to build a baseline."
      };
    }

    const ms = rows.map((r) => Number(r.ms)).filter((n) => Number.isFinite(n));
    const avg = ms.reduce((a, b) => a + b, 0) / (ms.length || 1);
    const variance = ms.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / (ms.length || 1);
    const std = Math.sqrt(variance);

    let volatility = "Low";
    if (std > 120) volatility = "High";
    else if (std > 60) volatility = "Medium";

    const latestMs = Number(rows[0]?.ms) || 0;
    const anomaly = latestMs > avg + 2 * std ? "Latency spike detected" : "No anomaly detected";

    const downCount = rows.reduce((acc, r) => acc + ((r.ok === 1 || r.ok === true) ? 0 : 1), 0);
    const recommendation =
      downCount > 0
        ? "Investigate downtime events. Add retries and log upstream dependencies."
        : anomaly === "Latency spike detected"
        ? "Consider setting alerts for latency p95. Check network, DNS, or rate limits."
        : "Looks stable. Add an alert threshold and monitor p95.";

    return { volatility, anomaly, recommendation };
  }, [drawerRows]);

  return (
    <div className={styles.page}>
      <div className={styles.bgGlow} />
      <div className={styles.container}>
        <div className={styles.topBar}>
          <div className={styles.brand}>
            <div className={styles.logoDot} />
            <div>
              <div className={styles.brandName}>PulseMonitor</div>
              <div className={styles.brandSub}>Ambient uptime and latency telemetry</div>
            </div>
          </div>

          <div className={styles.systemChip}>
            <span className={`${styles.chipDot} ${styles[systemSummary.statusTone]}`} />
            <span className={styles.chipText}>{systemSummary.statusLabel}</span>
            {systemSummary.avgMs !== null && (
              <span className={styles.chipMeta}>{systemSummary.avgMs} ms avg</span>
            )}
          </div>
        </div>

        <div className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <div className={styles.panelTitle}>New endpoint</div>
                <div className={styles.panelSub}>Add a service to monitor</div>
              </div>

              <div className={styles.kpiRow}>
                <div className={styles.kpi}>
                  <div className={styles.kpiLabel}>Tracked</div>
                  <div className={styles.kpiValue}>{endpoints.length}</div>
                </div>
                <div className={styles.kpi}>
                  <div className={styles.kpiLabel}>Down</div>
                  <div className={styles.kpiValue}>{systemSummary.downCount}</div>
                </div>
              </div>
            </div>

            <form onSubmit={addEndpoint} className={styles.form}>
              <div className={styles.field}>
                <label className={styles.label}>Name</label>
                <input
                  className={styles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Auth API"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Method</label>
                <select className={styles.select} value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>DELETE</option>
                </select>
                <div className={styles.hint}>Checker uses GET for request. Method is stored for display.</div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>URL</label>
                <div className={styles.protocolRow}>
                  <select
                    className={styles.select}
                    value={defaultProtocol}
                    onChange={(e) => setDefaultProtocol(e.target.value)}
                  >
                    <option value="https://">https://</option>
                    <option value="http://">http://</option>
                  </select>
                  <input
                    className={styles.input}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="example.com/health"
                  />
                </div>
                <div className={styles.hint}>If you omit http/https, we prepend the selected protocol.</div>
              </div>

              <div className={styles.actions}>
                <button className={styles.primaryBtn} disabled={loading}>
                  {loading ? "Adding..." : "Add endpoint"}
                </button>
                <button type="button" className={styles.ghostBtn} onClick={loadEndpoints}>
                  Refresh
                </button>
              </div>

              {msg && <div className={styles.toast}>{msg}</div>}
            </form>

            <div className={styles.aiBox}>
              <div className={styles.aiTitle}>AI Insight (heuristic)</div>
              <div className={styles.aiText}>
                Calm monitoring. Status first, details on demand. Interface stays quiet until something changes.
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <div className={styles.panelTitle}>Endpoints</div>
                <div className={styles.panelSub}>
                  Live cards. Trend opens deep telemetry. Auto-generate: {AUTO_GENERATE ? "ON" : "OFF"}
                </div>
              </div>
            </div>

            {endpoints.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyTitle}>No endpoints yet</div>
                <div className={styles.emptySub}>Add one, then it will start moving.</div>
              </div>
            ) : (
              <div className={styles.cardList}>
                {endpoints.map((e) => {
                  const last = latest[e.id];
                  const up = isUp(last);
                  const rows = history[e.id] || [];

                  return (
                    <div key={e.id} className={`${styles.card} ${up === null ? "" : up ? styles.cardUp : styles.cardDown}`}>
                      <div className={styles.cardTop}>
                        <div className={styles.cardLeft}>
                          <div className={styles.cardTitleRow}>
                            <span className={`${styles.statusDot} ${toneClass(up)}`} />
                            <div className={styles.cardTitle}>{e.name}</div>
                            <div
                              className={`${styles.badge} ${
                                up === null ? styles.badgeNeutral : up ? styles.badgeUp : styles.badgeDown
                              }`}
                            >
                              {up === null ? "No data" : up ? "UP" : "DOWN"}
                            </div>
                          </div>
                          <div className={styles.cardUrl}>{e.url}</div>
                        </div>

                        <div className={styles.cardRight}>
                          <button className={styles.smallBtn} onClick={() => runCheck(e.id)} disabled={!!checking[e.id]}>
                            {checking[e.id] ? "Checking..." : "Check"}
                          </button>

                          <button className={styles.smallGhostBtn} onClick={() => openTelemetry(e.id)}>
                            Trend
                          </button>

                          <button className={styles.smallDangerBtn} onClick={() => removeEndpoint(e.id)}>
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className={styles.cardMetaRow}>
                        <div className={styles.metric}>
                          <div className={styles.metricLabel}>Latency</div>
                          <div className={styles.metricValue}>{last ? `${last.ms} ms` : "—"}</div>
                        </div>
                        <div className={styles.metric}>
                          <div className={styles.metricLabel}>Status</div>
                          <div className={styles.metricValue}>{last ? last.status ?? "N/A" : "—"}</div>
                        </div>
                        <div className={styles.metric}>
                          <div className={styles.metricLabel}>Last check</div>
                          <div className={styles.metricValue}>{last ? timeAgo(last.created_at) : "—"}</div>
                        </div>
                        <div className={styles.metric}>
                          <div className={styles.metricLabel}>Trend</div>
                          <div className={styles.metricValue}>
                            <Sparkline points={rows.slice(0, 18).reverse()} />
                          </div>
                        </div>
                      </div>

                      <div className={styles.miniLog}>
                        {rows.slice(0, 3).map((r, idx) => {
                          const ok = r.ok === 1 || r.ok === true;
                          return (
                            <div key={idx} className={styles.miniLogRow}>
                              <span className={`${styles.historyDot} ${ok ? styles.good : styles.bad}`} />
                              <div className={styles.miniLogText}>
                                {ok ? "UP" : "DOWN"} , status {r.status ?? "N/A"} , {r.ms} ms , {timeAgo(r.created_at)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.footerText}>2030 UX mode: progressive disclosure, calm signals, minimal noise.</div>
        </div>
      </div>

      {/* Drawer */}
      <div
        className={`${styles.drawerOverlay} ${drawerOpen ? styles.drawerOverlayOpen : ""}`}
        onClick={() => {
          if (!drawerPinned) setDrawerOpen(false);
        }}
      >
        <div className={`${styles.drawer} ${drawerOpen ? styles.drawerOpen : ""}`} onClick={(e) => e.stopPropagation()}>
          <div className={styles.drawerTop}>
            <div className={styles.drawerTitleRow}>
              <div className={styles.drawerTitle}>
                Telemetry
                <span className={styles.livePill}>
                  <span className={styles.liveDot} />
                  live
                </span>
              </div>

              <button className={styles.drawerClose} onClick={() => { if (!drawerPinned) setDrawerOpen(false); }}>
                Close
              </button>
            </div>

            <div className={styles.drawerSub}>
              <div className={styles.drawerEndpointName}>{drawerEndpoint?.name || "—"}</div>
              <div className={styles.drawerEndpointUrl}>{drawerEndpoint?.url || "—"}</div>
            </div>

            <div className={styles.drawerControls}>
              <div className={styles.drawerControl}>
                <div className={styles.drawerControlLabel}>Window</div>
                <select className={styles.drawerSelect} value={drawerWindow} onChange={(e) => setDrawerWindow(e.target.value)}>
                  <option value="2m">Last 2m</option>
                  <option value="10m">Last 10m</option>
                  <option value="1h">Last 1h</option>
                </select>
              </div>

              <div className={styles.drawerControl}>
                <div className={styles.drawerControlLabel}>Speed</div>
                <select className={styles.drawerSelect} value={drawerSpeed} onChange={(e) => setDrawerSpeed(e.target.value)}>
                  <option value="0.5s">0.5s</option>
                  <option value="1s">1s</option>
                  <option value="2s">2s</option>
                </select>
              </div>

              <button
                className={`${styles.drawerPinBtn} ${drawerPinned ? styles.drawerPinActive : ""}`}
                onClick={() => setDrawerPinned((v) => !v)}
              >
                {drawerPinned ? "Pinned" : "Pin"}
              </button>
            </div>
          </div>

          <div className={styles.drawerBody}>
            <div className={styles.drawerHero}>
              <div className={styles.drawerHeroLeft}>
                <div className={styles.drawerStatusRow}>
                  <span className={`${styles.drawerStatusDot} ${drawerUp === null ? styles.neutral : drawerUp ? styles.good : styles.bad}`} />
                  <div className={styles.drawerStatusText}>{drawerUp === null ? "No data" : drawerUp ? "UP" : "DOWN"}</div>
                  <div className={styles.drawerStatusMeta}>
                    status {drawerLatest?.status ?? "N/A"} , {safeNum(drawerLatest?.ms)} ms ,{" "}
                    {drawerLatest?.created_at ? timeAgo(drawerLatest.created_at) : "—"}
                  </div>
                </div>

                <div className={styles.sparklineWrap}>
                  <Sparkline points={drawerRows.slice(0, 50).reverse()} width={900} height={140} big />
                </div>
              </div>

              <div className={styles.drawerHeroRight}>
                <div className={styles.drawerQuickStats}>
                  <div className={styles.statTile}>
                    <div className={styles.statLabel}>p95 latency</div>
                    <div className={styles.statValue}>{drawerStats.p95 !== null ? `${drawerStats.p95} ms` : "—"}</div>
                  </div>
                  <div className={styles.statTile}>
                    <div className={styles.statLabel}>min</div>
                    <div className={styles.statValue}>{drawerStats.min !== null ? `${drawerStats.min} ms` : "—"}</div>
                  </div>
                  <div className={styles.statTile}>
                    <div className={styles.statLabel}>max</div>
                    <div className={styles.statValue}>{drawerStats.max !== null ? `${drawerStats.max} ms` : "—"}</div>
                  </div>
                  <div className={styles.statTile}>
                    <div className={styles.statLabel}>down%</div>
                    <div className={styles.statValue}>{drawerStats.downPct !== null ? `${drawerStats.downPct}%` : "—"}</div>
                  </div>
                </div>

                <div className={styles.insightCard}>
                  <div className={styles.insightTitle}>Deep insight</div>
                  <div className={styles.insightText}>Heuristic, local-only. No external AI calls.</div>
                  <div className={styles.insightList}>
                    <div className={styles.insightItem}>
                      <div className={styles.insightKey}>Volatility</div>
                      <div className={styles.insightVal}>{insight.volatility}</div>
                    </div>
                    <div className={styles.insightItem}>
                      <div className={styles.insightKey}>Anomaly</div>
                      <div className={styles.insightVal}>{insight.anomaly}</div>
                    </div>
                    <div className={styles.insightItem}>
                      <div className={styles.insightKey}>Recommendation</div>
                      <div className={styles.insightVal}>{insight.recommendation}</div>
                    </div>
                  </div>
                </div>

                <div className={styles.timelineCard}>
                  <div className={styles.timelineTitle}>Signal timeline (last 40)</div>
                  <div className={styles.timelineRow}>
                    {timeline.map((t, idx) => {
                      const cls = t.ok ? styles.good : styles.bad;
                      const alpha = clamp(0.55 + (t.ms / 500) * 0.45, 0.55, 1);
                      return (
                        <div
                          key={idx}
                          className={`${styles.timelineDot} ${cls}`}
                          style={{ opacity: alpha }}
                          title={`${t.ok ? "UP" : "DOWN"} • ${t.ms}ms`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.drawerLog}>
              <div className={styles.drawerLogTop}>
                <div className={styles.drawerLogTitle}>Live log</div>
                <div className={styles.drawerLogHint}>Pulling newest checks at {drawerSpeed}.</div>
              </div>

              <div className={styles.drawerLogList}>
                {drawerRows.length === 0 ? (
                  <div className={styles.drawerLogEmpty}>No history yet. Wait a second, it will start moving.</div>
                ) : (
                  drawerRows.slice(0, 16).map((r, idx) => {
                    const ok = r.ok === 1 || r.ok === true;
                    return (
                      <div key={idx} className={styles.drawerLogRow}>
                        <span className={`${styles.drawerLogDot} ${ok ? styles.good : styles.bad}`} />
                        <div className={styles.drawerLogMain}>
                          <div className={styles.drawerLogStrong}>
                            {ok ? "UP" : "DOWN"} • status {r.status ?? "N/A"} • {r.ms} ms
                          </div>
                          <div className={styles.drawerLogMuted}>{drawerEndpoint?.url || "—"}</div>
                        </div>
                        <div className={styles.drawerLogTime}>{timeAgo(r.created_at)}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div style={{ height: 24 }} />
          </div>
        </div>
      </div>
    </div>
  );
}