"use client";

import { useRef, useState } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";

export type FilterPillOption = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: FilterPillOption[];
  emptyLabel: string;
  id: string;
  "aria-label": string;
  /** When true, no dropdown — display only with copy. */
  readOnly?: boolean;
};

export function FilterPillSelect({
  value,
  onChange,
  options,
  emptyLabel,
  id,
  "aria-label": ariaLabel,
  readOnly = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setOpen(false), open);

  const displayLabel = value ? (options.find((o) => o.value === value)?.label ?? value) : emptyLabel;

  const handleCopy = () => {
    const text = displayLabel;
    void navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1200);
    });
  };

  const handleSelect = (v: string) => {
    setOpen(false);
    if (v === value) return;
    onChange(v);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: 220, minWidth: 220 }}>
      <div className="filter-pill" data-dashboard>
        <button
          type="button"
          className="filter-pill-display"
          onClick={handleCopy}
          title="Click to copy"
          id={id}
        >
          {copyFeedback ? "Copied!" : displayLabel}
        </button>
        {!readOnly && (
          <div className="filter-pill-dropdown">
              <button
                type="button"
                className="filter-pill-trigger"
                onClick={() => setOpen((o) => !o)}
                aria-label={ariaLabel}
                aria-expanded={open}
                aria-haspopup="listbox"
              />
          </div>
        )}
      </div>
      {!readOnly && open && (
        <ul
          className="filter-pill-list"
          role="listbox"
          aria-labelledby={id}
          data-dashboard
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "100%",
            marginTop: 4,
            width: "100%",
            minWidth: "100%",
            maxWidth: "100%",
            boxSizing: "border-box",
          }}
        >
          <li
            role="option"
            aria-selected={!value}
            className="filter-pill-option"
            onClick={() => handleSelect("")}
          >
            {emptyLabel}
          </li>
          {options.map((opt) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={value === opt.value}
              className="filter-pill-option"
              onClick={() => handleSelect(opt.value)}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
