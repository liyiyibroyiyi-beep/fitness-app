// ============================================================
// useFitnessStore — Zustand store for fitness check-in system
// ============================================================
// 硬编码基础身体参数 (hardcoded base body parameters)
//   身高 179cm, 年龄 25, 运动系数 1.5
//
// 计算公式:
//   BMR  = 10 * W + 998.75
//   TDEE = 2250 (固定值)
//   蛋白质 = W * 2.6, 碳水 = W * 4.3, 脂肪 = W * 1.25
//
//   热量自动计算: kcal = 蛋白质*4 + 碳水*4 + 脂肪*9
// ============================================================
// CHANGED: Removed localStorage persist — data now lives in Neon Postgres
// CHANGED: All write actions now sync to /api/admin/* endpoints
// NEW:     loadData() fetches all data from /api/share/* on mount
// ============================================================

import { create } from "zustand";
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
import { getFoodById, setFoodItems } from "@/lib/foodDatabase";

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

// ---- API Helpers (NEW) ----

async function apiPost(path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`API ${path} failed:`, res.status);
    return res.ok;
  } catch (err) {
    console.error(`API ${path} error:`, err);
    return false;
  }
}

async function apiPut(path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`API ${path} failed:`, res.status);
    return res.ok;
  } catch (err) {
    console.error(`API ${path} error:`, err);
    return false;
  }
}

async function apiDelete(path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(path, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`API ${path} failed:`, res.status);
    return res.ok;
  } catch (err) {
    console.error(`API ${path} error:`, err);
    return false;
  }
}

// ---- Store Interface ----

export interface FitnessStore extends FitnessState {
  // NEW: data loading & auth state
  loaded: boolean;
  loading: boolean;
  authenticated: boolean;

  // NEW: core lifecycle
  loadData: () => Promise<void>;
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  refreshFoodItems: () => Promise<void>;

  // -- Actions (same as before, now with API sync) --
  /** 主打卡函数: record bodyweight for today or a specific date */
  checkIn: (weight: number, date?: string) => Promise<void>;

  /** Log a completed set for an exercise today */
  logSet: (exerciseId: string, category: WorkoutCategoryId, weight: number, reps: number) => Promise<PRResult | null>;

  /** Add a food to a meal slot for today with given weight (grams) */
  addFoodToMeal: (slot: keyof DailyMeals, foodId: string, weight: number) => Promise<boolean>;

  /** Remove a food entry from a meal slot by index */
  removeFoodFromMeal: (slot: keyof DailyMeals, index: number) => Promise<boolean>;

  /** Add a custom exercise to a category */
  addCustomExercise: (name: string, category: WorkoutCategoryId) => Promise<ExerciseDef>;

  /** Save a personal tip/note for an exercise */
  setExerciseTip: (exerciseId: string, tip: string) => Promise<void>;

  /** Delete a personal tip for an exercise */
  deleteExerciseTip: (exerciseId: string) => Promise<void>;

  /** Remove a daily log (for admin corrections) */
  removeLog: (date: string) => Promise<void>;

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
  (set, get) => ({
    // ---- Initial State ----
    logs: {},
    prRecords: {},
    meals: {},
    customExercises: { chest: [], back: [], shoulder: [] },
    exerciseTips: {},
    loaded: false,
    loading: false,
    authenticated: false,

    // ---- Lifecycle ----

    loadData: async () => {
      const state = get();
      if (state.loaded || state.loading) return;

      set({ loading: true });

      try {
        const [logsRes, prsRes, foodsRes] = await Promise.all([
          fetch("/api/share/logs"),
          fetch("/api/share/prs"),
          fetch("/api/share/foods"),
        ]);

        // Load food items from DB into the module-level cache
        if (foodsRes.ok) {
          const { foods } = await foodsRes.json();
          if (foods) setFoodItems(foods);
        }

        if (logsRes.ok) {
          const { logs, meals } = await logsRes.json();
          // Merge custom exercises from PRs response into EXERCISE_MAP
          if (prsRes.ok) {
            const { prRecords, customExercises, exerciseTips } =
              await prsRes.json();

            // Register custom exercise names in EXERCISE_MAP
            if (customExercises) {
              for (const cat of ["chest", "back", "shoulder"] as WorkoutCategoryId[]) {
                const exs = customExercises[cat] ?? [];
                for (const ex of exs) {
                  EXERCISE_MAP[ex.id] = { name: ex.name, category: ex.category as WorkoutCategoryId };
                }
              }
            }

            set({
              logs: logs ?? {},
              meals: meals ?? {},
              prRecords: prRecords ?? {},
              customExercises: customExercises ?? { chest: [], back: [], shoulder: [] },
              exerciseTips: exerciseTips ?? {},
            });
          } else {
            set({ logs: logs ?? {}, meals: meals ?? {} });
          }
        }
      } catch (err) {
        console.error("Failed to load data from server:", err);
      }

      set({ loaded: true, loading: false });
    },

    login: async (password: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const data = await res.json();
        if (data.success) {
          set({ authenticated: true });
          return true;
        }
        return false;
      } catch (err) {
        console.error("Login error:", err);
        return false;
      }
    },

    logout: async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch (err) {
        console.error("Logout error:", err);
      }
      set({ authenticated: false });
    },

    checkAuth: async () => {
      try {
        const res = await fetch("/api/auth/check");
        const data = await res.json();
        set({ authenticated: data.authenticated ?? false });
      } catch {
        set({ authenticated: false });
      }
    },

    refreshFoodItems: async () => {
      try {
        const res = await fetch("/api/share/foods");
        const data = await res.json();
        if (data.foods) setFoodItems(data.foods);
      } catch {
        // keep current cache on error
      }
    },

    // ---- Actions (with API sync) ----

    checkIn: async (weight: number, date?: string) => {
      const d = date ?? todayKey();
      const ts = nowISO();
      const existing = get().logs[d];

      const log: DailyLog = {
        date: d,
        weight,
        timestamp: ts,
        exercises: existing?.exercises ?? [],
      };

      // Optimistic local update
      const prevLogs = { ...get().logs };
      set((s) => ({
        logs: { ...s.logs, [d]: log },
      }));

      // Sync to server
      const ok = await apiPost("/api/admin/logs", {
        date: d,
        weight,
        exercises: log.exercises,
      });

      if (!ok) {
        set({ logs: prevLogs });
      }
    },

    logSet: async (
      exerciseId: string,
      category: WorkoutCategoryId,
      weight: number,
      reps: number
    ): Promise<PRResult | null> => {
      const date = todayKey();
      const ts = nowISO();
      const currentLogs = { ...get().logs };
      const currentPRs = { ...get().prRecords };

      const exerciseName = getExerciseName(exerciseId);

      // Build updated log
      const todayLog: DailyLog = currentLogs[date] ?? {
        date,
        weight: 0,
        timestamp: ts,
        exercises: [],
      };

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

      // PR Determination
      const existingPR = currentPRs[exerciseId];
      let prResult: PRResult | null = null;
      let updatedPRs = { ...currentPRs };

      const newEntry = { weight, reps, date };

      if (!existingPR) {
        updatedPRs[exerciseId] = {
          exerciseId,
          exerciseName,
          category,
          maxWeight: newEntry,
          maxReps: newEntry,
        };
        prResult = {
          isPR: true,
          type: "weight",
          exerciseName,
          newBest: { weight, reps },
        };
      } else {
        let isWeightPR = false;
        let isRepsPR = false;
        const clone = { ...existingPR };

        if (weight > clone.maxWeight.weight) {
          isWeightPR = true;
          clone.maxWeight = newEntry;
        }
        if (weight >= clone.maxReps.weight && reps > clone.maxReps.reps) {
          isRepsPR = true;
          clone.maxReps = newEntry;
        }

        if (isWeightPR || isRepsPR) {
          updatedPRs[exerciseId] = clone;
          prResult = {
            isPR: true,
            type: isWeightPR ? "weight" : "reps",
            exerciseName,
            oldBest: isWeightPR
              ? { weight: existingPR.maxWeight.weight, reps: existingPR.maxWeight.reps }
              : { weight: existingPR.maxReps.weight, reps: existingPR.maxReps.reps },
            newBest: { weight, reps },
          };
        }
      }

      // Optimistic local update
      set({
        logs: { ...currentLogs, [date]: updatedLog },
        prRecords: updatedPRs,
      });

      // Sync logs to server
      const logOk = await apiPost("/api/admin/logs", {
        date,
        weight: updatedLog.weight,
        exercises: updatedLog.exercises,
      });

      if (!logOk) {
        // Rollback
        set({ logs: currentLogs, prRecords: currentPRs });
        return null;
      }

      // Sync PR to server if changed
      if (prResult?.isPR && updatedPRs[exerciseId]) {
        const pr = updatedPRs[exerciseId];
        await apiPost("/api/admin/prs", {
          exerciseId: pr.exerciseId,
          exerciseName: pr.exerciseName,
          category: pr.category,
          maxWeight: pr.maxWeight,
          maxReps: pr.maxReps,
        });
      }

      return prResult;
    },

    addFoodToMeal: async (slot: keyof DailyMeals, foodId: string, weight: number) => {
      const food = getFoodById(foodId);
      if (!food || weight <= 0) return false;

      const date = todayKey();
      const prevMeals = { ...get().meals };
      const currentMeals = { ...prevMeals };

      const prevDay = currentMeals[date];
      const today: DailyMeals = prevDay
        ? JSON.parse(JSON.stringify(prevDay))
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
      currentMeals[date] = today;

      // Optimistic update
      set({ meals: currentMeals });

      // Sync to server
      const ok = await apiPost("/api/admin/meals", {
        date,
        meals: today,
      });

      if (!ok) {
        set({ meals: prevMeals });
        return false;
      }
      return true;
    },

    removeFoodFromMeal: async (slot: keyof DailyMeals, index: number) => {
      const date = todayKey();
      const prevMeals = { ...get().meals };
      const currentMeals = { ...prevMeals };

      const prevDay = currentMeals[date];
      if (!prevDay) return false;

      const today: DailyMeals = JSON.parse(JSON.stringify(prevDay));
      const slotMeal = today[slot];
      if (index < 0 || index >= slotMeal.foods.length) return false;

      slotMeal.foods = slotMeal.foods.filter((_: MealFoodEntry, i: number) => i !== index);

      // Recalc from remaining foods
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
      currentMeals[date] = today;

      // Optimistic update
      set({ meals: currentMeals });

      // Sync to server
      const ok = await apiPost("/api/admin/meals", {
        date,
        meals: today,
      });

      if (!ok) {
        set({ meals: prevMeals });
        return false;
      }
      return true;
    },

    addCustomExercise: async (name: string, category: WorkoutCategoryId): Promise<ExerciseDef> => {
      const id = `custom-${Date.now()}`;
      const exercise: ExerciseDef = { id, name, category };

      // Optimistic local update
      const prevCustom = { ...get().customExercises };
      set((s) => ({
        customExercises: {
          ...s.customExercises,
          [category]: [...(s.customExercises[category] ?? []), exercise],
        },
      }));
      EXERCISE_MAP[id] = { name, category };

      // Sync to server
      const ok = await apiPost("/api/admin/exercises", { name, category });
      if (!ok) {
        set({ customExercises: prevCustom });
        delete EXERCISE_MAP[id];
      }

      return exercise;
    },

    setExerciseTip: async (exerciseId: string, tip: string) => {
      const prevTips = { ...get().exerciseTips };
      set((s) => ({
        exerciseTips: { ...s.exerciseTips, [exerciseId]: tip },
      }));

      const ok = await apiPut("/api/admin/tips", { exerciseId, tip });
      if (!ok) {
        set({ exerciseTips: prevTips });
      }
    },

    deleteExerciseTip: async (exerciseId: string) => {
      const prevTips = { ...get().exerciseTips };
      set((s) => {
        const { [exerciseId]: _, ...rest } = s.exerciseTips;
        return { exerciseTips: rest };
      });

      const ok = await apiDelete("/api/admin/tips", { exerciseId });
      if (!ok) {
        set({ exerciseTips: prevTips });
      }
    },

    removeLog: async (date: string) => {
      const prevLogs = { ...get().logs };
      const prevMeals = { ...get().meals };

      const { [date]: _, ...restLogs } = get().logs;
      const { [date]: __, ...restMeals } = get().meals;
      set({ logs: restLogs, meals: restMeals });

      const ok = await apiDelete("/api/admin/logs", { date });
      if (!ok) {
        set({ logs: prevLogs, meals: prevMeals });
      }
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
  })
);
