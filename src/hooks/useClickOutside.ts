"use client";

import { useEffect, type RefObject } from "react";

/**
 * Calls `onClose` when a mousedown happens outside the element attached to `ref`.
 * Used for closing dropdowns/popovers on outside click.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [ref, onClose, enabled]);
}
