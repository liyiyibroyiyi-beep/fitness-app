// ============================================================
// useFitnessStore — Zustand store for fitness check-in system
// ============================================================
// 硬编码基础身体参数 (hardcoded base body parameters)
//   身高 179cm, 年龄 25, 运动系数 1.5
//
// 计算公式:
//   BMR  = 10 * W + 998.75
//   TDEE = 2250 (固定值)
//   热量盈余目标: 10% → 总摄入 2500 kcal
//   蛋白质 = W * 2.6, 碳水 = W * 4.3, 脂肪 = W * 1.25
//
//   热量自动计算: kcal = 蛋白质*4 + 碳水*4 + 脂肪*9
// ============================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  DailyLog,
  ExerciseLog,
  SetRecord,
  PRRecord,
  PRResult,
  NutritionTargets,
  FitnessState,
  WorkoutCategoryId,
  WorkoutConfig,
  DailyMeals,
  MealEntry,
  MealFoodEntry,
  ExerciseDef,
} from "@/lib/types";
import { getFoodById } from "@/lib/foodDatabase";

// ---- Hardcoded base parameters ----
const HEIGHT_CM = 179;
const AGE = 25;
const ACTIVITY_COEFFICIENT = 1.5;

// ---- Exercise Presets (Updated per user specification) ----
// 胸 includes triceps actions; 背 includes biceps actions
export const WORKOUT_CONFIG: WorkoutConfig = {
  workout_categories: [
    {
      categoryId: "chest",
      categoryName: "胸",
      exercises: [
        { id: "barbell-bench-press", name: "杠铃卧推", category: "chest" },
        { id: "incline-dumbbell-press", name: "上斜哑铃卧推", category: "chest" },
        { id: "machine-chest-press", name: "器械平推", category: "chest" },
        { id: "dips", name: "臂屈伸", category: "chest" },
        { id: "triceps-rope-pushdown", name: "三头绳索下拉", category: "chest" },
      ],
    },
    {
      categoryId: "back",
      categoryName: "背",
      exercises: [
        { id: "pull-up-warmup", name: "引体向上热身", category: "back" },
        { id: "machine-lat-pulldown", name: "器械高位下拉", category: "back" },
        { id: "single-arm-machine-row", name: "单手器械划船", category: "back" },
        { id: "wide-grip-seated-row", name: "宽距坐姿划船", category: "back" },
        { id: "lat-pulldown-single-arm", name: "高位下拉/单臂", category: "back" },
        { id: "biceps-machine", name: "二头器械", category: "back" },
      ],
    },
    {
      categoryId: "shoulder",
      categoryName: "肩膀",
      exercises: [
        { id: "seated-dumbbell-shoulder-press", name: "坐姿哑铃推肩", category: "shoulder" },
        { id: "dumbbell-fly", name: "哑铃飞鸟", category: "shoulder" },
        { id: "cable-face-pull", name: "绳索面拉", category: "shoulder" },
        { id: "smith-machine-shoulder-press", name: "史密斯推肩", category: "shoulder" },
        { id: "machine-fly", name: "器械飞鸟", category: "shoulder" },
        { id: "reverse-pec-deck", name: "反向蝴蝶机", category: "shoulder" },
      ],
    },
  ],
};

/** Flat map: exerciseId → { name, category } for fast lookup */
export const EXERCISE_MAP: Record<string, { name: string; category: WorkoutCategoryId }> = {};
for (const cat of WORKOUT_CONFIG.workout_categories) {
  for (const ex of cat.exercises) {
    EXERCISE_MAP[ex.id] = { name: ex.name, category: ex.category };
  }
}

/** Get preset exercises for a given category */
export function getExercisesByCategory(catId: WorkoutCategoryId) {
  const cat = WORKOUT_CONFIG.workout_categories.find((c) => c.categoryId === catId);
  return cat?.exercises ?? [];
}

/** Get merged exercises (preset + custom) for a category from store state */
export function getAllExercisesByCategory(
  catId: WorkoutCategoryId,
  customExercises: Record<WorkoutCategoryId, ExerciseDef[]>
) {
  const preset = getExercisesByCategory(catId);
  const custom = customExercises[catId] ?? [];
  return [...preset, ...custom];
}

/** Lookup exercise name by ID */
export function getExerciseName(id: string): string {
  return EXERCISE_MAP[id]?.name ?? id;
}

// ---- Helpers ----

/** Return today's date as "YYYY-MM-DD" */
function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** ISO-8601 timestamp with second precision */
function nowISO(): string {
  const d = new Date();
  return d.toISOString().replace(/\.\d{3}Z$/, "Z"); // strip ms
}

/** Compute nutrition targets from a given weight */
export function computeNutrition(weight: number): NutritionTargets {
  const bmr = 10 * weight + 998.75;
  const TDEE = 2250; // Fixed TDEE
  return {
    bmr: Math.round(bmr * 100) / 100,
    tdee: TDEE,
    surplusLow: 2500,  // TDEE + 10% surplus
    surplusHigh: 2500,
    proteinG: Math.round(weight * 2.6 * 10) / 10,
    carbsG: Math.round(weight * 4.3 * 10) / 10,
    fatG: Math.round(weight * 1.25 * 10) / 10,
  };
}

/** Auto-calculate kcal from macros: protein*4 + carbs*4 + fat*9 */
export function calcMealKcal(protein: number, carbs: number, fat: number): number {
  return Math.round((protein * 4 + carbs * 4 + fat * 9) * 10) / 10;
}

/** Create an empty meal entry */
export function emptyMeal(): MealEntry {
  return { foods: [], protein: 0, carbs: 0, fat: 0, kcal: 0 };
}

/** Create empty daily meals */
export function emptyDailyMeals(): DailyMeals {
  return {
    breakfast: emptyMeal(),
    lunch: emptyMeal(),
    dinner: emptyMeal(),
    snack: emptyMeal(),
  };
}

/** Get the latest weight from the logs (most recent date) */
export function getLatestWeight(logs: Record<string, DailyLog>): number | null {
  const dates = Object.keys(logs).sort();
  if (dates.length === 0) return null;
  return logs[dates[dates.length - 1]].weight;
}

// ---- Store Interface ----

export interface FitnessStore extends FitnessState {
  // -- Actions --
  /** 主打卡函数: record today's bodyweight */
  checkIn: (weight: number) => void;

  /** Log a completed set for an exercise today */
  logSet: (exerciseId: string, category: WorkoutCategoryId, weight: number, reps: number) => PRResult | null;

  /** Add a food to a meal slot for today with given weight (grams) */
  addFoodToMeal: (slot: keyof DailyMeals, foodId: string, weight: number) => void;

  /** Remove a food entry from a meal slot by index */
  removeFoodFromMeal: (slot: keyof DailyMeals, index: number) => void;

  /** Add a custom exercise to a category */
  addCustomExercise: (name: string, category: WorkoutCategoryId) => ExerciseDef;

  /** Save a personal tip/note for an exercise */
  setExerciseTip: (exerciseId: string, tip: string) => void;

  /** Delete a personal tip for an exercise */
  deleteExerciseTip: (exerciseId: string) => void;

  /** Remove a daily log (for admin corrections) */
  removeLog: (date: string) => void;

  // -- Derived / Computed --
  /** Latest weight from logs */
  latestWeight: () => number | null;

  /** Nutrition targets derived from latest weight */
  nutritionTargets: () => NutritionTargets | null;

  /** Get the current streak of consecutive check-in days */
  streak: () => number;

  /** Get PR records for a category */
  prByCategory: (category: WorkoutCategoryId) => PRRecord[];

  /** Get today's log if exists */
  todayLog: () => DailyLog | null;

  /** Get today's meals if exists */
  todayMeals: () => DailyMeals;

  /** Check if today has been checked in */
  hasCheckedInToday: () => boolean;
}

// ---- The Store ----

export const useFitnessStore = create<FitnessStore>()(
  persist(
    (set, get) => ({
      // ---- Initial State ----
      logs: {},
      prRecords: {},
      meals: {},
      customExercises: { chest: [], back: [], shoulder: [] },
      exerciseTips: {},

      // ---- Actions ----

      checkIn: (weight: number) => {
        const date = todayKey();
        const ts = nowISO();
        const existing = get().logs[date];

        const log: DailyLog = {
          date,
          weight,
          timestamp: ts,
          exercises: existing?.exercises ?? [],
        };

        set((s) => ({
          logs: { ...s.logs, [date]: log },
        }));
      },

      logSet: (
        exerciseId: string,
        category: WorkoutCategoryId,
        weight: number,
        reps: number
      ): PRResult | null => {
        const date = todayKey();
        const ts = nowISO();
        const logs = get().logs;
        const prRecords = { ...get().prRecords };

        const exerciseName = getExerciseName(exerciseId);

        // --- Ensure today's log exists (create lightweight entry if no checkIn yet) ---
        const todayLog: DailyLog = logs[date] ?? {
          date,
          weight: 0, // placeholder — user should checkIn first
          timestamp: ts,
          exercises: [],
        };

        // Find existing exercise entry for today
        const exIdx = todayLog.exercises.findIndex(
          (e) => e.exerciseId === exerciseId
        );

        const newSet: SetRecord = { weight, reps, timestamp: ts };

        let updatedExercises: ExerciseLog[];
        if (exIdx >= 0) {
          updatedExercises = todayLog.exercises.map((e, i) =>
            i === exIdx ? { ...e, sets: [...e.sets, newSet] } : e
          );
        } else {
          updatedExercises = [
            ...todayLog.exercises,
            { exerciseId, exerciseName, sets: [newSet] },
          ];
        }

        const updatedLog: DailyLog = {
          ...todayLog,
          exercises: updatedExercises,
        };

        // --- PR Determination ---
        const existingPR: PRRecord | undefined = prRecords[exerciseId];
        let prResult: PRResult | null = null;

        const newEntry = { weight, reps, date };

        if (!existingPR) {
          // First time — auto PR
          prRecords[exerciseId] = {
            exerciseId,
            exerciseName,
            category,
            maxWeight: newEntry,
            maxReps: newEntry,
          };
          prResult = {
            isPR: true,
            type: "weight", // first record counts as both
            exerciseName,
            newBest: { weight, reps },
          };
        } else {
          let isWeightPR = false;
          let isRepsPR = false;
          const oldWeight = existingPR.maxWeight;
          const oldReps = existingPR.maxReps;

          // PR by weight: heavier than previous max weight
          if (weight > oldWeight.weight) {
            isWeightPR = true;
            existingPR.maxWeight = newEntry;
          }

          // PR by reps: same or higher weight, more reps
          if (weight >= oldReps.weight && reps > oldReps.reps) {
            isRepsPR = true;
            existingPR.maxReps = newEntry;
          }

          if (isWeightPR || isRepsPR) {
            prRecords[exerciseId] = { ...existingPR };
            prResult = {
              isPR: true,
              type: isWeightPR ? "weight" : "reps",
              exerciseName,
              oldBest: isWeightPR
                ? { weight: oldWeight.weight, reps: oldWeight.reps }
                : { weight: oldReps.weight, reps: oldReps.reps },
              newBest: { weight, reps },
            };
          }
        }

        set({
          logs: { ...logs, [date]: updatedLog },
          prRecords,
        });

        return prResult;
      },

      addFoodToMeal: (slot: keyof DailyMeals, foodId: string, weight: number) => {
        const food = getFoodById(foodId);
        if (!food || weight <= 0) return;

        const date = todayKey();
        const meals = { ...get().meals };
        const today: DailyMeals = meals[date]
          ? {
              ...meals[date],
              [slot]: {
                ...meals[date][slot],
                foods: [...(meals[date][slot].foods ?? [])],
              },
            }
          : emptyDailyMeals();

        const slotMeal = today[slot];
        if (!slotMeal.foods) slotMeal.foods = [];

        const factor = weight / 100;
        const addedProtein = Math.round(food.proteinPer100g * factor * 10) / 10;
        const addedCarbs = Math.round(food.carbsPer100g * factor * 10) / 10;
        const addedFat = Math.round(food.fatPer100g * factor * 10) / 10;

        const foodEntry: MealFoodEntry = {
          foodId: food.id,
          foodName: food.name,
          weight,
        };

        slotMeal.foods = [...slotMeal.foods, foodEntry];
        slotMeal.protein = Math.round((slotMeal.protein + addedProtein) * 10) / 10;
        slotMeal.carbs = Math.round((slotMeal.carbs + addedCarbs) * 10) / 10;
        slotMeal.fat = Math.round((slotMeal.fat + addedFat) * 10) / 10;
        slotMeal.kcal = calcMealKcal(slotMeal.protein, slotMeal.carbs, slotMeal.fat);

        today[slot] = slotMeal;
        meals[date] = today;

        set({ meals });
      },

      removeFoodFromMeal: (slot: keyof DailyMeals, index: number) => {
        const date = todayKey();
        const meals = { ...get().meals };
        const today = meals[date];
        if (!today) return;

        const slotMeal = { ...today[slot], foods: [...(today[slot].foods ?? [])] };
        if (index < 0 || index >= slotMeal.foods.length) return;

        // Remove the food at index
        slotMeal.foods = slotMeal.foods.filter((_, i) => i !== index);

        // Full recalc from remaining foods
        let protein = 0, carbs = 0, fat = 0;
        for (const f of slotMeal.foods) {
          const food = getFoodById(f.foodId);
          if (food) {
            const factor = f.weight / 100;
            protein += food.proteinPer100g * factor;
            carbs += food.carbsPer100g * factor;
            fat += food.fatPer100g * factor;
          }
        }
        slotMeal.protein = Math.round(protein * 10) / 10;
        slotMeal.carbs = Math.round(carbs * 10) / 10;
        slotMeal.fat = Math.round(fat * 10) / 10;
        slotMeal.kcal = calcMealKcal(slotMeal.protein, slotMeal.carbs, slotMeal.fat);

        today[slot] = slotMeal;
        set({ meals });
      },

      addCustomExercise: (name: string, category: WorkoutCategoryId): ExerciseDef => {
        const id = `custom-${Date.now()}`;
        const exercise: ExerciseDef = { id, name, category };
        set((s) => ({
          customExercises: {
            ...s.customExercises,
            [category]: [...(s.customExercises[category] ?? []), exercise],
          },
        }));
        // Also register in EXERCISE_MAP for name lookup
        EXERCISE_MAP[id] = { name, category };
        return exercise;
      },

      setExerciseTip: (exerciseId: string, tip: string) => {
        set((s) => ({
          exerciseTips: { ...s.exerciseTips, [exerciseId]: tip },
        }));
      },

      deleteExerciseTip: (exerciseId: string) => {
        set((s) => {
          const { [exerciseId]: _, ...rest } = s.exerciseTips;
          return { exerciseTips: rest };
        });
      },

      removeLog: (date: string) => {
        const { [date]: _, ...restLogs } = get().logs;
        const { [date]: __, ...restMeals } = get().meals;
        set({ logs: restLogs, meals: restMeals });
      },

      // ---- Derived / Computed ----

      latestWeight: () => getLatestWeight(get().logs),

      nutritionTargets: () => {
        const w = getLatestWeight(get().logs);
        return w !== null ? computeNutrition(w) : null;
      },

      streak: () => {
        const dates = Object.keys(get().logs).sort().reverse();
        if (dates.length === 0) return 0;

        let streak = 0;
        const now = new Date();
        // Start from today and walk backwards
        for (let i = 0; ; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          if (dates.includes(key)) {
            streak++;
          } else {
            break;
          }
        }
        return streak;
      },

      prByCategory: (category: WorkoutCategoryId) => {
        return Object.values(get().prRecords).filter(
          (pr) => pr.category === category
        );
      },

      todayLog: () => {
        return get().logs[todayKey()] ?? null;
      },

      todayMeals: () => {
        return get().meals[todayKey()] ?? emptyDailyMeals();
      },

      hasCheckedInToday: () => {
        return todayKey() in get().logs;
      },
    }),
    {
      name: "fitness-store", // localStorage key
    }
  )
);
