import { enforceNotReadOnly } from "@/lib/read-only-guard";

export const metadata = {
  title: "Review",
  description: "Review pending campaigns",
};

export default async function ReviewPage() {
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
      <p style={{ margin: 0, color: "var(--text-secondary)" }}>Review Pending view – coming soon</p>
    </main>
  );
}
