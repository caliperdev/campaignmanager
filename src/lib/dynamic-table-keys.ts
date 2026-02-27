/**
 * Sanitize a display column name to the identifier used in the DB.
 * Must match _csv_sanitize_ident in supabase/migrations/014_create_csv_import_table_rpc.sql
 * so that dynamic table rows (keyed by sanitized names) can be read by display header.
 */
export function sanitizeDynamicColumnKey(header: string): string {
  const s = String(header ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return s.slice(0, 63) || "col";
}
