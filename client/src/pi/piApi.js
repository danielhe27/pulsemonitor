const API = "";

async function fetchJSON(url) {
  const sep = url.includes("?") ? "&" : "?";
  const bust = `${sep}t=${Date.now()}`;

  const res = await fetch(`${url}${bust}`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" }
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }

  return data;
}

export function fetchPiDevices() {
  return fetchJSON(`${API}/api/pi/devices`);
}

export function fetchPiLatest(piId) {
  return fetchJSON(`${API}/api/pi/latest/${piId}`);
}

export function fetchPiHistory(piId, limit = 200) {
  return fetchJSON(`${API}/api/pi/history/${piId}?limit=${limit}`);
}