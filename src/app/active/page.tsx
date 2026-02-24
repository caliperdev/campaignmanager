import { enforceNotReadOnly } from "@/lib/read-only-guard";

export const metadata = {
  title: "Active",
  description: "All active campaigns",
};

export default async function ActivePage() {
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
      <p style={{ margin: 0, color: "var(--text-secondary)" }}>All Active view – coming soon</p>
    </main>
  );
}
