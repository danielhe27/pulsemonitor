import { useEffect, useState } from "react";
import EndpointForm from "./components/EndpointForm.jsx";
import EndpointList from "./components/EndpointList.jsx";

export default function App() {
  const [form, setForm] = useState({ name: "", method: "GET", url: "" });
  const [endpoints, setEndpoints] = useState([]);

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>PulseCheck</h1>
      <p>Website and API monitoring dashboard</p>

      <EndpointForm
        form={form}
        setForm={setForm}
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.name || !form.url) return;

          setEndpoints((prev) => [
            ...prev,
            { id: Date.now(), name: form.name, method: form.method, url: form.url },
          ]);

          setForm({ name: "", method: "GET", url: "" });
        }}
      />

      <h2>Endpoints</h2>
      <EndpointList
        endpoints={endpoints}
        onRemove={(id) => setEndpoints((prev) => prev.filter((x) => x.id !== id))}
      />
    </div>
  );
}