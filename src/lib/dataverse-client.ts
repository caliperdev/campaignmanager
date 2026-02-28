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
 */
export async function getDataverseTables(): Promise<DataverseTableInfo[]> {
  const serverUrl = getServerUrl();
  const token = await getAccessToken();
  const url = `${serverUrl}api/data/v9.2/EntityDefinitions?$select=LogicalName,DisplayName,EntitySetName`;
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
    .filter((t) => t.entitySetName && t.logicalName);
}

/**
 * Fetch column names (from metadata) and all rows for an entity set. All values flattened to strings.
 */
export async function getDataverseTableData(
  entitySetName: string,
  logicalName: string
): Promise<{ columns: string[]; rows: Record<string, string>[] }> {
  const serverUrl = getServerUrl();
  const token = await getAccessToken();

  // Fetch attribute (column) metadata for this entity
  const metaUrl = `${serverUrl}api/data/v9.2/EntityDefinitions(LogicalName='${encodeURIComponent(logicalName)}')/Attributes?$select=LogicalName&$filter=AttributeType ne 'Virtual' and AttributeType ne 'Lookup' and AttributeType ne 'Owner'`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" },
  });
  if (!metaRes.ok) {
    throw new Error(`Dataverse metadata failed: ${metaRes.status} ${await metaRes.text()}`);
  }
  const metaJson = (await metaRes.json()) as { value?: { LogicalName?: string }[] };
  const columns = (metaJson.value ?? []).map((a) => String(a.LogicalName ?? "")).filter(Boolean);

  if (columns.length === 0) {
    return { columns: [], rows: [] };
  }

  const rows: Record<string, string>[] = [];
  let nextLink: string | null = null;
  const selectParam = columns.map((c) => encodeURIComponent(c)).join(",");

  do {
    const url =
      nextLink ??
      `${serverUrl}api/data/v9.2/${encodeURIComponent(entitySetName)}?$select=${selectParam}&$top=5000`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" },
    });
    if (!res.ok) {
      throw new Error(`Dataverse query failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { value?: Record<string, unknown>[]; "@odata.nextLink"?: string };
    const chunk = json.value ?? [];
    for (const record of chunk) {
      const row: Record<string, string> = {};
      for (const col of columns) {
        const v = record[col];
        if (v === null || v === undefined) {
          row[col] = "";
        } else if (typeof v === "object" && v !== null && "value" in v) {
          row[col] = String((v as { value?: unknown }).value ?? "");
        } else {
          row[col] = String(v);
        }
      }
      rows.push(row);
    }
    nextLink = json["@odata.nextLink"] ?? null;
  } while (nextLink);

  return { columns, rows };
}
