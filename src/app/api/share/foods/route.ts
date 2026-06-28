import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET() {
  try {
    const rows = await sql`
      SELECT id, name, category, protein_per_100g, carbs_per_100g, fat_per_100g, kcal_per_100g
      FROM food_items
      ORDER BY category, name
    `;

    const foods = rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      proteinPer100g: Number(r.protein_per_100g),
      carbsPer100g: Number(r.carbs_per_100g),
      fatPer100g: Number(r.fat_per_100g),
      kcalPer100g: Number(r.kcal_per_100g),
    }));

    return NextResponse.json({ foods });
  } catch (error) {
    console.error("GET /api/share/foods error:", error);
    return NextResponse.json({ error: "Failed to load foods" }, { status: 500 });
  }
}
