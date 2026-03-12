"use client";

import { createContext, useCallback, useContext, useState } from "react";

const LoadingContext = createContext<{
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
} | null>(null);

export function useLoading() {
  const ctx = useContext(LoadingContext);
  if (!ctx) throw new Error("useLoading must be used within LoadingProvider");
  return ctx;
}

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const setLoading = useCallback((v: boolean) => setIsLoading(v), []);

  return (
    <LoadingContext.Provider value={{ isLoading, setLoading }}>
      {children}
      {isLoading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9998,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "auto",
          }}
        >
          {/* Blur orb: strongest in center, fades toward edges */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              maskImage: "radial-gradient(ellipse 50% 50% at 50% 50%, black 0%, transparent 70%)",
              WebkitMaskImage: "radial-gradient(ellipse 50% 50% at 50% 50%, black 0%, transparent 70%)",
            }}
          />
          <div
            style={{
              position: "relative",
              width: 48,
              height: 48,
              borderRadius: "50%",
              border: "3px solid var(--border-light)",
              borderTopColor: "var(--accent-mint)",
              animation: "design-layout-spin 0.8s linear infinite",
            }}
          />
        </div>
      )}
    </LoadingContext.Provider>
  );
}
