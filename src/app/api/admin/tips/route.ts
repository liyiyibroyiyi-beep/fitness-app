// ============================================================
// PUT /api/admin/tips    -- upsert an exercise tip
// DELETE /api/admin/tips -- delete an exercise tip
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
