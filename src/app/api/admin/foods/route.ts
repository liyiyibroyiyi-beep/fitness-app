import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import sql from "@/lib/db";

export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id, name, category, proteinPer100g, carbsPer100g, fatPer100g } = await request.json();

    if (!id || !name || !category) {
      return NextResponse.json(
        { error: "id, name, and category are required" },
        { status: 400 }
      );
    }

    const protein = Number(proteinPer100g) || 0;
    const carbs = Number(carbsPer100g) || 0;
    const fat = Number(fatPer100g) || 0;
    const kcal = Math.round(protein * 4 + carbs * 4 + fat * 9);

    await sql`
      INSERT INTO food_items (id, name, category, protein_per_100g, carbs_per_100g, fat_per_100g, kcal_per_100g)
      VALUES (${id}, ${name}, ${category}, ${protein}, ${carbs}, ${fat}, ${kcal})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        protein_per_100g = EXCLUDED.protein_per_100g,
        carbs_per_100g = EXCLUDED.carbs_per_100g,
        fat_per_100g = EXCLUDED.fat_per_100g,
        kcal_per_100g = EXCLUDED.kcal_per_100g,
        updated_at = now()
    `;

    return NextResponse.json({
      food: { id, name, category, proteinPer100g: protein, carbsPer100g: carbs, fatPer100g: fat, kcalPer100g: kcal },
    });
  } catch (error) {
    console.error("POST /api/admin/foods error:", error);
    return NextResponse.json({ error: "Failed to save food" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await sql`DELETE FROM food_items WHERE id = ${id}`;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/admin/foods error:", error);
    return NextResponse.json({ error: "Failed to delete food" }, { status: 500 });
  }
}
