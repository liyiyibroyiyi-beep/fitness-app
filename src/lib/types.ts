// ============================================================
// Types for the Fitness Check-in & Strength Training System
// ============================================================

/** A single set record for a strength exercise */
export interface SetRecord {
  weight: number;   // kg
  reps: number;
  timestamp: string; // ISO-8601 to-second precision
}

/** Data logged for a single exercise on a given day */
export interface ExerciseLog {
  exerciseId: string;
  exerciseName: string;
  sets: SetRecord[];
}

/** Daily check-in log, keyed by "YYYY-MM-DD" */
export interface DailyLog {
  date: string;         // "YYYY-MM-DD"
  weight: number;       // kg — morning bodyweight
  timestamp: string;    // ISO-8601 to-second precision
  exercises: ExerciseLog[];
}

/** Historical PR record — the best performance for an exercise */
export interface PRRecord {
  exerciseId: string;
  exerciseName: string;
  category: WorkoutCategoryId;
  /** PR by max weight */
  maxWeight: { weight: number; reps: number; date: string };
  /** PR by max reps at a given weight */
  maxReps: { weight: number; reps: number; date: string };
}

/** Nutrition targets derived from latest bodyweight */
export interface NutritionTargets {
  bmr: number;
  tdee: number;
  surplusLow: number;   // 15% surplus
  surplusHigh: number;  // 20% surplus
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Category identifiers */
export type WorkoutCategoryId = "chest" | "back" | "shoulder";

/** A single exercise definition with unique ID */
export interface ExerciseDef {
  id: string;
  name: string;
  category: WorkoutCategoryId;
}

/** A workout category grouping exercises together */
export interface WorkoutCategory {
  categoryId: WorkoutCategoryId;
  categoryName: string;
  exercises: ExerciseDef[];
}

/** The full workout configuration */
export interface WorkoutConfig {
  workout_categories: WorkoutCategory[];
}

// ---- Food Database Types ----

/** Categories for food classification */
export type FoodCategory = "肉类" | "主食" | "蔬菜" | "水果" | "乳制品" | "蛋类" | "豆制品" | "零食" | "其他";

/** A food item in the database with per-100g nutrition values */
export interface FoodItem {
  id: string;
  name: string;
  category: FoodCategory;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  kcalPer100g: number;
}

/** A food entry within a meal — stores the food reference + weight */
export interface MealFoodEntry {
  foodId: string;
  foodName: string;
  weight: number; // grams
}

/** Per-meal macro tracking with food list + derived totals */
export interface MealEntry {
  foods: MealFoodEntry[];
  protein: number;
  carbs: number;
  fat: number;
  kcal: number; // auto-calculated: protein*4 + carbs*4 + fat*9
}

/** Meals broken down by time slot */
export interface DailyMeals {
  breakfast: MealEntry;
  lunch: MealEntry;
  dinner: MealEntry;
  snack: MealEntry;
}

/** The overall shape of persisted store data */
export interface FitnessState {
  logs: Record<string, DailyLog>;       // date string → DailyLog
  prRecords: Record<string, PRRecord>;  // exerciseId → PRRecord
  meals: Record<string, DailyMeals>;    // date string → DailyMeals
  customExercises: Record<WorkoutCategoryId, ExerciseDef[]>; // user-defined exercises
  exerciseTips: Record<string, string>; // exerciseId → personal tip/note
}

/** PR result returned from logSet */
export interface PRResult {
  isPR: boolean;
  type: "weight" | "reps" | null;
  exerciseName: string;
  oldBest?: { weight: number; reps: number };
  newBest: { weight: number; reps: number };
}
