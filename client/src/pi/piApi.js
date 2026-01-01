const API = "";

export async function fetchPiDevices() {
  const res = await fetch(`${API}/api/pi/devices`);
  return res.json();
}

export async function fetchPiLatest(piId) {
  const res = await fetch(`${API}/api/pi/latest/${piId}`);
  return res.json();
}

export async function fetchPiHistory(piId, limit = 200) {
  const res = await fetch(`${API}/api/pi/history/${piId}?limit=${limit}`);
  return res.json();
}