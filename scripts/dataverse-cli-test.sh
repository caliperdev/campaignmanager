#!/usr/bin/env bash
# Read-only CLI test: load .env.local, get token, fetch one Dataverse table (columns + a few rows).
# Usage: ./scripts/dataverse-cli-test.sh

set -e
cd "$(dirname "$0")/.."

echo "=== 1. Load env from .env.local ==="
if [ ! -f .env.local ]; then
  echo "Missing .env.local"
  exit 1
fi
set -a
# shellcheck source=/dev/null
source .env.local
set +a
echo "DATAVERSE_ENVIRONMENT_URL=$DATAVERSE_ENVIRONMENT_URL"
echo "DATAVERSE_TENANT_ID=$DATAVERSE_TENANT_ID"
echo "DATAVERSE_CLIENT_ID=$DATAVERSE_CLIENT_ID"
echo ""

echo "=== 2. Get Azure AD token (client credentials) ==="
BASE_URL="${DATAVERSE_ENVIRONMENT_URL%/}"
SCOPE="${BASE_URL}/.default"
TOKEN_RESP=$(curl -s -X POST "https://login.microsoftonline.com/${DATAVERSE_TENANT_ID}/oauth2/v2.0/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=${DATAVERSE_CLIENT_ID}" \
  -d "client_secret=${DATAVERSE_CLIENT_SECRET}" \
  -d "scope=${SCOPE}")
if ! echo "$TOKEN_RESP" | grep -q "access_token"; then
  echo "Token request failed: $TOKEN_RESP"
  exit 1
fi
TOKEN=$(echo "$TOKEN_RESP" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
echo "Got token (length ${#TOKEN})"
echo ""

echo "=== 3. Get one test table from EntityDefinitions ==="
API_BASE="${BASE_URL}/api/data/v9.2"
# No $top on metadata; get full list and pick a readable entity (skip aaduser etc.)
DEF_RESP=$(curl -s "${API_BASE}/EntityDefinitions" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/json" \
  -H "OData-MaxVersion: 4.0" \
  -H "OData-Version: 4.0")
# Only tables that start with cr4fe_ (custom)
ENTITY_SET=$(echo "$DEF_RESP" | grep -oE '"EntitySetName"\s*:\s*"[^"]+"' | sed 's/.*"\([^"]*\)" *$/\1/' | grep -E '^cr4fe_' | head -1)
if [ -z "$ENTITY_SET" ]; then
  echo "No cr4fe_ table found in EntityDefinitions."
  exit 1
fi
echo "Table: EntitySetName=$ENTITY_SET"
echo ""

echo "=== 4. Fetch 2 rows from table (columns come from first row keys) ==="
DATA_RESP=$(curl -s "${API_BASE}/${ENTITY_SET}?\$top=2" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/json" \
  -H "OData-MaxVersion: 4.0" \
  -H "OData-Version: 4.0")
if ! echo "$DATA_RESP" | grep -q '"value"'; then
  echo "Data request failed (e.g. 403/400): $DATA_RESP"
  exit 1
fi
echo "Data response received (length ${#DATA_RESP} chars)"
if command -v jq >/dev/null 2>&1; then
  echo "Columns (first row keys):"
  echo "$DATA_RESP" | jq -r '.value[0] | keys[]?' 2>/dev/null | grep -v '^@' || true
  echo "Row count: $(echo "$DATA_RESP" | jq -r '.value | length' 2>/dev/null || echo "?")"
else
  echo "Preview (first 300 chars): ${DATA_RESP:0:300}..."
fi
echo ""
echo "=== Done (read-only test) ==="
