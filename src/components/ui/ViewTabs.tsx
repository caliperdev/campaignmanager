"use client";

export interface ViewTabItem {
  id: string;
  label: string;
}

export interface ViewTabsProps {
  tabs: ViewTabItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function ViewTabs({ tabs, activeId, onSelect }: ViewTabsProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: "4px",
        background: "var(--bg-secondary)",
        padding: "4px",
        borderRadius: "var(--radius-md)",
      }}
    >
      {tabs.map((tab) => {
        const active = activeId === tab.id;
        return (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={active}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelect(tab.id);
            }}
            style={{
              padding: "6px 12px",
              fontSize: "13px",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              transition: "color 0.2s, background 0.2s, box-shadow 0.2s, font-weight 0.2s",
              background: active ? "var(--bg-primary)" : "transparent",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
              fontWeight: active ? 500 : 400,
            }}
          >
            {tab.label}
          </div>
        );
      })}
    </div>
  );
}
