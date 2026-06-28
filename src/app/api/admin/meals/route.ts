// ============================================================
// POST /api/admin/meals -- update meals for a date
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
