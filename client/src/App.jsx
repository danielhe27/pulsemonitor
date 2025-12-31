import { useEffect, useState } from "react";

const API = "";

export default function App() {
  const [endpoints, setEndpoints] = useState([]);
  const [name, setName] = useState("");
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function loadEndpoints() {
    setMsg("");
    const res = await fetch(`${API}/api/endpoints`);
    const data = await res.json();
    setEndpoints(data);
  }

  useEffect(() => {
    loadEndpoints();
  }, []);

  async function addEndpoint(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/endpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, method, url })
      });

      const data = await res.json();

      if (!res.ok) {
        setMsg(data?.error || "Failed to add endpoint");
        setLoading(false);
        return;
      }

      setName("");
      setMethod("GET");
      setUrl("");
      setMsg("Added.");
      await loadEndpoints();
    } catch (err) {
      setMsg("Backend not reachable. Is it running on port 5050?");
    } finally {
      setLoading(false);
    }
  }

  async function removeEndpoint(id) {
    setMsg("");
    await fetch(`${API}/api/endpoints/${id}`, { method: "DELETE" });
    await loadEndpoints();
  }

  return (
    <div style={{ fontFamily: "Arial", padding: 24, maxWidth: 900 }}>
      <h1>PulseMonitor</h1>

      <form onSubmit={addEndpoint} style={{ display: "grid", gap: 10, marginBottom: 18 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Google"
            style={{ padding: 10 }}
          />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label>Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ padding: 10 }}>
            <option>GET</option>
            <option>POST</option>
            <option>PUT</option>
            <option>DELETE</option>
          </select>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label>URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.google.com"
            style={{ padding: 10 }}
          />
        </div>

        <button disabled={loading} style={{ padding: "10px 14px", width: 160 }}>
          {loading ? "Adding..." : "Add endpoint"}
        </button>

        {msg && <div style={{ marginTop: 6 }}>{msg}</div>}
      </form>

      <h2>Saved endpoints</h2>

      {endpoints.length === 0 ? (
        <p>No endpoints yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {endpoints.map((e) => (
            <div
              key={e.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: 12
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{e.name}</div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>
                  {e.method} , {e.url}
                </div>
              </div>

              <button onClick={() => removeEndpoint(e.id)} style={{ padding: "8px 12px" }}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}