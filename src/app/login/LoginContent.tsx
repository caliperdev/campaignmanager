"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push("/");
  }

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
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          padding: 32,
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-light)",
          boxSizing: "border-box",
        }}
      >
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            margin: "0 0 24px",
            textAlign: "center",
          }}
        >
          Sign in
        </h1>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label
              htmlFor="email"
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 14,
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <label
              htmlFor="password"
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 14,
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                boxSizing: "border-box",
              }}
            />
          </div>
          {error && (
            <p style={{ fontSize: 13, color: "#b91c1c", margin: 0 }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "12px 24px",
              fontSize: 14,
              fontWeight: 600,
              background: "var(--accent-dark)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-md)",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "20px 0 0", textAlign: "center" }}>
          <Link href="/" style={{ color: "var(--text-secondary)" }}>
            ← Back
          </Link>
        </p>
      </div>
    </div>
  );
}
