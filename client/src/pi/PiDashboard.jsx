import { useMemo } from "react";
import styles from "../App.module.css";
import { usePiTelemetry } from "./usePiTelemetry";

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

function Sparkline({ points = [], height = 120 }) {
  const vals = points.map(Number).filter((n) => Number.isFinite(n));
  const width = 900;

  if (vals.length < 2) {
    return (
      <div className={styles.sparklineBig}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={styles.sparklineSvg}>
          <path d={`M 0 ${height - 4} L ${width} ${height - 4}`} className={styles.sparklineIdle} />
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
    <div className={styles.sparklineBig}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={styles.sparklineSvg}>
        <path d={d} className={styles.sparklinePath} />
      </svg>
    </div>
  );
}

function StatTile({ label, value, sub, pct }) {
  // Uses inline styles so you do not need new CSS
  return (
    <div className={styles.statTile}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>

      {sub ? (
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.65 }}>
          {sub}
        </div>
      ) : null}

      {isNum(pct) ? (
        <div
          style={{
            marginTop: 8,
            height: 8,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(7,11,16,0.18)",
            overflow: "hidden"
          }}
          title={`${pct.toFixed(0)}%`}
        >
          <div
            style={{
              width: `${clamp(pct, 0, 100)}%`,
              height: "100%",
              background: "rgba(41,212,255,0.35)"
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export default function PiDashboard() {
  const { devices, selectedId, setSelectedId, device, latest, history } = usePiTelemetry({ pollMs: 2000 });

  const cpuTempSeries = useMemo(
    () => history.slice().reverse().map((r) => (isNum(r.cpu_temp_c) ? Number(r.cpu_temp_c) : NaN)),
    [history]
  );

  const cpuUsageSeries = useMemo(
    () => history.slice().reverse().map((r) => (isNum(r.cpu_usage) ? Number(r.cpu_usage) : NaN)),
    [history]
  );

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
              IP {latest?.ip || "N/A"} , uptime {formatUptime(latest?.uptime_s)}
            </div>
          </div>

          <div className={styles.piCharts}>
            <div className={styles.piChartCard}>
              <div className={styles.timelineTitle}>CPU temperature (C)</div>
              <Sparkline points={cpuTempSeries} height={120} />
              <div className={styles.piChartMeta}>Now {fmt1(latest?.cpu_temp_c)} C</div>
            </div>

            <div className={styles.piChartCard}>
              <div className={styles.timelineTitle}>CPU usage</div>
              <Sparkline points={cpuUsageSeries} height={120} />
              <div className={styles.piChartMeta}>Now {fmtPct(latest?.cpu_usage)}</div>
            </div>
          </div>
        </div>

        <div className={styles.piRight}>
          <div className={styles.drawerQuickStats}>
            <StatTile label="Temp" value={`${fmt1(latest?.cpu_temp_c)} C`} />
            <StatTile label="CPU" value={fmtPct(latest?.cpu_usage)} />

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

            <StatTile label="Load" value={loadStr} />
            <StatTile label="Network" value={netStr} />
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
    </div>
  );
}