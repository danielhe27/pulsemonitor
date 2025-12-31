import { useEffect, useMemo, useState } from "react";
import styles from "./App.module.css";

const API = ""; // Vite proxy -> /api => http://127.0.0.1:5050

function Sparkline({ points = [], width = 140, height = 28 }) {
  if (!points || points.length < 2) {
    return (
      <svg width={width} height={height} className={styles.sparkline}>
        <path d={`M 0 ${height - 4} L ${width} ${height - 4}`} className={styles.sparklineIdle} />
      </svg>
    );
  }

  const vals = points.map((p) => Number(p.ms || 0)).filter((n) => Number.isFinite(n));
  if (vals.length < 2) return null;

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = 2;

  const norm = (v) => {
    if (max === min) return height / 2;
    const t = (v - min) / (max - min);
    return (height - pad) - t * (height - pad * 2);
  };

  const step = width / (vals.length - 1);

  let d = `M 0 ${norm(vals[0])}`;
  for (let i = 1; i < vals.length; i++) {
    d += ` L ${Math.round(i * step)} ${Math.round(norm(vals[i]))}`;
  }

  return (
    <svg width={width} height={height} className={styles.sparkline}>
      <path d={d} className={styles.sparklinePath} />
    </svg>
  );
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
  const [checking, setChecking] = useState({});
  const [history, setHistory] = useState({});
  const [openHistory, setOpenHistory] = useState({});

  function normalizeUrl(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    return `${defaultProtocol}${s}`;
  }

  async function loadEndpoints() {
    const res = await fetch(`${API}/api/endpoints`);
    const data = await res.json();
    setEndpoints(data);
  }

  async function loadLatestFor(id) {
    const res = await fetch(`${API}/api/checks/${id}`);
    const rows = await res.json();
    setLatest((prev) => ({ ...prev, [id]: rows?.[0] ?? null }));
  }

  async function loadHistoryFor(id) {
    const res = await fetch(`${API}/api/checks/${id}`);
    const rows = await res.json();
    setHistory((prev) => ({ ...prev, [id]: (rows || []).slice(0, 24) }));
  }

  useEffect(() => {
    loadEndpoints();
  }, []);

  useEffect(() => {
    endpoints.forEach((e) => {
      loadLatestFor(e.id);
      if (openHistory[e.id]) loadHistoryFor(e.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoints]);

  const systemSummary = useMemo(() => {
    const latestRows = endpoints.map((e) => latest[e.id]).filter(Boolean);
    const checkedCount = latestRows.length;

    let downCount = 0;
    for (const r of latestRows) {
      const ok = r.ok === 1 || r.ok === true;
      if (!ok) downCount += 1;
    }

    const avgMs =
      latestRows.length > 0
        ? Math.round(latestRows.reduce((sum, r) => sum + (Number(r.ms) || 0), 0) / latestRows.length)
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

    return { avgMs, statusLabel, statusTone, downCount };
  }, [endpoints, latest]);

  async function addEndpoint(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/endpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, method, url: normalizeUrl(url) })
      });
      const data = await res.json();

      if (!res.ok) {
        setMsg(data?.error || "Failed to add endpoint");
        return;
      }

      setName("");
      setMethod("GET");
      setUrl("");
      setMsg("Endpoint added.");
      await loadEndpoints();
    } catch {
      setMsg("Backend not reachable.");
    } finally {
      setLoading(false);
    }
  }

  async function removeEndpoint(id) {
    setMsg("");
    await fetch(`${API}/api/endpoints/${id}`, { method: "DELETE" });

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
    setOpenHistory((p) => {
      const c = { ...p };
      delete c[id];
      return c;
    });

    await loadEndpoints();
  }

  async function runCheck(id) {
    setChecking((prev) => ({ ...prev, [id]: true }));
    setMsg("");

    try {
      const res = await fetch(`${API}/api/check/${id}`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setMsg(data?.error || "Check failed");
        return;
      }

      await loadLatestFor(id);
      if (openHistory[id]) await loadHistoryFor(id);
    } catch {
      setMsg("Check failed, backend not reachable.");
    } finally {
      setChecking((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function toggleHistory(id) {
    const next = !openHistory[id];
    setOpenHistory((p) => ({ ...p, [id]: next }));
    if (next) await loadHistoryFor(id);
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
            {systemSummary.avgMs !== null && <span className={styles.chipMeta}>{systemSummary.avgMs} ms avg</span>}
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
                <div className={styles.hint}>Checker currently uses GET for the request.</div>
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
                <div className={styles.hint}>If you omit http/https, we’ll prepend the selected protocol.</div>
              </div>

              <div className={styles.actions}>
                <button className={styles.primaryBtn} disabled={loading}>
                  {loading ? "Adding..." : "Add endpoint"}
                </button>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={async () => {
                    setMsg("");
                    await loadEndpoints();
                  }}
                >
                  Refresh
                </button>
              </div>

              {msg && <div className={styles.toast}>{msg}</div>}
            </form>

            <div className={styles.aiBox}>
              <div className={styles.aiTitle}>AI Insight (static for now)</div>
              <div className={styles.aiText}>
                Calm monitoring. Status first, details on demand. Keep the interface quiet until something changes.
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <div className={styles.panelTitle}>Endpoints</div>
                <div className={styles.panelSub}>Check and review last signals</div>
              </div>
            </div>

            {endpoints.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyTitle}>No endpoints yet</div>
                <div className={styles.emptySub}>Add one on the left, then run a check.</div>
              </div>
            ) : (
              <div className={styles.cardList}>
                {endpoints.map((e) => {
                  const last = latest[e.id];
                  const up = isUp(last);
                  const isOpen = !!openHistory[e.id];
                  const rows = history[e.id] || [];

                  return (
                    <div key={e.id} className={`${styles.card} ${up === null ? "" : up ? styles.cardUp : styles.cardDown}`}>
                      <div className={styles.cardTop}>
                        <div className={styles.cardLeft}>
                          <div className={styles.cardTitleRow}>
                            <span className={`${styles.statusDot} ${up === null ? styles.neutral : up ? styles.good : styles.bad}`} />
                            <div className={styles.cardTitle}>{e.name}</div>
                            <div className={`${styles.badge} ${up === null ? styles.badgeNeutral : up ? styles.badgeUp : styles.badgeDown}`}>
                              {up === null ? "No data" : up ? "UP" : "DOWN"}
                            </div>
                          </div>
                          <div className={styles.cardUrl}>{e.url}</div>
                        </div>

                        <div className={styles.cardRight}>
                          <button className={styles.smallBtn} onClick={() => runCheck(e.id)} disabled={!!checking[e.id]}>
                            {checking[e.id] ? "Checking..." : "Check"}
                          </button>
                          <button className={styles.smallGhostBtn} onClick={() => toggleHistory(e.id)}>
                            {isOpen ? "Hide" : "History"}
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

                      {isOpen && (
                        <div className={styles.historyBox}>
                          {rows.length === 0 ? (
                            <div className={styles.historyEmpty}>No history yet. Run “Check”.</div>
                          ) : (
                            <div className={styles.historyList}>
                              {rows.slice(0, 12).map((h, idx) => {
                                const ok = h.ok === 1 || h.ok === true;
                                return (
                                  <div key={idx} className={styles.historyRow}>
                                    <span className={`${styles.historyDot} ${ok ? styles.good : styles.bad}`} />
                                    <div className={styles.historyText}>
                                      <span className={styles.historyStrong}>{ok ? "UP" : "DOWN"}</span>
                                      <span className={styles.historyMuted}>status {h.status ?? "N/A"} , {h.ms} ms</span>
                                    </div>
                                    <div className={styles.historyTime}>{timeAgo(h.created_at)}</div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
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
    </div>
  );
}