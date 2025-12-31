import { useEffect, useState } from "react";
import EndpointForm from "./components/EndpointForm.jsx";
import EndpointList from "./components/EndpointList.jsx";

export default function App() {
  const [form, setForm] = useState({ name: "", method: "GET", url: "" });
  const [endpoints, setEndpoints] = useState([]);

  useEffect(() => {
    fetch("http://localhost:5000/api/endpoints")
      .then((r) => r.json())
      .then(setEndpoints)
      .catch(console.error);
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>PulseCheck</h1>
      <p>Website and API monitoring dashboard</p>

      <EndpointForm
        form={form}
        setForm={setForm}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.name || !form.url) return;

          const res = await fetch("http://localhost:5000/api/endpoints", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          });

          const created = await res.json();
          if (!res.ok) {
            console.error(created);
            return;
          }

          setEndpoints((prev) => [...prev, created]);
          setForm({ name: "", method: "GET", url: "" });
        }}
      />

      <h2>Endpoints</h2>
      <EndpointList
        endpoints={endpoints}
        onRemove={async (id) => {
          const res = await fetch(`http://localhost:5000/api/endpoints/${id}`, {
            method: "DELETE",
          });

          if (!res.ok) {
            console.error("Delete failed");
            return;
          }

          setEndpoints((prev) => prev.filter((x) => x.id !== id));
        }}
      />
    </div>
  );
}