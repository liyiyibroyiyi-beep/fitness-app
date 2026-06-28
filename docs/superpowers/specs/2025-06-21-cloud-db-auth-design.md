# Cloud Database & Auth Design

**Date:** 2025-06-21  
**Status:** Approved  
**Project:** Fitness Tracker — Next.js 15 personal app

## Overview

Migrate the fitness tracker from browser localStorage to a cloud database (Neon Serverless Postgres), add simple admin-password authentication, and keep the public share page accessible to anyone with the link.

## Architecture Decision

**Chosen: Option A — Admin Password + Neon Serverless Postgres**

Alternatives considered:
- **Clerk Auth**: Overkill for a single-user personal project. Adds third-party dependency, redirect flows, and unnecessary complexity.
- **Vercel KV**: Simple key-value store but weak query capability. Cannot efficiently answer questions like "all chest PRs" or "weight trend over 3 months".

## Database Schema (Neon Postgres)

### `fitness_data` — Daily check-ins + meals + exercises (by date)

| Column      | Type                  | Description                          |
|-------------|-----------------------|--------------------------------------|
| date        | DATE PRIMARY KEY      | "YYYY-MM-DD"                         |
| weight      | REAL                  | Morning bodyweight (kg)              |
| exercises   | JSONB DEFAULT '[]'    | Array of ExerciseLog                 |
| meals       | JSONB DEFAULT '{}'    | DailyMeals (breakfast/lunch/dinner/snack) |
| created_at  | TIMESTAMPTZ DEFAULT now() |                                   |
| updated_at  | TIMESTAMPTZ DEFAULT now() |                                   |

### `pr_records` — Personal best records (cross-date aggregation)

| Column        | Type                  | Description                          |
|---------------|-----------------------|--------------------------------------|
| exercise_id   | TEXT PRIMARY KEY      | Unique exercise identifier           |
| exercise_name | TEXT NOT NULL         | Human-readable name                  |
| category      | TEXT NOT NULL         | "chest" \| "back" \| "shoulder"     |
| max_weight    | JSONB                 | { weight, reps, date }               |
| max_reps      | JSONB                 | { weight, reps, date }               |
| updated_at    | TIMESTAMPTZ DEFAULT now() |                                   |

### `custom_exercises` — User-defined exercises per category

| Column      | Type                  | Description                          |
|-------------|-----------------------|--------------------------------------|
| id          | TEXT PRIMARY KEY      | "custom-{timestamp}"                 |
| name        | TEXT NOT NULL         | User-given name                      |
| category    | TEXT NOT NULL         | "chest" \| "back" \| "shoulder"     |
| created_at  | TIMESTAMPTZ DEFAULT now() |                                   |

### `exercise_tips` — Personal notes per exercise

| Column      | Type                  | Description                          |
|-------------|-----------------------|--------------------------------------|
| exercise_id | TEXT PRIMARY KEY      | Exercise identifier                  |
| tip         | TEXT NOT NULL         | Free-form training note              |
| updated_at  | TIMESTAMPTZ DEFAULT now() |                                   |

## Authentication Flow

```
User visits /admin
       │
       ├── Has valid admin-token cookie?
       │     ├── Yes → Render full admin UI
       │     └── No  → Show password input form
       │
       └── Submits password → POST /api/auth/login
              │
              ├── Matches ADMIN_PASSWORD env var
              │     └── Set httpOnly Secure Cookie (30-day expiry)
              └── Mismatch → Show error
```

### Cookie Details
- Name: `admin-token`
- Type: `httpOnly`, `Secure` (production only), `SameSite=Lax`
- Value: SHA-256 hash of `ADMIN_PASSWORD` (not the raw password)
- Expiry: 30 days, sliding on each validated request

## API Routes

### Auth (no permission check)

| Method | Path               | Body               | Response              |
|--------|--------------------|--------------------|-----------------------|
| POST   | /api/auth/login    | { password }       | { success, message }  |
| POST   | /api/auth/logout   | —                  | Clear cookie          |
| GET    | /api/auth/check    | —                  | { authenticated }     |

### Public Read (share page — no auth)

| Method | Path              | Params                    | Response                      |
|--------|-------------------|---------------------------|-------------------------------|
| GET    | /api/share/logs   | ?from=YYYY-MM-DD&to=...   | { logs, meals }               |
| GET    | /api/share/prs    | —                         | { prRecords }                 |
| GET    | /api/share/tips   | —                         | { customExercises, tips }     |

### Admin Write (requires admin-token cookie)

| Method | Path                     | Body                              | Response      |
|--------|--------------------------|-----------------------------------|---------------|
| POST   | /api/admin/logs          | { date, weight, exercises }       | { success }   |
| DELETE | /api/admin/logs          | { date }                          | { success }   |
| POST   | /api/admin/meals         | { date, meals }                   | { success }   |
| POST   | /api/admin/prs           | { exerciseId, ...PRRecord fields }| { success }   |
| POST   | /api/admin/exercises     | { name, category }                | { exercise }  |
| PUT    | /api/admin/tips          | { exerciseId, tip }               | { success }   |
| DELETE | /api/admin/tips          | { exerciseId }                    | { success }   |

## File Changes

### New Files
```
src/lib/db.ts                              # Neon connection + query helpers
src/lib/auth.ts                            # Cookie sign/verify helpers
src/app/api/auth/login/route.ts
src/app/api/auth/logout/route.ts
src/app/api/auth/check/route.ts
src/app/api/share/logs/route.ts
src/app/api/share/prs/route.ts
src/app/api/admin/logs/route.ts
src/app/api/admin/meals/route.ts
src/app/api/admin/prs/route.ts
src/app/api/admin/exercises/route.ts
src/app/api/admin/tips/route.ts
```

### Modified Files
```
src/stores/useFitnessStore.ts   # Remove persist middleware, add API sync
src/app/admin/page.tsx          # Add login gate
src/app/share/page.tsx          # Initialize from API data
package.json                     # Add @neondatabase/serverless
```

### Environment Variables (Vercel)
```
DATABASE_URL=postgresql://...   # Neon connection string
ADMIN_PASSWORD=<user-set>       # Password for admin login
ADMIN_SECRET=<random-32-char>   # Used to sign cookies
```

## Data Flow

### Read (Share Page)
```
Browser → GET /api/share/* → Neon DB query → JSON response → Zustand state → UI
```

### Write (Admin Page)
```
UI interaction → Zustand action → optimistically update local state
                                 → POST/PUT/DELETE /api/admin/*
                                    → validate cookie
                                    → write to Neon DB
                                    → on error: rollback local state
```

## Migration Strategy

Since this is a new project with no existing cloud data:
1. Deploy new API routes to Vercel
2. Run DB migrations (create tables)
3. Set environment variables in Vercel dashboard
4. User starts fresh — no data migration needed

## Vercel Setup Steps
1. Create Neon database (via Vercel Marketplace — one click)
2. Add `DATABASE_URL`, `ADMIN_PASSWORD`, `ADMIN_SECRET` to Vercel environment variables
3. Deploy
