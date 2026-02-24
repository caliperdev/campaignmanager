# Supabase scripts

## add-campaigns-table.sql

Recreates the **campaigns** table (and adds the notes column if missing).

**When to use:** After a DB reset or when the campaigns table is missing.

**How to run:**

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**.
2. Paste the contents of `add-campaigns-table.sql`.
3. Click **Run**.

Or with Supabase CLI (applies all migrations, including campaigns):

```bash
supabase db push
```

Or run only this script via CLI:

```bash
supabase db execute -f supabase/scripts/add-campaigns-table.sql
```

After the table exists, add campaigns again via the app (Import CSV or New Campaign) or by inserting rows in the SQL Editor.
