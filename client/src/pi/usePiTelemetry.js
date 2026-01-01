import { useEffect, useMemo, useState } from "react";
import { fetchPiDevices, fetchPiHistory, fetchPiLatest } from "./piApi";

export function usePiTelemetry({ pollMs = 2000 } = {}) {
  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);

  async function loadDevices() {
    try {
      const rows = await fetchPiDevices();
      const list = Array.isArray(rows) ? rows : [];
      setDevices(list);
      if (!selectedId && list[0]?.id) setSelectedId(list[0].id);
    } catch {}
  }

  async function loadTelemetry(id) {
    try {
      const a = await fetchPiLatest(id);
      const h = await fetchPiHistory(id, 200);
      setLatest(a?.latest || null);
      setHistory(Array.isArray(h) ? h : []);
    } catch {}
  }

  useEffect(() => {
    loadDevices();
    const t = setInterval(loadDevices, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadTelemetry(selectedId);
    const t = setInterval(() => loadTelemetry(selectedId), pollMs);
    return () => clearInterval(t);
  }, [selectedId, pollMs]);

  const device = useMemo(() => devices.find((d) => d.id === selectedId) || null, [devices, selectedId]);

  return {
    devices,
    selectedId,
    setSelectedId,
    device,
    latest,
    history
  };
}