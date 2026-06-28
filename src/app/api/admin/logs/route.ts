// ============================================================
// POST /api/admin/logs  -- create or update daily log
// DELETE /api/admin/logs -- remove daily log
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
