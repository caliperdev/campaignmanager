"use client";

import { ThemeProvider, createTheme } from "@mui/material/styles";
import { ConfirmProvider } from "@/components/ConfirmModal";
import { LoadingProvider } from "@/components/LoadingOverlay";
import { NavigationLoadingHandler } from "@/components/NavigationLoadingHandler";

const theme = createTheme({
  palette: {
    primary: { main: "#0d2b2a" },
    background: { default: "#ffffff", paper: "#f8f9fa" },
    text: { primary: "#111111", secondary: "#666666" },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <ConfirmProvider>
        <LoadingProvider>
          <NavigationLoadingHandler />
          {children}
        </LoadingProvider>
      </ConfirmProvider>
    </ThemeProvider>
  );
}
