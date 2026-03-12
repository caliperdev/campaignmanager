import Link from "next/link";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { NewClientForm } from "./NewClientForm";

export const metadata = {
  title: "New Client",
  description: "Create a new client",
};

export default async function NewClientPage() {
  await enforceNotReadOnly();

  return (
    <main className="main-content" style={{ padding: 32, maxWidth: 480 }}>
      <div
        style={{
          marginBottom: 24,
          fontSize: 13,
          color: "var(--text-tertiary)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Link href="/clients" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
          Clients
        </Link>
        <span>/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>New client</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 24px" }}>New client</h1>
      <NewClientForm />
    </main>
  );
}
