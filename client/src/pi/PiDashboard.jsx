import { useMemo, useState } from "react";
import styles from "../App.module.css";
import { usePiTelemetry } from "./usePiTelemetry";

function parseTs(ts) {
  if (!ts) return null;
  const iso = ts.includes("T") ? ts : ts.replace(" ", "T");
  const ms = Date.parse(iso.endsWith("Z") ? iso : `${iso}Z`);
  return Number.isNaN(ms) ? null : ms;
}

function piStatus(latest) {
  const t = parseTs(latest?.ts || latest?.created_at);
  if (!t) return { tone: "neutral", label: "No data", ageSec: null };
  const ageSec = Math.floor((Date.now() - t) / 1000);
  if (ageSec <= 15) return { tone: "good", label: "Online", ageSec };
  if (ageSec <= 60) return { tone: "neutral", label: "Stale", ageSec };
  return { tone: "bad", label: "Offline", ageSec };
}

function ageText(ageSec) {
  if (ageSec === null) return "—";
  if (ageSec < 60) return `${ageSec}s ago`;
  const m = Math.floor(ageSec / 60);
  return `${m}m ago`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function isNum(x) {
  return Number.isFinite(Number(x));
}

function fmt1(x) {
  return isNum(x) ? Number(x).toFixed(1) : "N/A";
}

function fmtInt(x) {
  return isNum(x) ? String(Math.round(Number(x))) : "N/A";
}

function fmtPct(x) {
  if (!isNum(x)) return "N/A";
  return `${Number(x).toFixed(1)}%`;
}

function fmtMb(x) {
  return isNum(x) ? `${Math.round(Number(x))} MB` : "N/A";
}

function fmtGb(x) {
  return isNum(x) ? `${Number(x).toFixed(1)} GB` : "N/A";
}

function fmtRatio(used, total, unitFmt) {
  const uOk = isNum(used);
  const tOk = isNum(total);
  if (!uOk || !tOk || Number(total) <= 0) return "N/A";
  return `${unitFmt(used)} / ${unitFmt(total)}`;
}

function fmtUsedPct(used, total) {
  if (!isNum(used) || !isNum(total) || Number(total) <= 0) return null;
  return clamp((Number(used) / Number(total)) * 100, 0, 100);
}

function formatUptime(s) {
  if (!isNum(s)) return "N/A";
  const sec = Number(s);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function normalizeSeries(points, maxPoints = 60) {
  const raw = Array.isArray(points) ? points : [];
  const sliced = raw.length > maxPoints ? raw.slice(raw.length - maxPoints) : raw;

  const out = [];
  let last = null;

  for (let i = 0; i < sliced.length; i++) {
    const v = Number(sliced[i]);
    if (Number.isFinite(v)) {
      out.push(v);
      last = v;
    } else {
      out.push(last === null ? 0 : last);
    }
  }
  return out;
}

function SparklineHUD({
  points = [],
  fixedRange = null,
  labelLeft = "",
  labelRight = "",
  size = "card"
}) {
  const width = 900;
  const height = size === "card" ? 64 : 220;

  const vals = normalizeSeries(points, size === "card" ? 60 : 140);
  const hasLine = vals.length >= 2;

  const safeMin = vals.length ? Math.min(...vals) : 0;
  const safeMax = vals.length ? Math.max(...vals) : 1;

  const min = fixedRange ? fixedRange.min : safeMin;
  const max = fixedRange ? fixedRange.max : safeMax;

  const padY = size === "card" ? 8 : 14;
  const padX = 8;

  const y = (v) => {
    const t = max === min ? 0.5 : (v - min) / (max - min);
    return height - padY - t * (height - padY * 2);
  };

  const step = width / Math.max(1, vals.length - 1);

  let d = "";
  if (hasLine) {
    d = `M ${padX} ${y(vals[0])}`;
    for (let i = 1; i < vals.length; i++) {
      d += ` L ${Math.round(padX + i * step)} ${Math.round(y(vals[i]))}`;
    }
  }

  const areaD = hasLine
    ? `${d} L ${padX + (vals.length - 1) * step} ${height - padY} L ${padX} ${height - padY} Z`
    : "";

  const grid = [];
  const gridLines = size === "card" ? 2 : 4;
  for (let i = 0; i <= gridLines; i++) {
    const yy = Math.round(padY + (i * (height - padY * 2)) / gridLines);
    grid.push(<line key={i} x1="0" y1={yy} x2={width} y2={yy} className={styles.hudGridLine} />);
  }

  const areaId = `pmArea_${labelLeft}_${size}`.replaceAll(" ", "_");
  const glowId = `pmGlow_${labelLeft}_${size}`.replaceAll(" ", "_");

  return (
    <div className={size === "card" ? styles.hudChartCard : styles.hudChartDetail}>
      <div className={styles.hudChartTop}>
        <div className={styles.hudChartLabel}>{labelLeft}</div>
        <div className={styles.hudChartLabelRight}>{labelRight}</div>
      </div>

      <div className={size === "card" ? styles.piSparkBoxSmall : styles.piSparkBoxBig}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={styles.sparklineSvg}>
          <defs>
            <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(41,212,255,0.22)" />
              <stop offset="100%" stopColor="rgba(41,212,255,0.00)" />
            </linearGradient>

            <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation={size === "card" ? "2.2" : "3.2"} result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {grid}

          {hasLine ? <path d={areaD} fill={`url(#${areaId})`} /> : null}
          {hasLine ? <path d={d} className={styles.hudLine} filter={`url(#${glowId})`} /> : null}

          {!hasLine ? (
            <path d={`M 0 ${height - 12} L ${width} ${height - 12}`} className={styles.sparklineIdle} />
          ) : null}
        </svg>
      </div>
    </div>
  );
}

function StatTile({ label, value, sub, pct }) {
  return (
    <div className={styles.statTile}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>

      {sub ? <div className={styles.statSub}>{sub}</div> : null}

      {isNum(pct) ? (
        <div className={styles.hudBar} title={`${pct.toFixed(0)}%`}>
          <div className={styles.hudBarFill} style={{ width: `${clamp(pct, 0, 100)}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function ChartModal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className={styles.chartOverlay} onMouseDown={onClose}>
      <div className={styles.chartModal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.chartModalTop}>
          <div className={styles.chartModalTitle}>{title}</div>
          <button className={styles.chartModalClose} onClick={onClose}>
            Close
          </button>
        </div>
        <div className={styles.chartModalBody}>{children}</div>
      </div>
    </div>
  );
}

function seriesStats(arr) {
  const vals = (arr || []).map((x) => Number(x)).filter((n) => Number.isFinite(n));
  if (vals.length === 0) return { min: null, max: null, last: null };
  return { min: Math.min(...vals), max: Math.max(...vals), last: vals[vals.length - 1] };
}

export default function PiDashboard() {
  const { devices, selectedId, setSelectedId, device, latest, history } = usePiTelemetry({ pollMs: 2000 });
  const [openChart, setOpenChart] = useState(null);

  const cpuTempSeries = useMemo(() => {
    return history.slice().reverse().map((r) => r?.cpu_temp_c);
  }, [history]);

  const cpuUsageSeries = useMemo(() => {
    return history.slice().reverse().map((r) => r?.cpu_usage);
  }, [history]);

  const memPct = fmtUsedPct(latest?.mem_used_mb, latest?.mem_total_mb);
  const diskPct = fmtUsedPct(latest?.disk_used_gb, latest?.disk_total_gb);

  const loadStr =
    isNum(latest?.load1) || isNum(latest?.load5) || isNum(latest?.load15)
      ? `${fmt1(latest?.load1)} , ${fmt1(latest?.load5)} , ${fmt1(latest?.load15)}`
      : "N/A";

  const netStr =
    isNum(latest?.rx_kbps) || isNum(latest?.tx_kbps)
      ? `RX ${fmt1(latest?.rx_kbps)} kbps , TX ${fmt1(latest?.tx_kbps)} kbps`
      : "N/A";

  const s = piStatus(latest);
  const chartKey = `k-${history.length}`;

  const tStats = seriesStats(cpuTempSeries);
  const cStats = seriesStats(cpuUsageSeries);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <div className={styles.panelTitle}>Devices</div>
          <div className={styles.panelSub}>Live telemetry, separate from service checks</div>
        </div>

        <div className={styles.drawerControls}>
          <div className={styles.drawerControl}>
            <div className={styles.drawerControlLabel}>Device</div>
            <select
              className={styles.drawerSelect}
              value={selectedId || ""}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {devices.length === 0 ? <option value="">No devices yet</option> : null}
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.id})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className={styles.piHero}>
        <div className={styles.piLeft}>
          <div className={styles.piHeader}>
            <div className={styles.drawerEndpointName}>{device?.name || "N/A"}</div>

            <div className={styles.drawerEndpointUrl}>
              <span className={`${styles.statusDot} ${styles[s.tone]}`} />
              {s.label} , last {ageText(s.ageSec)} , IP {latest?.ip || "—"} , uptime {formatUptime(latest?.uptime_s)}
            </div>
          </div>

          <div className={styles.piCharts}>
            <div className={styles.piChartCard}>
              <div className={styles.piCardTopRow}>
                <div className={styles.timelineTitle}>CPU temperature</div>
                <button className={styles.piMiniBtn} onClick={() => setOpenChart("temp")}>
                  Expand
                </button>
              </div>

              <button className={styles.piChartClickArea} onClick={() => setOpenChart("temp")}>
                <SparklineHUD
                  key={`temp-${chartKey}`}
                  size="card"
                  points={cpuTempSeries}
                  fixedRange={{ min: 20, max: 90 }}
                  labelLeft="Thermal"
                  labelRight={`Now ${fmt1(latest?.cpu_temp_c)} C`}
                />
              </button>

              <div className={styles.piDebugRow}>
                Temp debug, last {tStats.last === null ? "N/A" : fmt1(tStats.last)} C, min{" "}
                {tStats.min === null ? "N/A" : fmt1(tStats.min)}, max {tStats.max === null ? "N/A" : fmt1(tStats.max)}
              </div>
            </div>

            <div className={styles.piChartCard}>
              <div className={styles.piCardTopRow}>
                <div className={styles.timelineTitle}>CPU usage</div>
                <button className={styles.piMiniBtn} onClick={() => setOpenChart("cpu")}>
                  Expand
                </button>
              </div>

              <button className={styles.piChartClickArea} onClick={() => setOpenChart("cpu")}>
                <SparklineHUD
                  key={`cpu-${chartKey}`}
                  size="card"
                  points={cpuUsageSeries}
                  fixedRange={{ min: 0, max: 100 }}
                  labelLeft="Compute"
                  labelRight={`Now ${fmtPct(latest?.cpu_usage)}`}
                />
              </button>

              <div className={styles.piDebugRow}>
                CPU debug, last {cStats.last === null ? "N/A" : fmt1(cStats.last)}%, min{" "}
                {cStats.min === null ? "N/A" : fmt1(cStats.min)}, max {cStats.max === null ? "N/A" : fmt1(cStats.max)}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.piRight}>
          <div className={styles.drawerQuickStats}>
            <StatTile label="Temp" value={`${fmt1(latest?.cpu_temp_c)} C`} sub="Thermal zone" />
            <StatTile label="CPU" value={fmtPct(latest?.cpu_usage)} sub="Usage" />

            <StatTile
              label="RAM used"
              value={memPct === null ? "N/A" : `${memPct.toFixed(0)}%`}
              sub={fmtRatio(latest?.mem_used_mb, latest?.mem_total_mb, fmtMb)}
              pct={memPct ?? undefined}
            />

            <StatTile
              label="Disk used"
              value={diskPct === null ? "N/A" : `${diskPct.toFixed(0)}%`}
              sub={fmtRatio(latest?.disk_used_gb, latest?.disk_total_gb, fmtGb)}
              pct={diskPct ?? undefined}
            />

            <StatTile label="Load" value={loadStr} sub="1 , 5 , 15" />
            <StatTile label="Network" value={netStr} sub="Interface totals" />
          </div>

          <div className={styles.drawerLog}>
            <div className={styles.drawerLogTop}>
              <div className={styles.drawerLogTitle}>Live log</div>
              <div className={styles.drawerLogHint}>Updates every 2 seconds</div>
            </div>

            <div className={styles.drawerLogList}>
              {history.length === 0 ? (
                <div className={styles.drawerLogEmpty}>No device data yet. Start the agent.</div>
              ) : (
                history.slice(0, 14).map((r) => (
                  <div key={r.id} className={styles.drawerLogRow}>
                    <span className={`${styles.drawerLogDot} ${styles.neutral}`} />
                    <div className={styles.drawerLogMain}>
                      <div className={styles.drawerLogStrong}>
                        {fmtPct(r.cpu_usage)} cpu , {fmt1(r.cpu_temp_c)} C temp , {fmtInt(r.mem_used_mb)} MB ram
                      </div>
                      <div className={styles.drawerLogMuted}>{r.ts}</div>
                    </div>
                    <div className={styles.drawerLogTime}>{r.ip || "N/A"}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <ChartModal
        open={openChart === "temp"}
        onClose={() => setOpenChart(null)}
        title={`CPU temperature, now ${fmt1(latest?.cpu_temp_c)} C`}
      >
        <SparklineHUD
          key={`tempDetail-${chartKey}`}
          size="detail"
          points={cpuTempSeries}
          fixedRange={{ min: 20, max: 90 }}
          labelLeft="Thermal"
          labelRight={`Now ${fmt1(latest?.cpu_temp_c)} C`}
        />
      </ChartModal>

      <ChartModal
        open={openChart === "cpu"}
        onClose={() => setOpenChart(null)}
        title={`CPU usage, now ${fmtPct(latest?.cpu_usage)}`}
      >
        <SparklineHUD
          key={`cpuDetail-${chartKey}`}
          size="detail"
          points={cpuUsageSeries}
          fixedRange={{ min: 0, max: 100 }}
          labelLeft="Compute"
          labelRight={`Now ${fmtPct(latest?.cpu_usage)}`}
        />
      </ChartModal>
    </div>
  );
}