// src/App.jsx
import { useState } from "react";
import styles from "./App.module.css";
import PiDashboard from "./pi/PiDashboard.jsx";
import ServicesDashboard from "./services/ServicesDashboard.jsx";

/**
 * Vite proxy handles:
 * /api -> http://127.0.0.1:5050
 */
const API = "";
const AUTO_GENERATE = true;

export default function App() {
  const [view, setView] = useState("services"); // services | pi

  // Global summary (controlled by ServicesDashboard)
  const [summary, setSummary] = useState({
    avgMs: null,
    statusLabel: "No checks yet",
    statusTone: "neutral",
    downCount: 0
  });

  return (
    <div className={styles.appShell}>
      {/* Visual overlays, fixed, pointer-events none */}
      <div className={styles.bgGlow} />
      <div className={styles.noise} />
      <div className={styles.scanlines} />
      <div className={styles.vignette} />

      {/* App content */}
      <div className={styles.page}>
        <div className={styles.containerWide}>
          <div className={styles.topBar}>
            {/* Brand */}
            <div className={styles.brand}>
              <div className={styles.logoDot} />
              <div>
                <div className={styles.brandName}>PulseMonitor</div>
                <div className={styles.brandSub}>Ambient uptime and system telemetry</div>
              </div>
            </div>

            {/* View Tabs */}
            <div className={styles.viewTabs}>
              <button
                type="button"
                className={`${styles.tabBtn} ${view === "services" ? styles.tabBtnActive : ""}`}
                onClick={() => setView("services")}
              >
                Services
              </button>

              <button
                type="button"
                className={`${styles.tabBtn} ${view === "pi" ? styles.tabBtnActive : ""}`}
                onClick={() => setView("pi")}
              >
                Raspberry Pi
              </button>
            </div>

            {/* System Status Chip */}
            <div className={styles.systemChip}>
              <span className={`${styles.chipDot} ${styles[summary.statusTone]}`} />
              <span className={styles.chipText}>{summary.statusLabel}</span>
              {summary.avgMs !== null ? <span className={styles.chipMeta}>{summary.avgMs} ms avg</span> : null}
            </div>
          </div>

          {/* Main */}
          {view === "services" ? (
            <ServicesDashboard api={API} autoGenerate={AUTO_GENERATE} onSummaryChange={setSummary} />
          ) : (
            <PiDashboard />
          )}

          {/* Footer */}
          <div className={styles.footer}>
            <div className={styles.footerText}>
              2030 UX mode. Calm signals. Progressive disclosure. Minimal noise.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}