// ============================================================
// POST /api/admin/exercises -- add a custom exercise
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
