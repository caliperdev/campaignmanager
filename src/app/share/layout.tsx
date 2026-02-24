"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push("/");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-primary)" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          borderBottom: "1px solid var(--border-light)",
          background: "var(--bg-secondary)",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
          Monitor — View only
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          style={{
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 500,
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-primary)",
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
