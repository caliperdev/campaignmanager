/**
 * Server-only guard for the read-only Monitor share view.
 * Do not import from client code.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const READ_ONLY_EMAIL_KEY = "READ_ONLY_MONITOR_EMAIL";

function normalizedConfigEmail(): string | null {
  const raw = process.env[READ_ONLY_EMAIL_KEY];
  if (raw == null || typeof raw !== "string") return null;
  return raw.trim().toLowerCase() || null;
}

/** Get the current user's email from the session, or null if not authenticated. */
export async function getCurrentUserEmail(): Promise<string | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email;
  if (email == null || typeof email !== "string") return null;
  return email.trim().toLowerCase();
}

/** True only when READ_ONLY_MONITOR_EMAIL is set and the current user's email matches it. */
export async function isReadOnlyMonitorUser(): Promise<boolean> {
  const configEmail = normalizedConfigEmail();
  if (!configEmail) return false;
  const userEmail = await getCurrentUserEmail();
  if (!userEmail) return false;
  return userEmail === configEmail;
}

/** Redirect read-only users to /share. Call at the top of any protected page server component. */
export async function enforceNotReadOnly(): Promise<void> {
  if (await isReadOnlyMonitorUser()) {
    redirect("/share");
  }
}
