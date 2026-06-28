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
