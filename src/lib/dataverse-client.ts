/**
 * Server-only Dataverse client. Uses env vars for credentials; never expose to client.
 * Requires: DATAVERSE_TENANT_ID, DATAVERSE_CLIENT_ID, DATAVERSE_CLIENT_SECRET, DATAVERSE_ENVIRONMENT_URL
 */
import { ConfidentialClientApplication } from "@azure/msal-node";

const ENV_URL = process.env.DATAVERSE_ENVIRONMENT_URL;
const TENANT_ID = process.env.DATAVERSE_TENANT_ID;
const CLIENT_ID = process.env.DATAVERSE_CLIENT_ID;
const CLIENT_SECRET = process.env.DATAVERSE_CLIENT_SECRET;

export function isDataverseConfigured(): boolean {
  return !!(ENV_URL && TENANT_ID && CLIENT_ID && CLIENT_SECRET);
}

function getServerUrl(): string {
  const base = (ENV_URL ?? "").trim();
  return base.endsWith("/") ? base : `${base}/`;
}

function getScope(): string {
  const base = (ENV_URL ?? "").trim().replace(/\/$/, "");
  return `${base}/.default`;
}

let msalApp: ConfidentialClientApplication | null = null;

function getMsalApp(): ConfidentialClientApplication {
  if (!msalApp) {
    if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
      throw new Error("Dataverse env vars not set");
    }
    msalApp = new ConfidentialClientApplication({
      auth: {
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
      },
    });
  }
  return msalApp;
}

async function getAccessToken(): Promise<string> {
  const app = getMsalApp();
  const scope = getScope();
  const result = await app.acquireTokenByClientCredential({ scopes: [scope] });
  if (!result?.accessToken) {
    throw new Error("Failed to acquire Dataverse token");
  }
  return result.accessToken;
}

export interface DataverseTableInfo {
  logicalName: string;
  displayName: string;
  entitySetName: string;
}

/**
 * List Dataverse tables. Returns logical name, display name, and entity set name.
 * Only includes tables whose entity set name starts with "cr4fe_" (custom tables).
 * Fetches without $select to avoid "query parameter not supported" in some environments.
 */
export async function getDataverseTables(): Promise<DataverseTableInfo[]> {
  const serverUrl = getServerUrl();
  const token = await getAccessToken();
  const url = `${serverUrl}api/data/v9.2/EntityDefinitions`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
    },
  });
  if (!res.ok) {
    throw new Error(`Dataverse EntityDefinitions failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { value?: Record<string, unknown>[] };
  const value = json.value ?? [];
  return value
    .map((row: Record<string, unknown>) => {
      const display = row.DisplayName;
      let displayName = String(row.LogicalName ?? "");
      if (display != null && typeof display === "object" && "UserLocalizedLabel" in display) {
        const label = (display as { UserLocalizedLabel?: { Label?: string } }).UserLocalizedLabel?.Label;
        if (label) displayName = label;
      } else if (typeof display === "string") {
        displayName = display;
      }
      return {
        logicalName: String(row.LogicalName ?? ""),
        displayName: displayName || String(row.LogicalName ?? ""),
        entitySetName: String(row.EntitySetName ?? row.LogicalName ?? ""),
      };
    })
    .filter((t) => t.entitySetName && t.logicalName && t.entitySetName.startsWith("cr4fe_"));
}

const DATAVERSE_HEADERS = {
  Authorization: (token: string) => `Bearer ${token}`,
  Accept: "application/json",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
} as const;

function flattenValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v !== null && "value" in v) return String((v as { value?: unknown }).value ?? "");
  return String(v);
}

/** Build a user-friendly error message for Dataverse 403 (missing privilege). */
function dataverseErrorMessage(status: number, bodyText: string): string {
  if (status === 403) {
    try {
      const json = JSON.parse(bodyText) as { error?: { message?: string } };
      const msg = json?.error?.message ?? "";
      if (msg.includes("missing") && msg.includes("privilege")) {
        return `Dataverse returned 403: The application user does not have permission to read this table. In Power Platform, add Read privilege for this entity to the security role assigned to the "Dataverse to Campaign Manager" application user. Details: ${msg}`;
      }
      if (msg) return `Dataverse 403: ${msg}`;
    } catch {
      // ignore parse errors
    }
  }
  return `Dataverse request failed: ${status} ${bodyText}`;
}

/**
 * Derive selectable columns from a probe request ($top=1, no $select). Uses only property names the API actually returns.
 */
async function getSelectableColumns(
  serverUrl: string,
  token: string,
  entitySetName: string
): Promise<string[]> {
  const url = `${serverUrl}api/data/v9.2/${encodeURIComponent(entitySetName)}?$top=1`;
  const res = await fetch(url, {
    headers: {
      Authorization: DATAVERSE_HEADERS.Authorization(token),
      Accept: DATAVERSE_HEADERS.Accept,
      "OData-MaxVersion": DATAVERSE_HEADERS["OData-MaxVersion"],
      "OData-Version": DATAVERSE_HEADERS["OData-Version"],
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(dataverseErrorMessage(res.status, body));
  }
  const json = (await res.json()) as { value?: Record<string, unknown>[] };
  const first = (json.value ?? [])[0];
  if (!first || typeof first !== "object") return [];
  return Object.keys(first).filter((k) => !k.startsWith("@"));
}

/**
 * Fetch one chunk of rows from Dataverse with total count. Uses probe to get valid $select columns (avoids 400 on non-selectable attributes like createdbyname).
 * CRM does not support $skip; only the first page (offset=0) is returned; for offset>0 returns empty rows (use @odata.nextLink/skiptoken for paging if needed later).
 */
export async function getDataverseTableChunk(
  entitySetName: string,
  _logicalName: string,
  offset: number,
  limit: number
): Promise<{ columns: string[]; rows: Record<string, string>[]; total: number }> {
  const serverUrl = getServerUrl();
  const token = await getAccessToken();

  const columns = await getSelectableColumns(serverUrl, token, entitySetName);
  if (columns.length === 0) {
    return { columns: [], rows: [], total: 0 };
  }

  const selectParam = columns.map((c) => encodeURIComponent(c)).join(",");
  const countUrl = `${serverUrl}api/data/v9.2/${encodeURIComponent(entitySetName)}?$count=true&$top=0`;
  const countRes = await fetch(countUrl, {
    headers: {
      Authorization: DATAVERSE_HEADERS.Authorization(token),
      Accept: DATAVERSE_HEADERS.Accept,
      "OData-MaxVersion": DATAVERSE_HEADERS["OData-MaxVersion"],
      "OData-Version": DATAVERSE_HEADERS["OData-Version"],
    },
  });
  let total = 0;
  if (countRes.ok) {
    const countJson = (await countRes.json()) as { "@odata.count"?: number };
    total = Number(countJson["@odata.count"]) || 0;
  }

  // Dataverse does not support $skip; only fetch first page (offset=0)
  if (offset > 0) {
    return { columns, rows: [], total };
  }
  const dataUrl = `${serverUrl}api/data/v9.2/${encodeURIComponent(entitySetName)}?$select=${selectParam}&$top=${limit}`;
  const dataRes = await fetch(dataUrl, {
    headers: {
      Authorization: DATAVERSE_HEADERS.Authorization(token),
      Accept: DATAVERSE_HEADERS.Accept,
      "OData-MaxVersion": DATAVERSE_HEADERS["OData-MaxVersion"],
      "OData-Version": DATAVERSE_HEADERS["OData-Version"],
    },
  });
  if (!dataRes.ok) {
    const body = await dataRes.text();
    throw new Error(dataverseErrorMessage(dataRes.status, body));
  }
  const dataJson = (await dataRes.json()) as { value?: Record<string, unknown>[] };
  const chunk = dataJson.value ?? [];
  const rows: Record<string, string>[] = chunk.map((record, idx) => {
    const row: Record<string, string> = {};
    for (const col of columns) {
      row[col] = flattenValue(record[col]);
    }
    row.id = String(offset + idx + 1);
    return row;
  });

  return { columns, rows, total };
}

const PAGE_SIZE = 5000;

/** Resolve nextLink to absolute URL (Dataverse may return relative). */
function resolveNextLink(nextLink: string, serverUrl: string): string {
  if (nextLink.startsWith("http://") || nextLink.startsWith("https://")) {
    return nextLink;
  }
  const base = serverUrl.replace(/\/$/, "");
  return nextLink.startsWith("/") ? `${base}${nextLink}` : `${base}/${nextLink}`;
}

/**
 * Fetch the entire Dataverse table: all columns and all rows, paging via @odata.nextLink.
 * Handles >5000 rows by following $skiptoken in nextLink until complete.
 * Uses Prefer: odata.maxpagesize=5000 and $orderby on primary key for deterministic paging.
 */
export async function getDataverseTableFull(
  entitySetName: string,
  logicalName: string
): Promise<{ columns: string[]; rows: Record<string, string>[]; total: number }> {
  const serverUrl = getServerUrl();
  const token = await getAccessToken();

  const columns = await getSelectableColumns(serverUrl, token, entitySetName);
  if (columns.length === 0) {
    return { columns: [], rows: [], total: 0 };
  }

  const selectParam = columns.map((c) => encodeURIComponent(c)).join(",");
  const primaryKeyCol = columns.find((c) => c.toLowerCase() === `${logicalName.toLowerCase()}id`) ?? columns[0];
  const orderBy = encodeURIComponent(primaryKeyCol);
  const firstUrl = `${serverUrl}api/data/v9.2/${encodeURIComponent(entitySetName)}?$select=${selectParam}&$orderby=${orderBy}&$top=${PAGE_SIZE}&$count=true`;
  const headers: Record<string, string> = {
    Authorization: DATAVERSE_HEADERS.Authorization(token),
    Accept: DATAVERSE_HEADERS.Accept,
    "OData-MaxVersion": DATAVERSE_HEADERS["OData-MaxVersion"],
    "OData-Version": DATAVERSE_HEADERS["OData-Version"],
    "Prefer": "odata.maxpagesize=5000",
  };

  const allRows: Record<string, string>[] = [];
  let total = 0;
  let nextLink: string | null = firstUrl;

  while (nextLink) {
    const url = resolveNextLink(nextLink, serverUrl);
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(dataverseErrorMessage(res.status, body));
    }
    const json = (await res.json()) as {
      value?: Record<string, unknown>[];
      "@odata.count"?: number;
      "@odata.nextLink"?: string;
    };
    const chunk = json.value ?? [];
    total = (Number(json["@odata.count"]) ?? total) || (allRows.length + chunk.length);
    for (let idx = 0; idx < chunk.length; idx++) {
      const record = chunk[idx];
      const row: Record<string, string> = {};
      for (const col of columns) {
        row[col] = flattenValue(record[col]);
      }
      row.id = String(allRows.length + idx + 1);
      allRows.push(row);
    }
    nextLink = json["@odata.nextLink"] ?? null;
  }

  if (total === 0 && allRows.length > 0) total = allRows.length;
  return { columns, rows: allRows, total };
}
