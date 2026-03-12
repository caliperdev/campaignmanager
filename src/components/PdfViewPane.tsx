"use client";

/** A4 at 96dpi: 297mm ≈ 1123px height */
const A4_HEIGHT = 1123;

const paneStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: "min(50vw, 850px)",
  maxWidth: "100%",
  zIndex: 101,
  background: "var(--bg-primary)",
  borderLeft: "1px solid var(--border-light)",
  boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
  display: "flex",
  flexDirection: "column",
};
const headerStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid var(--border-light)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexShrink: 0,
};
const scrollAreaStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  padding: 16,
};
const iframeWrapperStyle: React.CSSProperties = {
  width: "100%",
  minHeight: A4_HEIGHT,
  background: "#fff",
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
};
const iframeStyle: React.CSSProperties = {
  width: "100%",
  height: A4_HEIGHT,
  border: "none",
  display: "block",
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string | null;
  title?: string;
};

export function PdfViewPane({ isOpen, onClose, pdfUrl, title = "IO PDF" }: Props) {
  if (!isOpen) return null;
  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          background: "rgba(0,0,0,0.3)",
          pointerEvents: "auto",
        }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={paneStyle}
      >
        <div style={headerStyle}>
          <span style={{ fontWeight: 600, fontSize: 16 }}>{title}</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
        <div style={scrollAreaStyle}>
          {pdfUrl ? (
            <div style={iframeWrapperStyle}>
              <iframe src={pdfUrl} title={title} style={iframeStyle} />
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200, color: "var(--text-tertiary)", fontSize: 14 }}>
              No PDF available
            </div>
          )}
        </div>
      </div>
    </>
  );
}
