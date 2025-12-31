export default function EndpointForm({ form, setForm, onSubmit }) {
  return (
    <form onSubmit={onSubmit} style={{ marginBottom: 24 }}>
      <div>
        <label>Name</label><br />
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>

      <div>
        <label>Method</label><br />
        <select
          value={form.method}
          onChange={(e) => setForm({ ...form, method: e.target.value })}
        >
          <option>GET</option>
          <option>POST</option>
          <option>PUT</option>
          <option>DELETE</option>
        </select>
      </div>

      <div>
        <label>URL</label><br />
        <input
          placeholder="https://example.com"
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
        />
      </div>

      <button type="submit" style={{ marginTop: 10 }}>
        Add endpoint
      </button>
    </form>
  );
}