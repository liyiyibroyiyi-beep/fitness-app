-- migrations/002_food_items.sql
-- Food nutrition database table — replaces hardcoded foodDatabase.ts
CREATE TABLE IF NOT EXISTS food_items (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL,
  protein_per_100g REAL NOT NULL DEFAULT 0,
  carbs_per_100g   REAL NOT NULL DEFAULT 0,
  fat_per_100g     REAL NOT NULL DEFAULT 0,
  kcal_per_100g    REAL NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_items_category ON food_items(category);
