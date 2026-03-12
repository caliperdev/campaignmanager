/**
 * Query Dataverse for latest date. Run: node scripts/latest-date.mjs
 */
import { readFileSync, existsSync } from "fs";
import { ConfidentialClientApplication } from "@azure/msal-node";

function loadEnvLocal() {
  const path = ".env.local";
  if (!existsSync(path)) {
    console.error("Missing .env.local");
    process.exit(1);
  }
  const content = readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnvLocal();

const DV_URL = process.env.DATAVERSE_ENVIRONMENT_URL?.replace(/\/$/, "") || "";
const DV_TENANT = process.env.DATAVERSE_TENANT_ID;
const DV_CLIENT = process.env.DATAVERSE_CLIENT_ID;
const DV_SECRET = process.env.DATAVERSE_CLIENT_SECRET;

async function main() {
  if (!DV_URL || !DV_TENANT || !DV_CLIENT || !DV_SECRET) {
    console.log("Dataverse not configured – set DATAVERSE_* in .env.local");
    process.exit(1);
  }
  const app = new ConfidentialClientApplication({
    auth: {
      authority: `https://login.microsoftonline.com/${DV_TENANT}`,
      clientId: DV_CLIENT,
      clientSecret: DV_SECRET,
    },
  });
  const r = await app.acquireTokenByClientCredential({ scopes: [`${DV_URL}/.default`] });
  if (!r?.accessToken) throw new Error("Dataverse token failed");
  const token = r.accessToken;

  const base = DV_URL + "/";
  const ioId = "1025316573";
  const filter = encodeURIComponent(`cr4fe_insertionordergid eq '${ioId}'`);
  const url = `${base}api/data/v9.2/cr4fe_dspalls?$select=cr4fe_date&$filter=${filter}&$orderby=cr4fe_date desc&$top=1`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
    },
  });
  if (!res.ok) {
    console.error("Dataverse error:", res.status, await res.text());
    process.exit(1);
  }
  const json = await res.json();
  const row = json.value?.[0];
  console.log(`Latest date (cr4fe_date) for insertion_order_id_dsp=${ioId}:`, row?.cr4fe_date ?? "(none)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
