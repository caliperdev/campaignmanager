import Link from "next/link";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { NewAdvertiserForm } from "./NewAdvertiserForm";

export const metadata = {
  title: "New advertiser",
  description: "Create a new advertiser",
};

export default async function NewAdvertiserPage() {
  await enforceNotReadOnly();

  return (
    <main
      className="page-responsive-padding"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-primary)",
        overflow: "auto",
      }}
    >
      <div
        style={{
          padding: "8px 32px",
          borderBottom: "1px solid var(--border-light)",
          background: "var(--bg-secondary)",
          fontSize: 13,
          color: "var(--text-tertiary)",
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Link href="/advertisers" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
          Advertisers
        </Link>
        <span style={{ margin: "0 4px" }}>/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>New advertiser</span>
      </div>

      <div style={{ padding: 32, maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 24px" }}>
          New advertiser
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>
          Create a new advertiser. Campaigns will be linked to advertisers.
        </p>
        <NewAdvertiserForm />
      </div>
    </main>
  );
}
