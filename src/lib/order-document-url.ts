/** Client-safe: returns public URL for order document in storage. */
export function getOrderDocumentUrl(documentPath: string | null | undefined): string | null {
  if (!documentPath?.trim()) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/order_documents/${documentPath}`;
}
