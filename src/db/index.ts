import { createClient } from "@supabase/supabase-js";
import { createRateLimitedFetch } from "@/lib/rate-limit";

/**
 * Supabase is the only data layer: all tables live in Supabase and are accessed
 * via the Supabase JS API (no direct Postgres connection, no other ORM/DB).
 * Requests are rate-limited to 120 per minute to stay under Supabase project limits.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const rateLimitedFetch = createRateLimitedFetch(fetch);

/** Server-only Supabase client (bypasses RLS). Use in server actions and API routes. */
export const supabase = createClient(url, serviceRoleKey, {
  global: { fetch: rateLimitedFetch },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
