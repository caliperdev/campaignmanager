export function PageLoading() {
  return (
    <main
      className="page-responsive-padding"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary)",
        minHeight: 200,
      }}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="page-loading-spinner" aria-hidden />
      <p style={{ marginTop: 16, fontSize: 14, color: "var(--text-tertiary)" }}>Loading…</p>
    </main>
  );
}
