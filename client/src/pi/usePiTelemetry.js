// src/pi/usePiTelemetry.js
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPiDevices, fetchPiHistory, fetchPiLatest } from "./piApi";

export function usePiTelemetry({ pollMs = 2000 } = {}) {
  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState(""); // keep as string for <select>
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);

  // Keep the latest selectedId available to intervals without stale closures
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  async function loadDevices() {
    try {
      const rows = await fetchPiDevices();
      const list = Array.isArray(rows) ? rows : [];

      setDevices(list);

      // If nothing selected yet, select first device ONCE
      setSelectedId((prev) => {
        if (prev) return prev;
        const first = list[0]?.id;
        return first != null ? String(first) : "";
      });
    } catch {
      // ignore
    }
  }

async function loadTelemetry(idStr) {
  try {
    if (!idStr) return;

    // Convert to number if your API expects numeric IDs
    const id = Number(idStr);
    const idToUse = Number.isFinite(id) ? id : idStr;

    // 1) LOG what device we are polling
    console.log("[PI] polling id:", idToUse);

    const a = await fetchPiLatest(idToUse);
    const h = await fetchPiHistory(idToUse, 200);

    // 2) LOG raw responses
    console.log("[PI] latest raw response:", a);
    console.log("[PI] history raw response:", h);

    // Accept both shapes:
    const latestRow = a?.latest ?? a ?? null;

    // 3) LOG the parsed row and the ts specifically
    console.log("[PI] latestRow parsed:", latestRow);
    console.log("[PI] latestRow.ts:", latestRow?.ts);

    setLatest(latestRow);

    // history could be { rows: [...] } or just [...]
    const histArr = h?.rows ?? h?.history ?? (Array.isArray(h) ? h : []);
    console.log("[PI] history count:", Array.isArray(histArr) ? histArr.length : "not array");
    console.log("[PI] history first row:", Array.isArray(histArr) ? histArr[0] : null);

    setHistory(histArr);
  } catch (err) {
    // 4) DO NOT ignore errors while debugging
    console.error("[PI] loadTelemetry error:", err);
  }
}

  // Load devices (and refresh list)
  useEffect(() => {
    loadDevices();
    const t = setInterval(loadDevices, 5000);
    return () => clearInterval(t);
  }, []);

  // Poll telemetry for selected device
  useEffect(() => {
    if (!selectedId) return;

    loadTelemetry(selectedId);
    const t = setInterval(() => loadTelemetry(selectedIdRef.current), pollMs);

    return () => clearInterval(t);
  }, [selectedId, pollMs]);

  const device = useMemo(() => {
    // Compare as string to avoid number vs string mismatch
    return devices.find((d) => String(d.id) === String(selectedId)) || null;
  }, [devices, selectedId]);

  return {
    devices,
    selectedId,
    setSelectedId,
    device,
    latest,
    history
  };
}