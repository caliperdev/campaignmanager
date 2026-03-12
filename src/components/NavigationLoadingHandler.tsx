"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useLoading } from "@/components/LoadingOverlay";

/** Sets loading on internal link clicks, clears when pathname or search params change. */
export function NavigationLoadingHandler() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setLoading } = useLoading();
  const prevRoute = useRef(pathname + (typeof window !== "undefined" ? window.location.search : ""));

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const currentPath = pathname + (typeof window !== "undefined" ? window.location.search : "");

      // Navigable rows (client, agency, advertiser, campaign, order, placement)
      // Skip when clicking control-group (edit/delete buttons) - those open modals, not navigation
      const navigable = target.closest("[data-navigates]");
      if (navigable && !target.closest(".control-group")) {
        const href = navigable.getAttribute("data-href");
        if (href && !href.startsWith("http")) {
          const [path, qs] = href.split("?");
          const targetRoute = path + (qs ? `?${qs}` : "");
          if (targetRoute !== currentPath) setLoading(true);
        }
        return;
      }

      if (target.closest('button, [role="button"]')) return;
      const anchor = target.closest('a[href^="/"]');
      if (anchor && anchor.getAttribute("href") !== "#" && !anchor.hasAttribute("download")) {
        const href = anchor.getAttribute("href");
        if (href && !href.startsWith("http")) {
          const [path, qs] = href.split("?");
          const targetRoute = path + (qs ? `?${qs}` : "");
          if (targetRoute !== currentPath) setLoading(true);
        }
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [pathname, setLoading]);

  useEffect(() => {
    const route = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
    if (prevRoute.current !== route) {
      prevRoute.current = route;
      const t = setTimeout(() => setLoading(false), 150);
      return () => clearTimeout(t);
    }
  }, [pathname, searchParams, setLoading]);

  return null;
}
