import Papa from "papaparse";

/** One row in the preview (no DB write). Keys = first row headers. */
export interface CsvPreviewRow {
  rowNum: number;
  values: Record<string, string>;
}

export interface CsvPreviewResult {
  /** Column names from first row of CSV. */
  headers: string[];
  rows: CsvPreviewRow[];
  rowCount: number;
}

/** Parse CSV only; first row = headers, rest = data. No validation, no Supabase. */
export async function previewCsv(formData: FormData): Promise<CsvPreviewResult> {
  const file = formData.get("file") as File | null;
  const empty: CsvPreviewResult = { headers: [], rows: [], rowCount: 0 };
  if (!file) return empty;

  const text = await file.text();
  const { data, meta } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = meta?.fields ?? (data?.[0] ? Object.keys(data[0]) : []);
  const rows: CsvPreviewRow[] = (data ?? []).map((raw, i) => ({
    rowNum: i + 2,
    values: { ...raw },
  }));

  return { headers, rows, rowCount: rows.length };
}
