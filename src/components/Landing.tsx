import Link from "next/link";

export function Landing() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        boxSizing: "border-box",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            margin: "0 0 12px",
          }}
        >
          Campaign Manager
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "var(--text-secondary)",
            margin: "0 0 32px",
            lineHeight: 1.5,
          }}
        >
          Manage campaigns, import CSV, and plan flights in one place.
        </p>
        <Link
          href="/login"
          style={{
            display: "inline-block",
            padding: "12px 24px",
            background: "var(--accent-dark)",
            color: "#fff",
            borderRadius: "var(--radius-md)",
            fontWeight: 600,
            textDecoration: "none",
            transition: "background 0.2s",
          }}
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
