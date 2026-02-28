/**
 * Server-only guard for the read-only Monitor share view.
 * Do not import from client code.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const READ_ONLY_EMAIL_KEY = "READ_ONLY_MONITOR_EMAIL";
const FULL_ACCESS_EMAILS_KEY = "FULL_ACCESS_EMAILS";

function normalizedConfigEmail(): string | null {
  const raw = process.env[READ_ONLY_EMAIL_KEY];
  if (raw == null || typeof raw !== "string") return null;
  return raw.trim().toLowerCase() || null;
}

/** Comma-separated list of emails that always get full access (same as test user). */
function getFullAccessEmails(): Set<string> {
  const raw = process.env[FULL_ACCESS_EMAILS_KEY];
  if (raw == null || typeof raw !== "string") return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
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

/** True only when READ_ONLY_MONITOR_EMAIL is set and the current user's email matches it (and user is not in FULL_ACCESS_EMAILS). */
export async function isReadOnlyMonitorUser(): Promise<boolean> {
  const userEmail = await getCurrentUserEmail();
  if (!userEmail) return false;
  if (getFullAccessEmails().has(userEmail)) return false;
  const configEmail = normalizedConfigEmail();
  if (!configEmail) return false;
  return userEmail === configEmail;
}

/** Redirect read-only users to /monitor. Call at the top of any protected page server component (except /monitor). */
export async function enforceNotReadOnly(): Promise<void> {
  if (await isReadOnlyMonitorUser()) {
    redirect("/monitor");
  }
}
