# Cloud Database & Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate fitness tracker from localStorage to Neon Postgres, add admin-password auth, keep share page public.

**Architecture:** Next.js 15 App Router API routes + `@neondatabase/serverless` for DB access + HMAC-signed cookie for admin auth + optimistic Zustand state with API sync.

**Tech Stack:** Next.js 15, React 19, TypeScript, Zustand 5, Tailwind CSS 4, `@neondatabase/serverless`, Neon Postgres

## Global Constraints

- `ADMIN_PASSWORD` env var — plain text password for single admin user
- `ADMIN_SECRET` env var — random 32-char string for HMAC cookie signing
- `DATABASE_URL` env var — Neon Postgres connection string
- Cookie: `admin-token`, httpOnly, Secure in production, SameSite=Lax, 30-day expiry
- All `/api/admin/*` routes require valid `admin-token` cookie
- All `/api/share/*` routes are public (no auth)
- No third-party auth services — pure env-var comparison

---

## Task 1: Install dependency + create SQL migration

**Files:**
- Modify: `package.json`
- Create: `src/lib/db.ts`
- Create: `migrations/001_init.sql`

**Interfaces:**
- Produces: `sql` tagged template from `@neondatabase/serverless` via `src/lib/db.ts`
- Produces: `migrations/001_init.sql` — run once to create all tables

- [ ] **Step 1: Install @neondatabase/serverless**

```bash
npm install @neondatabase/serverless
```

- [ ] **Step 2: Create src/lib/db.ts**

```typescript
// ============================================================
// Database connection — Neon Serverless Postgres
// ============================================================
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export default sql;
```

- [ ] **Step 3: Create migrations/001_init.sql**

```sql
-- Initialize fitness tracker database schema

CREATE TABLE IF NOT EXISTS fitness_data (
  date       DATE PRIMARY KEY,
  weight     REAL NOT NULL DEFAULT 0,
  exercises  JSONB NOT NULL DEFAULT '[]',
  meals      JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pr_records (
  exercise_id   TEXT PRIMARY KEY,
  exercise_name TEXT NOT NULL,
  category      TEXT NOT NULL,
  max_weight    JSONB NOT NULL DEFAULT '{}',
  max_reps      JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS custom_exercises (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exercise_tips (
  exercise_id TEXT PRIMARY KEY,
  tip         TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitness_data_date ON fitness_data(date DESC);
CREATE INDEX IF NOT EXISTS idx_pr_records_category ON pr_records(category);
CREATE INDEX IF NOT EXISTS idx_custom_exercises_category ON custom_exercises(category);
```

- [ ] **Step 4: Commit**

```bash
mkdir -p migrations
git add package.json package-lock.json src/lib/db.ts migrations/001_init.sql
git commit -m "chore: add @neondatabase/serverless, db connection, schema migration"
```

---

## Task 2: Create auth library

**Files:**
- Create: `src/lib/auth.ts`

**Interfaces:**
- Produces: `getAdminToken()` → `string`
- Produces: `requireAuth()` → `Promise<NextResponse | null>`
- Produces: `setAuthCookie(response: NextResponse)` → `NextResponse`
- Produces: `clearAuthCookie(response: NextResponse)` → `NextResponse`

- [ ] **Step 1: Create src/lib/auth.ts**

```typescript
// ============================================================
// Auth helpers — HMAC-signed cookie for admin access
// ============================================================
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "admin-token";

/** Sign the admin password with HMAC-SHA256 using ADMIN_SECRET */
export function getAdminToken(): string {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SECRET;
  if (!password || !secret) {
    throw new Error("ADMIN_PASSWORD and ADMIN_SECRET env vars must be set");
  }
  return crypto.createHmac("sha256", secret).update(password).digest("hex");
}

const sharedCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/** Check if the current request has a valid admin-token cookie */
export async function requireAuth(): Promise<NextResponse | null> {
  // Read cookie — cannot use set() on ReadonlyRequestCookies from headers()
  const headerCookies = await cookies();
  const token = headerCookies.get(COOKIE_NAME)?.value;

  if (!token || token !== getAdminToken()) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  return null; // auth passed
}

/** Attach admin-token cookie to a response */
export function setAuthCookie(response: NextResponse): NextResponse {
  response.cookies.set(COOKIE_NAME, getAdminToken(), {
    ...sharedCookieOptions,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });
  return response;
}

/** Clear admin-token cookie on a response */
export function clearAuthCookie(response: NextResponse): NextResponse {
  response.cookies.set(COOKIE_NAME, "", {
    ...sharedCookieOptions,
    maxAge: 0,
  });
  return response;
}

/** GET handler helper: read token from cookies and compare */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const headerCookies = await cookies();
    const token = headerCookies.get(COOKIE_NAME)?.value;
    return token === getAdminToken();
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat: add auth library with HMAC cookie helpers"
```

---

## Task 3: Create auth API routes

**Files:**
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/api/auth/check/route.ts`

**Interfaces:**
- Consumes: `getAdminToken` from `@/lib/auth`, `setAuthCookie` / `clearAuthCookie` from `@/lib/auth`
- Produces: `POST /api/auth/login` — body `{ password }` → `{ success, message? }`
- Produces: `POST /api/auth/logout` — clears cookie
- Produces: `GET /api/auth/check` — `{ authenticated: boolean }`

- [ ] **Step 1: Create src/app/api/auth/login/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { setAuthCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { success: false, message: "请输入密码" },
        { status: 400 }
      );
    }

    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json(
        { success: false, message: "密码错误" },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ success: true });
    return setAuthCookie(response);
  } catch {
    return NextResponse.json(
      { success: false, message: "请求格式错误" },
      { status: 400 }
    );
  }
}
```

- [ ] **Step 2: Create src/app/api/auth/logout/route.ts**

```typescript
import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  return clearAuthCookie(response);
}
```

- [ ] **Step 3: Create src/app/api/auth/check/route.ts**

```typescript
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";

export async function GET() {
  const authenticated = await isAuthenticated();
  return NextResponse.json({ authenticated });
}
```

- [ ] **Step 4: Create parent directories and test locally**

```bash
mkdir -p src/app/api/auth/login
mkdir -p src/app/api/auth/logout
mkdir -p src/app/api/auth/check
# Start dev server and test with curl:
# curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"password":"test123"}'
# curl http://localhost:3000/api/auth/check
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/
git commit -m "feat: add auth API routes (login, logout, check)"
```

---

## Task 4: Create public share API routes

**Files:**
- Create: `src/app/api/share/logs/route.ts`
- Create: `src/app/api/share/prs/route.ts`

**Interfaces:**
- Consumes: `sql` from `@/lib/db`
- Produces: `GET /api/share/logs` → `{ logs: Record<string, DailyLog>, meals: Record<string, DailyMeals> }`
- Produces: `GET /api/share/prs` → `{ prRecords, customExercises, exerciseTips }`

- [ ] **Step 1: Create src/app/api/share/logs/route.ts**

```typescript
// ============================================================
// GET /api/share/logs — public, no auth required
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import type { DailyLog, DailyMeals } from "@/lib/types";

export async function GET(_request: NextRequest) {
  try {
    const rows = await sql`
      SELECT date, weight, exercises, meals, created_at
      FROM fitness_data
      ORDER BY date ASC
    `;

    const logs: Record<string, DailyLog> = {};
    const meals: Record<string, DailyMeals> = {};

    for (const row of rows) {
      const dateStr =
        row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : String(row.date).slice(0, 10);

      logs[dateStr] = {
        date: dateStr,
        weight: Number(row.weight),
        timestamp:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : String(row.created_at),
        exercises: Array.isArray(row.exercises) ? row.exercises : [],
      };

      meals[dateStr] = row.meals as DailyMeals;
    }

    return NextResponse.json({ logs, meals });
  } catch (error) {
    console.error("GET /api/share/logs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch logs" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Create src/app/api/share/prs/route.ts**

```typescript
// ============================================================
// GET /api/share/prs — public, no auth required
// ============================================================
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import type { PRRecord, ExerciseDef, WorkoutCategoryId } from "@/lib/types";

export async function GET() {
  try {
    const [prRows, customExRows, tipsRows] = await Promise.all([
      sql`SELECT * FROM pr_records`,
      sql`SELECT * FROM custom_exercises ORDER BY created_at ASC`,
      sql`SELECT * FROM exercise_tips`,
    ]);

    const prRecords: Record<string, PRRecord> = {};
    for (const row of prRows) {
      const maxWeight =
        typeof row.max_weight === "string"
          ? JSON.parse(row.max_weight)
          : row.max_weight;
      const maxReps =
        typeof row.max_reps === "string"
          ? JSON.parse(row.max_reps)
          : row.max_reps;

      prRecords[row.exercise_id] = {
        exerciseId: row.exercise_id,
        exerciseName: row.exercise_name,
        category: row.category as WorkoutCategoryId,
        maxWeight,
        maxReps,
      };
    }

    const customExercises: Record<WorkoutCategoryId, ExerciseDef[]> = {
      chest: [],
      back: [],
      shoulder: [],
    };
    for (const row of customExRows) {
      const cat = row.category as WorkoutCategoryId;
      if (customExercises[cat]) {
        customExercises[cat].push({
          id: row.id,
          name: row.name,
          category: cat,
        });
      }
    }

    const exerciseTips: Record<string, string> = {};
    for (const row of tipsRows) {
      exerciseTips[row.exercise_id] = row.tip;
    }

    return NextResponse.json({ prRecords, customExercises, exerciseTips });
  } catch (error) {
    console.error("GET /api/share/prs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch PRs" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Create parent directories and commit**

```bash
mkdir -p src/app/api/share/logs
mkdir -p src/app/api/share/prs
git add src/app/api/share/
git commit -m "feat: add public share API routes (logs, prs)"
```

---

## Task 5: Create admin API routes

**Files:**
- Create: `src/app/api/admin/logs/route.ts`
- Create: `src/app/api/admin/meals/route.ts`
- Create: `src/app/api/admin/prs/route.ts`
- Create: `src/app/api/admin/exercises/route.ts`
- Create: `src/app/api/admin/tips/route.ts`

**Interfaces:**
- Consumes: `sql` from `@/lib/db`, `requireAuth` from `@/lib/auth`
- Produces: 5 admin write endpoints — all require valid `admin-token` cookie

- [ ] **Step 1: Create src/app/api/admin/logs/route.ts**

```typescript
// ============================================================
// POST /api/admin/logs  — create or update daily log
// DELETE /api/admin/logs — remove daily log
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { date, weight, exercises } = await request.json();

    if (!date) {
      return NextResponse.json({ error: "date is required" }, { status: 400 });
    }

    await sql`
      INSERT INTO fitness_data (date, weight, exercises)
      VALUES (${date}, ${weight ?? 0}, ${JSON.stringify(exercises ?? [])})
      ON CONFLICT (date) DO UPDATE SET
        weight = EXCLUDED.weight,
        exercises = EXCLUDED.exercises,
        updated_at = now()
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/admin/logs error:", error);
    return NextResponse.json(
      { error: "Failed to save log" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { date } = await request.json();

    if (!date) {
      return NextResponse.json({ error: "date is required" }, { status: 400 });
    }

    await sql`DELETE FROM fitness_data WHERE date = ${date}`;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/admin/logs error:", error);
    return NextResponse.json(
      { error: "Failed to delete log" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Create src/app/api/admin/meals/route.ts**

```typescript
// ============================================================
// POST /api/admin/meals — update meals for a date
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { date, meals } = await request.json();

    if (!date) {
      return NextResponse.json({ error: "date is required" }, { status: 400 });
    }

    await sql`
      INSERT INTO fitness_data (date, meals)
      VALUES (${date}, ${JSON.stringify(meals ?? {})})
      ON CONFLICT (date) DO UPDATE SET
        meals = EXCLUDED.meals,
        updated_at = now()
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/admin/meals error:", error);
    return NextResponse.json(
      { error: "Failed to save meals" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Create src/app/api/admin/prs/route.ts**

```typescript
// ============================================================
// POST /api/admin/prs — upsert a PR record
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { exerciseId, exerciseName, category, maxWeight, maxReps } =
      await request.json();

    if (!exerciseId) {
      return NextResponse.json(
        { error: "exerciseId is required" },
        { status: 400 }
      );
    }

    await sql`
      INSERT INTO pr_records (exercise_id, exercise_name, category, max_weight, max_reps)
      VALUES (
        ${exerciseId},
        ${exerciseName ?? ""},
        ${category ?? "chest"},
        ${JSON.stringify(maxWeight ?? {})},
        ${JSON.stringify(maxReps ?? {})}
      )
      ON CONFLICT (exercise_id) DO UPDATE SET
        exercise_name = EXCLUDED.exercise_name,
        category = EXCLUDED.category,
        max_weight = EXCLUDED.max_weight,
        max_reps = EXCLUDED.max_reps,
        updated_at = now()
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/admin/prs error:", error);
    return NextResponse.json(
      { error: "Failed to save PR" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Create src/app/api/admin/exercises/route.ts**

```typescript
// ============================================================
// POST /api/admin/exercises — add a custom exercise
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { name, category } = await request.json();

    if (!name || !category) {
      return NextResponse.json(
        { error: "name and category are required" },
        { status: 400 }
      );
    }

    const id = `custom-${Date.now()}`;

    await sql`
      INSERT INTO custom_exercises (id, name, category)
      VALUES (${id}, ${name}, ${category})
    `;

    return NextResponse.json({ id, name, category });
  } catch (error) {
    console.error("POST /api/admin/exercises error:", error);
    return NextResponse.json(
      { error: "Failed to add exercise" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 5: Create src/app/api/admin/tips/route.ts**

```typescript
// ============================================================
// PUT /api/admin/tips    — upsert an exercise tip
// DELETE /api/admin/tips — delete an exercise tip
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function PUT(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { exerciseId, tip } = await request.json();

    if (!exerciseId || tip === undefined) {
      return NextResponse.json(
        { error: "exerciseId and tip are required" },
        { status: 400 }
      );
    }

    await sql`
      INSERT INTO exercise_tips (exercise_id, tip)
      VALUES (${exerciseId}, ${tip})
      ON CONFLICT (exercise_id) DO UPDATE SET
        tip = EXCLUDED.tip,
        updated_at = now()
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/admin/tips error:", error);
    return NextResponse.json(
      { error: "Failed to save tip" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { exerciseId } = await request.json();

    if (!exerciseId) {
      return NextResponse.json(
        { error: "exerciseId is required" },
        { status: 400 }
      );
    }

    await sql`DELETE FROM exercise_tips WHERE exercise_id = ${exerciseId}`;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/admin/tips error:", error);
    return NextResponse.json(
      { error: "Failed to delete tip" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 6: Create parent directories and commit**

```bash
mkdir -p src/app/api/admin/logs
mkdir -p src/app/api/admin/meals
mkdir -p src/app/api/admin/prs
mkdir -p src/app/api/admin/exercises
mkdir -p src/app/api/admin/tips
git add src/app/api/admin/
git commit -m "feat: add admin API routes (logs, meals, prs, exercises, tips)"
```

---

## Task 6: Modify Zustand store — remove persist, add API sync

**Files:**
- Modify: `src/stores/useFitnessStore.ts` (entire file — substantial rewrite)

**Interfaces:**
- Consumes: `FitnessState` types from `@/lib/types`, `EXERCISE_MAP` / `WORKOUT_CONFIG` / helpers (kept local)
- Produces: `useFitnessStore` — same public interface + new `loadData()`, `authenticated`, `login()`, `logout()`, `checkAuth()` actions
- Public read APIs: `GET /api/share/logs`, `GET /api/share/prs`
- Admin write APIs: `POST /api/admin/logs`, `POST /api/admin/meals`, `POST /api/admin/prs`, `POST /api/admin/exercises`, `PUT /api/admin/tips`, `DELETE /api/admin/tips`, `DELETE /api/admin/logs`

**Strategy:** Wrap every write action with an optimistic local update followed by an API sync. On sync failure, roll back to previous state. Each action logs errors but does not throw — the UI stays responsive.

- [ ] **Step 1: Read the current store to understand all actions**

File is at `src/stores/useFitnessStore.ts` (already read — 517 lines). The key changes:
1. Remove `import { persist } from "zustand/middleware"` and the `persist()` wrapper
2. Add `loaded: boolean` to the interface
3. Add `loadData()`, `authenticated`, `login()`, `logout()`, `checkAuth()` to the interface
4. Wrap each write action with optimistic update + API sync + rollback

- [ ] **Step 2: Replace src/stores/useFitnessStore.ts**

This is a full-file replacement. The file is 517 lines. Key changes marked with `// NEW:` and `// CHANGED:`.

```typescript
// ============================================================
// useFitnessStore — Zustand store for fitness check-in system
// ============================================================
// 硬编码基础身体参数 (hardcoded base body parameters)
//   身高 179cm, 年龄 25, 运动系数 1.5
//
// 计算公式:
//   BMR  = 10 * W + 998.75
//   TDEE = 2250 (固定值)
//   蛋白质 = W * 2.6, 碳水 = W * 4.3, 脂肪 = W * 1.25
//
//   热量自动计算: kcal = 蛋白质*4 + 碳水*4 + 脂肪*9
// ============================================================
// CHANGED: Removed localStorage persist — data now lives in Neon Postgres
// CHANGED: All write actions now sync to /api/admin/* endpoints
// NEW:     loadData() fetches all data from /api/share/* on mount
// ============================================================

import { create } from "zustand";
import type {
  DailyLog,
  ExerciseLog,
  SetRecord,
  PRRecord,
  PRResult,
  NutritionTargets,
  FitnessState,
  WorkoutCategoryId,
  WorkoutConfig,
  DailyMeals,
  MealEntry,
  MealFoodEntry,
  ExerciseDef,
} from "@/lib/types";
import { getFoodById } from "@/lib/foodDatabase";

// ---- Hardcoded base parameters ----
const HEIGHT_CM = 179;
const AGE = 25;
const ACTIVITY_COEFFICIENT = 1.5;

// ---- Exercise Presets (Updated per user specification) ----
// 胸 includes triceps actions; 背 includes biceps actions
export const WORKOUT_CONFIG: WorkoutConfig = {
  workout_categories: [
    {
      categoryId: "chest",
      categoryName: "胸",
      exercises: [
        { id: "barbell-bench-press", name: "杠铃卧推", category: "chest" },
        { id: "incline-dumbbell-press", name: "上斜哑铃卧推", category: "chest" },
        { id: "machine-chest-press", name: "器械平推", category: "chest" },
        { id: "dips", name: "臂屈伸", category: "chest" },
        { id: "triceps-rope-pushdown", name: "三头绳索下拉", category: "chest" },
      ],
    },
    {
      categoryId: "back",
      categoryName: "背",
      exercises: [
        { id: "pull-up-warmup", name: "引体向上热身", category: "back" },
        { id: "machine-lat-pulldown", name: "器械高位下拉", category: "back" },
        { id: "single-arm-machine-row", name: "单手器械划船", category: "back" },
        { id: "wide-grip-seated-row", name: "宽距坐姿划船", category: "back" },
        { id: "lat-pulldown-single-arm", name: "高位下拉/单臂", category: "back" },
        { id: "biceps-machine", name: "二头器械", category: "back" },
      ],
    },
    {
      categoryId: "shoulder",
      categoryName: "肩膀",
      exercises: [
        { id: "seated-dumbbell-shoulder-press", name: "坐姿哑铃推肩", category: "shoulder" },
        { id: "dumbbell-fly", name: "哑铃飞鸟", category: "shoulder" },
        { id: "cable-face-pull", name: "绳索面拉", category: "shoulder" },
        { id: "smith-machine-shoulder-press", name: "史密斯推肩", category: "shoulder" },
        { id: "machine-fly", name: "器械飞鸟", category: "shoulder" },
        { id: "reverse-pec-deck", name: "反向蝴蝶机", category: "shoulder" },
      ],
    },
  ],
};

/** Flat map: exerciseId → { name, category } for fast lookup */
export const EXERCISE_MAP: Record<string, { name: string; category: WorkoutCategoryId }> = {};
for (const cat of WORKOUT_CONFIG.workout_categories) {
  for (const ex of cat.exercises) {
    EXERCISE_MAP[ex.id] = { name: ex.name, category: ex.category };
  }
}

/** Get preset exercises for a given category */
export function getExercisesByCategory(catId: WorkoutCategoryId) {
  const cat = WORKOUT_CONFIG.workout_categories.find((c) => c.categoryId === catId);
  return cat?.exercises ?? [];
}

/** Get merged exercises (preset + custom) for a category from store state */
export function getAllExercisesByCategory(
  catId: WorkoutCategoryId,
  customExercises: Record<WorkoutCategoryId, ExerciseDef[]>
) {
  const preset = getExercisesByCategory(catId);
  const custom = customExercises[catId] ?? [];
  return [...preset, ...custom];
}

/** Lookup exercise name by ID */
export function getExerciseName(id: string): string {
  return EXERCISE_MAP[id]?.name ?? id;
}

// ---- Helpers ----

/** Return today's date as "YYYY-MM-DD" */
function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** ISO-8601 timestamp with second precision */
function nowISO(): string {
  const d = new Date();
  return d.toISOString().replace(/\.\d{3}Z$/, "Z"); // strip ms
}

/** Compute nutrition targets from a given weight */
export function computeNutrition(weight: number): NutritionTargets {
  const bmr = 10 * weight + 998.75;
  const TDEE = 2250; // Fixed TDEE
  return {
    bmr: Math.round(bmr * 100) / 100,
    tdee: TDEE,
    surplusLow: 2500,  // TDEE + 10% surplus
    surplusHigh: 2500,
    proteinG: Math.round(weight * 2.6 * 10) / 10,
    carbsG: Math.round(weight * 4.3 * 10) / 10,
    fatG: Math.round(weight * 1.25 * 10) / 10,
  };
}

/** Auto-calculate kcal from macros: protein*4 + carbs*4 + fat*9 */
export function calcMealKcal(protein: number, carbs: number, fat: number): number {
  return Math.round((protein * 4 + carbs * 4 + fat * 9) * 10) / 10;
}

/** Create an empty meal entry */
export function emptyMeal(): MealEntry {
  return { foods: [], protein: 0, carbs: 0, fat: 0, kcal: 0 };
}

/** Create empty daily meals */
export function emptyDailyMeals(): DailyMeals {
  return {
    breakfast: emptyMeal(),
    lunch: emptyMeal(),
    dinner: emptyMeal(),
    snack: emptyMeal(),
  };
}

/** Get the latest weight from the logs (most recent date) */
export function getLatestWeight(logs: Record<string, DailyLog>): number | null {
  const dates = Object.keys(logs).sort();
  if (dates.length === 0) return null;
  return logs[dates[dates.length - 1]].weight;
}

// ---- API Helpers (NEW) ----

async function apiPost(path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`API ${path} failed:`, res.status);
    return res.ok;
  } catch (err) {
    console.error(`API ${path} error:`, err);
    return false;
  }
}

async function apiPut(path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`API ${path} failed:`, res.status);
    return res.ok;
  } catch (err) {
    console.error(`API ${path} error:`, err);
    return false;
  }
}

async function apiDelete(path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(path, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`API ${path} failed:`, res.status);
    return res.ok;
  } catch (err) {
    console.error(`API ${path} error:`, err);
    return false;
  }
}

// ---- Store Interface ----

export interface FitnessStore extends FitnessState {
  // NEW: data loading & auth state
  loaded: boolean;
  loading: boolean;
  authenticated: boolean;

  // NEW: core lifecycle
  loadData: () => Promise<void>;
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;

  // -- Actions (same as before, now with API sync) --
  /** 主打卡函数: record today's bodyweight */
  checkIn: (weight: number) => Promise<void>;

  /** Log a completed set for an exercise today */
  logSet: (exerciseId: string, category: WorkoutCategoryId, weight: number, reps: number) => Promise<PRResult | null>;

  /** Add a food to a meal slot for today with given weight (grams) */
  addFoodToMeal: (slot: keyof DailyMeals, foodId: string, weight: number) => Promise<void>;

  /** Remove a food entry from a meal slot by index */
  removeFoodFromMeal: (slot: keyof DailyMeals, index: number) => Promise<void>;

  /** Add a custom exercise to a category */
  addCustomExercise: (name: string, category: WorkoutCategoryId) => Promise<ExerciseDef>;

  /** Save a personal tip/note for an exercise */
  setExerciseTip: (exerciseId: string, tip: string) => Promise<void>;

  /** Delete a personal tip for an exercise */
  deleteExerciseTip: (exerciseId: string) => Promise<void>;

  /** Remove a daily log (for admin corrections) */
  removeLog: (date: string) => Promise<void>;

  // -- Derived / Computed --
  /** Latest weight from logs */
  latestWeight: () => number | null;

  /** Nutrition targets derived from latest weight */
  nutritionTargets: () => NutritionTargets | null;

  /** Get the current streak of consecutive check-in days */
  streak: () => number;

  /** Get PR records for a category */
  prByCategory: (category: WorkoutCategoryId) => PRRecord[];

  /** Get today's log if exists */
  todayLog: () => DailyLog | null;

  /** Get today's meals if exists */
  todayMeals: () => DailyMeals;

  /** Check if today has been checked in */
  hasCheckedInToday: () => boolean;
}

// ---- The Store ----

export const useFitnessStore = create<FitnessStore>()(
  (set, get) => ({
    // ---- Initial State ----
    logs: {},
    prRecords: {},
    meals: {},
    customExercises: { chest: [], back: [], shoulder: [] },
    exerciseTips: {},
    loaded: false,
    loading: false,
    authenticated: false,

    // ---- Lifecycle ----

    loadData: async () => {
      const state = get();
      if (state.loaded || state.loading) return;

      set({ loading: true });

      try {
        const [logsRes, prsRes] = await Promise.all([
          fetch("/api/share/logs"),
          fetch("/api/share/prs"),
        ]);

        if (logsRes.ok) {
          const { logs, meals } = await logsRes.json();
          // Merge custom exercises from PRs response into EXERCISE_MAP
          if (prsRes.ok) {
            const { prRecords, customExercises, exerciseTips } =
              await prsRes.json();

            // Register custom exercise names in EXERCISE_MAP
            if (customExercises) {
              for (const cat of ["chest", "back", "shoulder"] as WorkoutCategoryId[]) {
                const exs = customExercises[cat] ?? [];
                for (const ex of exs) {
                  EXERCISE_MAP[ex.id] = { name: ex.name, category: ex.category as WorkoutCategoryId };
                }
              }
            }

            set({
              logs: logs ?? {},
              meals: meals ?? {},
              prRecords: prRecords ?? {},
              customExercises: customExercises ?? { chest: [], back: [], shoulder: [] },
              exerciseTips: exerciseTips ?? {},
            });
          } else {
            set({ logs: logs ?? {}, meals: meals ?? {} });
          }
        }
      } catch (err) {
        console.error("Failed to load data from server:", err);
      }

      set({ loaded: true, loading: false });
    },

    login: async (password: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const data = await res.json();
        if (data.success) {
          set({ authenticated: true });
          return true;
        }
        return false;
      } catch (err) {
        console.error("Login error:", err);
        return false;
      }
    },

    logout: async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch (err) {
        console.error("Logout error:", err);
      }
      set({ authenticated: false });
    },

    checkAuth: async () => {
      try {
        const res = await fetch("/api/auth/check");
        const data = await res.json();
        set({ authenticated: data.authenticated ?? false });
      } catch {
        set({ authenticated: false });
      }
    },

    // ---- Actions (with API sync) ----

    checkIn: async (weight: number) => {
      const date = todayKey();
      const ts = nowISO();
      const existing = get().logs[date];

      const log: DailyLog = {
        date,
        weight,
        timestamp: ts,
        exercises: existing?.exercises ?? [],
      };

      // Optimistic local update
      const prevLogs = { ...get().logs };
      set((s) => ({
        logs: { ...s.logs, [date]: log },
      }));

      // Sync to server
      const ok = await apiPost("/api/admin/logs", {
        date,
        weight,
        exercises: log.exercises,
      });

      if (!ok) {
        set({ logs: prevLogs });
      }
    },

    logSet: async (
      exerciseId: string,
      category: WorkoutCategoryId,
      weight: number,
      reps: number
    ): Promise<PRResult | null> => {
      const date = todayKey();
      const ts = nowISO();
      const currentLogs = { ...get().logs };
      const currentPRs = { ...get().prRecords };

      const exerciseName = getExerciseName(exerciseId);

      // Build updated log
      const todayLog: DailyLog = currentLogs[date] ?? {
        date,
        weight: 0,
        timestamp: ts,
        exercises: [],
      };

      const exIdx = todayLog.exercises.findIndex(
        (e) => e.exerciseId === exerciseId
      );

      const newSet: SetRecord = { weight, reps, timestamp: ts };

      let updatedExercises: ExerciseLog[];
      if (exIdx >= 0) {
        updatedExercises = todayLog.exercises.map((e, i) =>
          i === exIdx ? { ...e, sets: [...e.sets, newSet] } : e
        );
      } else {
        updatedExercises = [
          ...todayLog.exercises,
          { exerciseId, exerciseName, sets: [newSet] },
        ];
      }

      const updatedLog: DailyLog = {
        ...todayLog,
        exercises: updatedExercises,
      };

      // PR Determination
      const existingPR = currentPRs[exerciseId];
      let prResult: PRResult | null = null;
      let updatedPRs = { ...currentPRs };

      const newEntry = { weight, reps, date };

      if (!existingPR) {
        updatedPRs[exerciseId] = {
          exerciseId,
          exerciseName,
          category,
          maxWeight: newEntry,
          maxReps: newEntry,
        };
        prResult = {
          isPR: true,
          type: "weight",
          exerciseName,
          newBest: { weight, reps },
        };
      } else {
        let isWeightPR = false;
        let isRepsPR = false;
        const clone = { ...existingPR };

        if (weight > clone.maxWeight.weight) {
          isWeightPR = true;
          clone.maxWeight = newEntry;
        }
        if (weight >= clone.maxReps.weight && reps > clone.maxReps.reps) {
          isRepsPR = true;
          clone.maxReps = newEntry;
        }

        if (isWeightPR || isRepsPR) {
          updatedPRs[exerciseId] = clone;
          prResult = {
            isPR: true,
            type: isWeightPR ? "weight" : "reps",
            exerciseName,
            oldBest: isWeightPR
              ? { weight: existingPR.maxWeight.weight, reps: existingPR.maxWeight.reps }
              : { weight: existingPR.maxReps.weight, reps: existingPR.maxReps.reps },
            newBest: { weight, reps },
          };
        }
      }

      // Optimistic local update
      set({
        logs: { ...currentLogs, [date]: updatedLog },
        prRecords: updatedPRs,
      });

      // Sync logs to server
      const logOk = await apiPost("/api/admin/logs", {
        date,
        weight: updatedLog.weight,
        exercises: updatedLog.exercises,
      });

      if (!logOk) {
        // Rollback
        set({ logs: currentLogs, prRecords: currentPRs });
        return null;
      }

      // Sync PR to server if changed
      if (prResult?.isPR && updatedPRs[exerciseId]) {
        const pr = updatedPRs[exerciseId];
        await apiPost("/api/admin/prs", {
          exerciseId: pr.exerciseId,
          exerciseName: pr.exerciseName,
          category: pr.category,
          maxWeight: pr.maxWeight,
          maxReps: pr.maxReps,
        });
      }

      return prResult;
    },

    addFoodToMeal: async (slot: keyof DailyMeals, foodId: string, weight: number) => {
      const food = getFoodById(foodId);
      if (!food || weight <= 0) return;

      const date = todayKey();
      const prevMeals = { ...get().meals };
      const currentMeals = { ...prevMeals };

      const prevDay = currentMeals[date];
      const today: DailyMeals = prevDay
        ? JSON.parse(JSON.stringify(prevDay))
        : emptyDailyMeals();

      const slotMeal = today[slot];
      if (!slotMeal.foods) slotMeal.foods = [];

      const factor = weight / 100;
      const addedProtein = Math.round(food.proteinPer100g * factor * 10) / 10;
      const addedCarbs = Math.round(food.carbsPer100g * factor * 10) / 10;
      const addedFat = Math.round(food.fatPer100g * factor * 10) / 10;

      const foodEntry: MealFoodEntry = {
        foodId: food.id,
        foodName: food.name,
        weight,
      };

      slotMeal.foods = [...slotMeal.foods, foodEntry];
      slotMeal.protein = Math.round((slotMeal.protein + addedProtein) * 10) / 10;
      slotMeal.carbs = Math.round((slotMeal.carbs + addedCarbs) * 10) / 10;
      slotMeal.fat = Math.round((slotMeal.fat + addedFat) * 10) / 10;
      slotMeal.kcal = calcMealKcal(slotMeal.protein, slotMeal.carbs, slotMeal.fat);

      today[slot] = slotMeal;
      currentMeals[date] = today;

      // Optimistic update
      set({ meals: currentMeals });

      // Sync to server
      const ok = await apiPost("/api/admin/meals", {
        date,
        meals: today,
      });

      if (!ok) {
        set({ meals: prevMeals });
      }
    },

    removeFoodFromMeal: async (slot: keyof DailyMeals, index: number) => {
      const date = todayKey();
      const prevMeals = { ...get().meals };
      const currentMeals = { ...prevMeals };

      const prevDay = currentMeals[date];
      if (!prevDay) return;

      const today: DailyMeals = JSON.parse(JSON.stringify(prevDay));
      const slotMeal = today[slot];
      if (index < 0 || index >= slotMeal.foods.length) return;

      slotMeal.foods = slotMeal.foods.filter((_: MealFoodEntry, i: number) => i !== index);

      // Recalc from remaining foods
      let protein = 0, carbs = 0, fat = 0;
      for (const f of slotMeal.foods) {
        const food = getFoodById(f.foodId);
        if (food) {
          const factor = f.weight / 100;
          protein += food.proteinPer100g * factor;
          carbs += food.carbsPer100g * factor;
          fat += food.fatPer100g * factor;
        }
      }
      slotMeal.protein = Math.round(protein * 10) / 10;
      slotMeal.carbs = Math.round(carbs * 10) / 10;
      slotMeal.fat = Math.round(fat * 10) / 10;
      slotMeal.kcal = calcMealKcal(slotMeal.protein, slotMeal.carbs, slotMeal.fat);

      today[slot] = slotMeal;
      currentMeals[date] = today;

      // Optimistic update
      set({ meals: currentMeals });

      // Sync to server
      const ok = await apiPost("/api/admin/meals", {
        date,
        meals: today,
      });

      if (!ok) {
        set({ meals: prevMeals });
      }
    },

    addCustomExercise: async (name: string, category: WorkoutCategoryId): Promise<ExerciseDef> => {
      const id = `custom-${Date.now()}`;
      const exercise: ExerciseDef = { id, name, category };

      // Optimistic local update
      const prevCustom = { ...get().customExercises };
      set((s) => ({
        customExercises: {
          ...s.customExercises,
          [category]: [...(s.customExercises[category] ?? []), exercise],
        },
      }));
      EXERCISE_MAP[id] = { name, category };

      // Sync to server
      const ok = await apiPost("/api/admin/exercises", { name, category });
      if (!ok) {
        set({ customExercises: prevCustom });
        delete EXERCISE_MAP[id];
      }

      return exercise;
    },

    setExerciseTip: async (exerciseId: string, tip: string) => {
      const prevTips = { ...get().exerciseTips };
      set((s) => ({
        exerciseTips: { ...s.exerciseTips, [exerciseId]: tip },
      }));

      const ok = await apiPut("/api/admin/tips", { exerciseId, tip });
      if (!ok) {
        set({ exerciseTips: prevTips });
      }
    },

    deleteExerciseTip: async (exerciseId: string) => {
      const prevTips = { ...get().exerciseTips };
      set((s) => {
        const { [exerciseId]: _, ...rest } = s.exerciseTips;
        return { exerciseTips: rest };
      });

      const ok = await apiDelete("/api/admin/tips", { exerciseId });
      if (!ok) {
        set({ exerciseTips: prevTips });
      }
    },

    removeLog: async (date: string) => {
      const prevLogs = { ...get().logs };
      const prevMeals = { ...get().meals };

      const { [date]: _, ...restLogs } = get().logs;
      const { [date]: __, ...restMeals } = get().meals;
      set({ logs: restLogs, meals: restMeals });

      const ok = await apiDelete("/api/admin/logs", { date });
      if (!ok) {
        set({ logs: prevLogs, meals: prevMeals });
      }
    },

    // ---- Derived / Computed ----

    latestWeight: () => getLatestWeight(get().logs),

    nutritionTargets: () => {
      const w = getLatestWeight(get().logs);
      return w !== null ? computeNutrition(w) : null;
    },

    streak: () => {
      const dates = Object.keys(get().logs).sort().reverse();
      if (dates.length === 0) return 0;

      let streak = 0;
      const now = new Date();
      for (let i = 0; ; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (dates.includes(key)) {
          streak++;
        } else {
          break;
        }
      }
      return streak;
    },

    prByCategory: (category: WorkoutCategoryId) => {
      return Object.values(get().prRecords).filter(
        (pr) => pr.category === category
      );
    },

    todayLog: () => {
      return get().logs[todayKey()] ?? null;
    },

    todayMeals: () => {
      return get().meals[todayKey()] ?? emptyDailyMeals();
    },

    hasCheckedInToday: () => {
      return todayKey() in get().logs;
    },
  })
);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Fix any type errors before proceeding.

- [ ] **Step 4: Commit**

```bash
git add src/stores/useFitnessStore.ts
git commit -m "refactor: migrate store from localStorage persist to API-backed sync"
```

---

## Task 7: Modify admin page — add login gate

**Files:**
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `useFitnessStore` — `authenticated`, `checkAuth()`, `login()`, `loadData()`, `loaded`, `loading`
- Produces: Login gate UI + existing admin UI (unchanged below gate)

**Change:** Wrap the existing admin page content behind an auth check. On first load, check auth status. If not authenticated, show a password form. If authenticated, load data and show admin UI.

- [ ] **Step 1: Read the current admin page structure**

The file is `src/app/admin/page.tsx`. The main component is `AdminPage` which directly renders the admin UI.

- [ ] **Step 2: Apply targeted edits to add login gate**

**Edit 1:** Add imports at the top (after existing imports):

Replace:
```typescript
import { useState } from "react";
```
With:
```typescript
import { useState, useEffect, useCallback } from "react";
```

**Edit 2:** Add login gate before the main return in `AdminPage`.

Find the line:
```typescript
export default function AdminPage() {
  const [checkInOpen, setCheckInOpen] = useState(false);
```

Insert after `const [checkInOpen, setCheckInOpen] = useState(false);`:
```typescript
  // Auth state
  const authenticated = useFitnessStore((s) => s.authenticated);
  const loaded = useFitnessStore((s) => s.loaded);
  const loading = useFitnessStore((s) => s.loading);
  const checkAuth = useFitnessStore((s) => s.checkAuth);
  const login = useFitnessStore((s) => s.login);
  const loadData = useFitnessStore((s) => s.loadData);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginPending, setLoginPending] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    checkAuth().then(() => setAuthChecked(true));
  }, [checkAuth]);

  useEffect(() => {
    if (authenticated && !loaded && !loading) {
      loadData();
    }
  }, [authenticated, loaded, loading, loadData]);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!loginPassword.trim()) return;
      setLoginPending(true);
      setLoginError("");
      const ok = await login(loginPassword);
      setLoginPending(false);
      if (!ok) {
        setLoginError("密码错误");
      }
    },
    [login, loginPassword]
  );
```

**Edit 3:** Replace the main return to add auth gate:

Find:
```typescript
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
```

Replace the `return` statement with a conditional that shows login form when not authenticated:

```typescript
  // Auth gate — show loading or login form
  if (!authChecked) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-zinc-500 text-sm">加载中…</div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <form
          onSubmit={handleLogin}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm shadow-2xl"
        >
          <h1 className="text-xl font-bold text-white mb-2">管理员登录</h1>
          <p className="text-xs text-zinc-500 mb-4">请输入管理密码以访问控制台</p>
          <input
            type="password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            placeholder="输入密码"
            autoFocus
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white text-lg focus:outline-none focus:ring-2 focus:ring-amber-500 mb-3"
          />
          {loginError && (
            <p className="text-red-400 text-xs mb-3">{loginError}</p>
          )}
          <button
            type="submit"
            disabled={!loginPassword.trim() || loginPending}
            className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-bold transition"
          >
            {loginPending ? "验证中…" : "登录"}
          </button>
        </form>
      </main>
    );
  }

  // Loading data after auth
  if (!loaded) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-zinc-500 text-sm">正在同步数据…</div>
      </main>
    );
  }

  // ---- Authenticated admin UI ----
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
```

**Edit 4:** Update the store accessors in AdminPage to use correct selectors. The existing code uses `useFitnessStore((s) => s.someAction)` — these are now async. Need to adjust any callers.

Find the `checkIn` usage (line ~941):
```typescript
  const checkIn = useFitnessStore((s) => s.checkIn);
```
This is fine — Zustand selectors can return async functions.

Find:
```typescript
          onConfirm={(w) => checkIn(w)}
```
This is fine — event handlers can call async functions.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: add login gate to admin page"
```

---

## Task 8: Modify share page — add data loading

**Files:**
- Modify: `src/app/share/page.tsx`

**Interfaces:**
- Consumes: `useFitnessStore` — `loadData()`, `loaded`
- Produces: Same share page UI, but loads data from API on first mount

**Change:** Add a `useEffect` at the top of the component to call `loadData()`. Show a brief loading state while data is being fetched.

- [ ] **Step 1: Add data loading to SharePage**

In `src/app/share/page.tsx`, add imports at the top:

Find:
```typescript
import { useMemo } from "react";
```
Replace with:
```typescript
import { useMemo, useEffect } from "react";
```

- [ ] **Step 2: Add loadData call and loading state**

In the `SharePage` function, after the store subscriptions (around line 196, after `const todayMeals = ...`):

Find:
```typescript
export default function SharePage() {
  const logs = useFitnessStore((s) => s.logs);
```

Insert after the existing store selectors block:
```typescript
  const loaded = useFitnessStore((s) => s.loaded);
  const loading = useFitnessStore((s) => s.loading);
  const loadData = useFitnessStore((s) => s.loadData);

  useEffect(() => {
    if (!loaded && !loading) {
      loadData();
    }
  }, [loaded, loading, loadData]);
```

- [ ] **Step 3: Add loading state before main return**

Find the line (around line 278):
```typescript
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
```

Insert a loading check before the return:
```typescript
  if (!loaded) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-zinc-500 text-sm">加载数据中…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
```

- [ ] **Step 4: Verify build and commit**

```bash
npx tsc --noEmit
git add src/app/share/page.tsx
git commit -m "feat: add server data loading to share page"
```

---

## Task 9: Set up environment variables + create .env.local

**Files:**
- Create: `.env.local.example` (template, safe to commit)
- Create: `.env.local` (actual secrets, gitignored)

**Interfaces:**
- Produces: `DATABASE_URL`, `ADMIN_PASSWORD`, `ADMIN_SECRET` env vars

- [ ] **Step 1: Verify .gitignore covers .env.local**

```bash
grep -q ".env.local" .gitignore || echo ".env.local" >> .gitignore
```

- [ ] **Step 2: Create .env.local.example**

```bash
cat > .env.local.example << 'EOF'
# Neon Serverless Postgres — get this from https://neon.tech or Vercel Marketplace
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Admin password for accessing /admin
ADMIN_PASSWORD=your-password-here

# Random 32-character secret for signing auth cookies
# Generate with: node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
ADMIN_SECRET=change-me-to-a-random-32-char-string
EOF
```

- [ ] **Step 3: Create .env.local for local dev**

Generate a random secret:
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

Then create `.env.local`:
```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
ADMIN_PASSWORD=your-actual-password
ADMIN_SECRET=<output-from-above-command>
```

- [ ] **Step 4: Commit**

```bash
git add .env.local.example .gitignore
git commit -m "chore: add env var template and .gitignore for .env.local"
```

---

## Task 10: Run DB migration + verify end-to-end

**Files:**
- No file changes — manual verification step

**Steps:**

- [ ] **Step 1: Get Neon database URL**

Option A (recommended): Go to Vercel Dashboard → your project → Storage → Create Database → Neon → follow OAuth flow. Vercel auto-injects `DATABASE_URL`.

Option B: Go to [neon.tech](https://neon.tech), create a free project, copy the connection string.

- [ ] **Step 2: Run migration**

Using the Neon SQL Editor (or `psql` if installed):
```sql
-- Paste the contents of migrations/001_init.sql
```

Or using the Neon CLI:
```bash
npx neonctl database execute --sql "$(cat migrations/001_init.sql)"
```

- [ ] **Step 3: Set Vercel environment variables**

In Vercel Dashboard → Settings → Environment Variables:
```
DATABASE_URL  = <your-neon-connection-string>
ADMIN_PASSWORD = <your-chosen-password>
ADMIN_SECRET   = <random-32-char-string>
```
Set all three for Production, Preview, and Development.

- [ ] **Step 4: Redeploy on Vercel**

```bash
# Push all commits
git push origin main
```
Vercel auto-deploys on push to `main`.

- [ ] **Step 5: Verify end-to-end**

1. Visit `https://your-app.vercel.app/share` → should load with empty data (no error)
2. Visit `https://your-app.vercel.app/admin` → should show password form
3. Enter correct password → should redirect to admin UI
4. Do a check-in → refresh `/share` → data should appear
5. Visit `/share` in incognito → should see data without logging in
6. Visit `/admin` in incognito → should show password form

- [ ] **Step 6: Commit any final adjustments**
```bash
git add -A && git commit -m "chore: final adjustments after e2e verification"
```
