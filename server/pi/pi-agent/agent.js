import os from "os";
import fs from "fs/promises";
import { exec as _exec } from "child_process";
import { promisify } from "util";

const exec = promisify(_exec);

const API_BASE = process.env.API_BASE || "http://YOUR-LAPTOP-IP:5050";
const PI_ID = process.env.PI_ID || "pi-1";
const PI_NAME = process.env.PI_NAME || "Livingroom Pi";
const PI_TOKEN = process.env.PI_TOKEN || "";
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 2000);

let lastCpu = null;
let lastNet = null;

async function readFileNumber(path) {
  try {
    const s = await fs.readFile(path, "utf8");
    const n = Number(String(s).trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function getCpuTempC() {
  const n = await readFileNumber("/sys/class/thermal/thermal_zone0/temp");
  if (n === null) return null;
  return Math.round((n / 1000) * 10) / 10;
}

async function getCpuUsagePct() {
  try {
    const stat = await fs.readFile("/proc/stat", "utf8");
    const line = stat.split("\n")[0];
    const parts = line.trim().split(/\s+/).slice(1).map(Number);
    const idle = parts[3] + (parts[4] || 0);
    const total = parts.reduce((a, b) => a + b, 0);

    if (!lastCpu) {
      lastCpu = { idle, total };
      return null;
    }

    const idleDelta = idle - lastCpu.idle;
    const totalDelta = total - lastCpu.total;
    lastCpu = { idle, total };

    if (totalDelta <= 0) return null;

    const usage = (1 - idleDelta / totalDelta) * 100;
    return Math.round(usage * 10) / 10;
  } catch {
    return null;
  }
}

async function getDiskUsage() {
  try {
    const { stdout } = await exec("df -k /");
    const lines = stdout.trim().split("\n");
    if (lines.length < 2) return { totalGb: null, usedGb: null };

    const cols = lines[1].split(/\s+/);
    const totalKb = Number(cols[1]);
    const usedKb = Number(cols[2]);

    const totalGb = Math.round((totalKb / 1024 / 1024) * 10) / 10;
    const usedGb = Math.round((usedKb / 1024 / 1024) * 10) / 10;

    return { totalGb, usedGb };
  } catch {
    return { totalGb: null, usedGb: null };
  }
}

function getMemoryMb() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;

  const totalMb = Math.round(total / 1024 / 1024);
  const usedMb = Math.round(used / 1024 / 1024);

  return { totalMb, usedMb };
}

function getLoad() {
  const [l1, l5, l15] = os.loadavg();
  return {
    load1: Math.round(l1 * 100) / 100,
    load5: Math.round(l5 * 100) / 100,
    load15: Math.round(l15 * 100) / 100
  };
}

function getIp() {
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const info of ifs[name] || []) {
      if (info && info.family === "IPv4" && !info.internal) return info.address;
    }
  }
  return null;
}

async function getNetKbps() {
  try {
    const txt = await fs.readFile("/proc/net/dev", "utf8");
    const lines = txt.split("\n").slice(2).map((x) => x.trim()).filter(Boolean);

    let rxBytes = 0;
    let txBytes = 0;

    for (const line of lines) {
      const [ifacePart, rest] = line.split(":");
      const iface = ifacePart.trim();
      if (iface === "lo") continue;

      const cols = rest.trim().split(/\s+/).map(Number);
      rxBytes += cols[0] || 0;
      txBytes += cols[8] || 0;
    }

    const now = Date.now();

    if (!lastNet) {
      lastNet = { rxBytes, txBytes, now };
      return { rxKbps: null, txKbps: null };
    }

    const dt = (now - lastNet.now) / 1000;
    if (dt <= 0) return { rxKbps: null, txKbps: null };

    const rxDelta = rxBytes - lastNet.rxBytes;
    const txDelta = txBytes - lastNet.txBytes;

    lastNet = { rxBytes, txBytes, now };

    const rxKbps = Math.round(((rxDelta * 8) / 1000 / dt) * 10) / 10;
    const txKbps = Math.round(((txDelta * 8) / 1000 / dt) * 10) / 10;

    return { rxKbps, txKbps };
  } catch {
    return { rxKbps: null, txKbps: null };
  }
}

async function postTelemetry(payload) {
  const res = await fetch(`${API_BASE}/api/pi/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(PI_TOKEN ? { "x-pi-token": PI_TOKEN } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`ingest failed ${res.status} ${t}`);
  }
}

async function tick() {
  const cpuTempC = await getCpuTempC();
  const cpuUsage = await getCpuUsagePct();
  const { load1, load5, load15 } = getLoad();
  const { totalMb: memTotalMb, usedMb: memUsedMb } = getMemoryMb();
  const { totalGb: diskTotalGb, usedGb: diskUsedGb } = await getDiskUsage();
  const { rxKbps, txKbps } = await getNetKbps();
  const uptimeS = Math.floor(os.uptime());
  const ip = getIp();

  const payload = {
    piId: PI_ID,
    name: PI_NAME,
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
  };

  await postTelemetry(payload);
  const stamp = new Date().toISOString();
  console.log(`[${stamp}] sent telemetry, temp ${cpuTempC}C, cpu ${cpuUsage}%`);
}

async function main() {
  console.log("Pi agent starting");
  console.log("API_BASE:", API_BASE);
  console.log("PI_ID:", PI_ID);

  await tick().catch((e) => console.error("first tick error:", e.message));

  setInterval(() => {
    tick().catch((e) => console.error("tick error:", e.message));
  }, INTERVAL_MS);
}

main();