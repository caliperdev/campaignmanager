import { enforceNotReadOnly } from "@/lib/read-only-guard";

export const metadata = {
  title: "Analytics",
  description: "Campaign analytics",
};

export default async function AnalyticsPage() {
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
      <p style={{ margin: 0, color: "var(--text-secondary)" }}>Analytics – coming soon</p>
    </main>
  );
}
