/**
 * Mini test: verify placement × source join keys match.
 * Run: node scripts/test-join.mjs
 * Loads .env.local from project root (same as Next.js).
 */
import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { ConfidentialClientApplication } from "@azure/msal-node";

function loadEnvLocal() {
  const path = ".env.local";
  if (!existsSync(path)) {
    console.error("Missing .env.local – copy from .env.example and fill values.");
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DV_URL = process.env.DATAVERSE_ENVIRONMENT_URL;
const DV_TENANT = process.env.DATAVERSE_TENANT_ID;
const DV_CLIENT = process.env.DATAVERSE_CLIENT_ID;
const DV_SECRET = process.env.DATAVERSE_CLIENT_SECRET;

async function getDataverseToken() {
  const app = new ConfidentialClientApplication({
    auth: {
      authority: `https://login.microsoftonline.com/${DV_TENANT}`,
      clientId: DV_CLIENT,
      clientSecret: DV_SECRET,
    },
  });
  const scope = `${DV_URL.replace(/\/$/, "")}/.default`;
  const r = await app.acquireTokenByClientCredential({ scopes: [scope] });
  if (!r?.accessToken) throw new Error("Dataverse token failed");
  return r.accessToken;
}

async function main() {
  console.log("=== Placement × Source Join Test ===\n");

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing Supabase env vars.");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1. Get a source (Dataverse)
  const { data: sources, error: srcErr } = await supabase
    .from("sources")
    .select("id, name, entity_set_name, logical_name")
    .not("entity_set_name", "is", null)
    .limit(1);
  if (srcErr || !sources?.length) {
    console.error("No Dataverse source found:", srcErr?.message || "empty");
    process.exit(1);
  }
  const src = sources[0];
  console.log("Source:", src.name, `(${src.entity_set_name})\n`);

  // 2. Get placements with insertion_order_id_dsp
  const { data: placements, error: plErr } = await supabase
    .from("placements")
    .select("id, order_id, insertion_order_id_dsp, placement")
    .not("insertion_order_id_dsp", "is", null)
    .neq("insertion_order_id_dsp", "")
    .limit(5);
  if (plErr || !placements?.length) {
    console.error("No placements with insertion_order_id_dsp:", plErr?.message || "empty");
    process.exit(1);
  }

  console.log("Placements (Supabase):");
  placements.forEach((p) => {
    console.log(`  id=${p.id} insertion_order_id_dsp="${p.insertion_order_id_dsp}" placement="${p.placement || ""}"`);
  });
  console.log("");

  if (!DV_URL || !DV_TENANT || !DV_CLIENT || !DV_SECRET) {
    console.log("Dataverse not configured – skipping Dataverse fetch.");
    console.log("Set DATAVERSE_* in .env.local to test full join.");
    return;
  }

  const token = await getDataverseToken();
  const base = DV_URL.endsWith("/") ? DV_URL : DV_URL + "/";

  // 3. For each placement, query Dataverse with $filter
  const filterCol = "cr4fe_insertionordergid";
  for (const p of placements) {
    const val = p.insertion_order_id_dsp;
    const esc = String(val).replace(/'/g, "''");
    const filter = encodeURIComponent(`${filterCol} eq '${esc}'`);
    const url = `${base}api/data/v9.2/${encodeURIComponent(src.entity_set_name)}?$filter=${filter}&$top=5&$count=true`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
      },
    });
    if (!res.ok) {
      console.log(`  ${val}: Dataverse error ${res.status}`);
      continue;
    }
    const json = await res.json();
    const rows = json.value ?? [];
    const count = json["@odata.count"] ?? rows.length;
    const match = count > 0 ? "MATCH" : "no match";
    console.log(`  insertion_order_id_dsp="${val}" -> Dataverse ${filterCol}: ${count} row(s) [${match}]`);
    if (rows.length > 0) {
      const first = rows[0];
      const rightVal = first[filterCol] ?? "(n/a)";
      console.log(`    First row ${filterCol}="${rightVal}" (exact match: ${String(val) === String(rightVal)})`);
    }
  }

  console.log("\n=== Done ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
