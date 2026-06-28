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
