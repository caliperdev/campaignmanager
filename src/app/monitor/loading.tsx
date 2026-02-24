export default function MonitorLoading() {
  return (
    <main
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        padding: "32px",
        background: "var(--bg-primary)",
        overflow: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div
            style={{
              width: 120,
              height: 24,
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-secondary)",
            }}
          />
          <div
            style={{
              width: 320,
              height: 16,
              marginTop: 8,
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-secondary)",
            }}
          />
          <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
            <div
              style={{
                width: 160,
                height: 40,
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-secondary)",
              }}
            />
            <div
              style={{
                width: 160,
                height: 40,
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-secondary)",
              }}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div
            style={{
              width: 130,
              height: 36,
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-secondary)",
            }}
          />
          <div
            style={{
              width: 180,
              height: 36,
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-secondary)",
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div
          style={{
            width: 280,
            height: 14,
            marginBottom: 12,
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-secondary)",
          }}
        />
        <div
          style={{
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-secondary)",
            padding: 16,
            height: 300,
          }}
        />
      </div>

      <div
        style={{
          marginTop: 24,
          border: "1px solid var(--border-light)",
          borderRadius: "var(--radius-md)",
          background: "var(--bg-secondary)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-light)", display: "flex", gap: 16 }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 16,
                borderRadius: "var(--radius-sm)",
                background: "var(--border-light)",
              }}
            />
          ))}
        </div>
        <div style={{ padding: 16 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 16,
                marginBottom: 8,
              }}
            >
              {[1, 2, 3, 4].map((j) => (
                <div
                  key={j}
                  style={{
                    flex: 1,
                    height: 20,
                    borderRadius: "var(--radius-sm)",
                    background: "var(--border-light)",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
