export function matchesSearch(search: string, ...values: (string | undefined)[]): boolean {
  const q = search.toLowerCase().trim();
  if (!q) return true;
  return values.some((v) => v?.toLowerCase().includes(q));
}
