import { enforceNotReadOnly } from "@/lib/read-only-guard";

export const metadata = {
  title: "Assets",
  description: "Order assets",
};

export default async function AssetsPage() {
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
      <p style={{ margin: 0, color: "var(--text-secondary)" }}>Assets – coming soon</p>
    </main>
  );
}
