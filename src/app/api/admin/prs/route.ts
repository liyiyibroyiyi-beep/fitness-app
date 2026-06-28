// ============================================================
// POST /api/admin/prs -- upsert a PR record
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
