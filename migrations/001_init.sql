-- Initialize fitness tracker database schema

CREATE TABLE IF NOT EXISTS fitness_data (
  date       DATE PRIMARY KEY,
  weight     REAL NOT NULL DEFAULT 0,
  exercises  JSONB NOT NULL DEFAULT '[]',
  meals      JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pr_records (
  exercise_id   TEXT PRIMARY KEY,
  exercise_name TEXT NOT NULL,
  category      TEXT NOT NULL,
  max_weight    JSONB NOT NULL DEFAULT '{}',
  max_reps      JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS custom_exercises (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exercise_tips (
  exercise_id TEXT PRIMARY KEY,
  tip         TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fitness_data_date ON fitness_data(date DESC);
CREATE INDEX IF NOT EXISTS idx_pr_records_category ON pr_records(category);
CREATE INDEX IF NOT EXISTS idx_custom_exercises_category ON custom_exercises(category);
