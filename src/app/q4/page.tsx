import { enforceNotReadOnly } from "@/lib/read-only-guard";

export const metadata = {
  title: "Q4 Strategy",
  description: "Q4 strategy view",
};

export default async function Q4Page() {
  await enforceNotReadOnly();
  return (
    <main
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg-primary)",
      }}
    >
      <p style={{ margin: 0, color: "var(--text-secondary)" }}>Q4 Strategy view – coming soon</p>
    </main>
  );
}
