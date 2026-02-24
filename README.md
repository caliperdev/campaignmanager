# Campaign Manager

Next.js app for managing campaigns with CSV import, dynamic grid (any CSV columns), and Dark Weeks. **Data is stored only in Supabase** (tables and API); no other database or ORM is used.

## Setup

1. Create a [Supabase](https://supabase.com) project.
2. In the Supabase **SQL Editor**, run the migration in `supabase/migrations/001_campaigns.sql` to create the `campaigns` table.
3. Enable Email auth: **Authentication → Providers → Email** (enable and optionally disable "Confirm email" for testing).
4. Copy `.env.example` to `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL` — from Project Settings → API → Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Project Settings → API → anon public (needed for login)
   - `SUPABASE_SERVICE_ROLE_KEY` — from Project Settings → API → service_role (secret)
5. Create a user: **Authentication → Users → Add user** (email + password), then sign in at `/login`.

## CSV Import

Use **Load CSV** then **Import to database** in the app. Supports any CSV; stores full row in `csvData` and maps Start/End dates (including M/D/YYYY). Columns such as Name, Start, End, and Impressions Goal are normalized automatically.

## Dev

```bash
npm install
cp .env.example .env.local   # set Supabase URL and service role key
npm run dev
```

## Build

```bash
npm run build
npm run start
```

## Environment

| Variable                     | Description                                        |
|-----------------------------|----------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`  | Supabase project URL (required).                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key for auth (required for login). |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key, server-only (required).  |
# campaign_manager
