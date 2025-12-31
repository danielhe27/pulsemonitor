export default function EndpointList({ endpoints, onRemove }) {
  if (endpoints.length === 0) return <p>No endpoints yet.</p>;

  return (
    <div>
      {endpoints.map((e) => (
        <div
          key={e.id}
          style={{ border: "1px solid #ddd", padding: 12, marginBottom: 8 }}
        >
          <b>{e.name}</b>
          <br />
          {e.method}, {e.url}
          <br />
          <button onClick={() => onRemove(e.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
}