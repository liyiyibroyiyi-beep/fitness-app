"use client";

// ============================================================
// /admin — 管理控制台 (Management Console)
// ============================================================
// 风格: 极简、硬朗、深色调
//   1. 顶部 '今日打卡' 按钮 → 体重输入弹窗
//   2. 动态膳食清单 (早/午/晚/加餐) → 营养素进度条 + 热量盈余监测
//   3. 大重量力量训练日志 → 三Tab标签页(胸/背/肩膀) + 快速添加组数/重量/次数
// ============================================================

import { useState } from "react";
import {
  useFitnessStore,
  computeNutrition,
  getExercisesByCategory,
  getAllExercisesByCategory,
  getExerciseName,
} from "@/stores/useFitnessStore";
import { searchFoods, getFoodById } from "@/lib/foodDatabase";
import PRCelebrationOverlay from "@/components/PRCelebrationOverlay";
import type {
  NutritionTargets,
  PRResult,
  WorkoutCategoryId,
  DailyMeals,
  MealEntry,
  MealFoodEntry,
  FoodItem,
} from "@/lib/types";

// ---- Sub-components ----

/** Weight input modal for daily check-in */
function CheckInModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (weight: number) => void;
}) {
  const [weight, setWeight] = useState("");

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(weight);
    if (isNaN(w) || w <= 0) return;
    onConfirm(w);
    setWeight("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-sm shadow-2xl"
      >
        <h2 className="text-xl font-bold text-white mb-4">今日打卡 · 体重录入</h2>
        <div className="mb-4">
          <label className="block text-sm text-zinc-400 mb-1">晨起体重 (kg)</label>
          <input
            type="number"
            step="0.1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="例: 75.3"
            autoFocus
            className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-3 text-white text-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-zinc-600 text-zinc-400 hover:text-white hover:border-zinc-500 transition"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={!weight || parseFloat(weight) <= 0}
            className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-bold transition"
          >
            确认打卡
          </button>
        </div>
      </form>
    </div>
  );
}

/** Progress bar component */
function ProgressBar({
  label,
  current,
  target,
  unit,
  color = "amber",
}: {
  label: string;
  current: number;
  target: number;
  unit: string;
  color?: "amber" | "blue" | "green" | "red";
}) {
  const pct = Math.min((current / target) * 100, 100);
  const colorMap: Record<string, string> = {
    amber: "bg-amber-500",
    blue: "bg-blue-500",
    green: "bg-emerald-500",
    red: "bg-red-500",
  };

  return (
    <div className="mb-2">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-zinc-400">{label}</span>
        <span className="text-white font-mono">
          {current.toFixed(1)} / {target.toFixed(1)} {unit}
        </span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorMap[color]} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Nutrition dashboard with meal slots */
function NutritionDashboard({ targets }: { targets: NutritionTargets }) {
  const mealsData = useFitnessStore((s) => s.meals);
  const addFoodToMeal = useFitnessStore((s) => s.addFoodToMeal);
  const removeFoodFromMeal = useFitnessStore((s) => s.removeFoodFromMeal);

  // Derive today's meals from raw data — subscribing to s.meals triggers re-render on change
  const todayKey = new Date().toISOString().slice(0, 10);
  const emptySlot = () => ({ foods: [] as never[], protein: 0, carbs: 0, fat: 0, kcal: 0 });
  const todayMeals = mealsData[todayKey] ?? { breakfast: emptySlot(), lunch: emptySlot(), dinner: emptySlot(), snack: emptySlot() };
  const { breakfast, lunch, dinner, snack } = todayMeals;
  const meals = { breakfast, lunch, dinner, snack };

  const total = {
    protein: breakfast.protein + lunch.protein + dinner.protein + snack.protein,
    carbs: breakfast.carbs + lunch.carbs + dinner.carbs + snack.carbs,
    fat: breakfast.fat + lunch.fat + dinner.fat + snack.fat,
    kcal: breakfast.kcal + lunch.kcal + dinner.kcal + snack.kcal,
  };

  const caloriePct = targets.tdee > 0 ? (total.kcal / targets.tdee) * 100 : 0;
  const inSurplus = total.kcal >= targets.surplusLow && total.kcal <= targets.surplusHigh;
  const surplusPct = targets.tdee > 0 ? ((total.kcal - targets.tdee) / targets.tdee) * 100 : 0;

  const mealSlots: { key: keyof DailyMeals; label: string; emoji: string }[] = [
    { key: "breakfast", label: "早餐", emoji: "🌅" },
    { key: "lunch", label: "午餐", emoji: "☀️" },
    { key: "dinner", label: "晚餐", emoji: "🌙" },
    { key: "snack", label: "加餐", emoji: "🍌" },
  ];

  return (
    <div>
      {/* Calorie surplus indicator */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-zinc-400">摄入热量 / TDEE</span>
          <span
            className={`text-sm font-bold ${
              inSurplus ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {total.kcal > 0
              ? inSurplus
                ? `✓ 盈余 ${surplusPct.toFixed(1)}% (目标 15%-20%)`
                : `⚠ 盈余 ${surplusPct.toFixed(1)}% (未达标)`
              : "尚未录入饮食"}
          </span>
        </div>
        {/* Multi-zone progress bar */}
        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden relative">
          {/* 15%-20% target zone highlight */}
          <div
            className="absolute h-full bg-emerald-500/20 border-l border-r border-emerald-500/50"
            style={{ left: "15%", width: "5%" }}
          />
          {/* Actual fill */}
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              inSurplus ? "bg-emerald-500" : total.kcal > 0 ? "bg-red-500" : "bg-zinc-700"
            }`}
            style={{ width: `${Math.min(caloriePct, 30)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-zinc-500 mt-1">
          <span>{total.kcal.toFixed(0)} kcal</span>
          <span>
            目标: {targets.surplusLow.toFixed(0)} – {targets.surplusHigh.toFixed(0)} kcal
          </span>
        </div>
      </div>

      {/* Macro progress bars */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
        <h4 className="text-sm font-semibold text-zinc-300 mb-3">今日宏量营养素</h4>
        <ProgressBar
          label="蛋白质"
          current={total.protein}
          target={targets.proteinG}
          unit="g"
          color="red"
        />
        <ProgressBar
          label="碳水"
          current={total.carbs}
          target={targets.carbsG}
          unit="g"
          color="amber"
        />
        <ProgressBar
          label="脂肪"
          current={total.fat}
          target={targets.fatG}
          unit="g"
          color="blue"
        />
      </div>

      {/* Meal slot editors */}
      <div className="grid grid-cols-2 gap-3">
        {mealSlots.map(({ key, label, emoji }) => (
          <MealSlotEditor
            key={key}
            slot={key}
            label={label}
            emoji={emoji}
            meal={meals[key]}
            onAddFood={addFoodToMeal}
            onRemoveFood={removeFoodFromMeal}
          />
        ))}
      </div>
    </div>
  );
}

/** Individual meal slot editor — food-based entry */
function MealSlotEditor({
  slot,
  label,
  emoji,
  meal,
  onAddFood,
  onRemoveFood,
}: {
  slot: keyof DailyMeals;
  label: string;
  emoji: string;
  meal: MealEntry;
  onAddFood: (slot: keyof DailyMeals, foodId: string, weight: number) => void;
  onRemoveFood: (slot: keyof DailyMeals, index: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [weight, setWeight] = useState("100");
  const [showDropdown, setShowDropdown] = useState(false);

  const results = searchFoods(search);

  const handleSelectFood = (food: FoodItem) => {
    const w = parseFloat(weight);
    if (isNaN(w) || w <= 0) return;
    onAddFood(slot, food.id, w);
    setSearch("");
    setWeight("100");
    setShowDropdown(false);
  };

  const handleAdd = () => {
    if (results.length > 0) {
      handleSelectFood(results[0]);
    }
  };

  const macros = (f: MealFoodEntry): { p: number; c: number; ft: number } => {
    const food = getFoodById(f.foodId);
    if (!food) return { p: 0, c: 0, ft: 0 };
    const factor = f.weight / 100;
    return {
      p: Math.round(food.proteinPer100g * factor * 10) / 10,
      c: Math.round(food.carbsPer100g * factor * 10) / 10,
      ft: Math.round(food.fatPer100g * factor * 10) / 10,
    };
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
      <h4 className="text-sm font-semibold text-zinc-300 mb-2">
        {emoji} {label}
      </h4>

      {/* Food search + weight + add button */}
      <div className="flex gap-2 mb-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            placeholder="搜索食物..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder:text-zinc-600"
          />
          {/* Dropdown results */}
          {showDropdown && search.trim() && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-30 max-h-36 overflow-y-auto">
              {results.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectFood(f)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-700 flex justify-between items-center"
                >
                  <span className="text-white">{f.name}</span>
                  <span className="text-zinc-500 text-[10px]">{f.category}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          type="number"
          step="10"
          min="1"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
          placeholder="g"
        />
        <span className="text-xs text-zinc-600 self-center">g</span>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!search.trim() || !weight}
          className="px-3 py-1.5 text-xs rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-medium transition"
        >
          添加
        </button>
      </div>

      {/* Food list */}
      {meal.foods && meal.foods.length > 0 ? (
        <div className="space-y-1 mb-2">
          {meal.foods.map((f, i) => {
            const m = macros(f);
            return (
              <div key={i} className="flex items-center gap-2 text-xs bg-zinc-800/50 rounded px-2 py-1">
                <span className="text-zinc-300 flex-1 truncate">{f.foodName}</span>
                <span className="text-zinc-500">{f.weight}g</span>
                <span className="text-zinc-600 font-mono text-[10px]">
                  P{m.p.toFixed(0)} C{m.c.toFixed(0)} F{m.ft.toFixed(0)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveFood(slot, i)}
                  className="text-zinc-500 hover:text-red-400 transition ml-1 text-sm leading-none"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-[10px] text-zinc-600 mb-2 py-1">暂无食物，请搜索并添加</div>
      )}

      {/* Totals */}
      <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
        <span className="text-xs text-zinc-500">热量</span>
        <span className="text-xs text-amber-400 font-mono">{meal.kcal.toFixed(0)} kcal</span>
        <span className="text-xs text-zinc-600 ml-auto">
          P{meal.protein.toFixed(0)}·C{meal.carbs.toFixed(0)}·F{meal.fat.toFixed(0)}
        </span>
      </div>
    </div>
  );
}

/** Exercise logging form with three category tabs */
function ExerciseLogger({ onPR }: { onPR: (pr: PRResult) => void }) {
  const logSet = useFitnessStore((s) => s.logSet);
  const addCustomExercise = useFitnessStore((s) => s.addCustomExercise);
  const customExercises = useFitnessStore((s) => s.customExercises);
  const exerciseTips = useFitnessStore((s) => s.exerciseTips);
  const setExerciseTip = useFitnessStore((s) => s.setExerciseTip);
  const deleteExerciseTip = useFitnessStore((s) => s.deleteExerciseTip);

  const [category, setCategory] = useState<WorkoutCategoryId>("chest");
  const allExercises = getAllExercisesByCategory(category, customExercises);
  const [selectedExId, setSelectedExId] = useState(allExercises[0]?.id ?? "");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [customName, setCustomName] = useState("");

  // Tip editing state
  const [tipOpen, setTipOpen] = useState(false);
  const [tipText, setTipText] = useState("");
  const currentTip = exerciseTips[selectedExId] ?? "";

  const handleTabChange = (cat: WorkoutCategoryId) => {
    setCategory(cat);
    const exs = getAllExercisesByCategory(cat, customExercises);
    setSelectedExId(exs[0]?.id ?? "");
    setTipOpen(false);
  };

  const handleSelectExercise = (id: string) => {
    setSelectedExId(id);
    setTipOpen(false);
  };

  const handleOpenTip = () => {
    setTipText(currentTip);
    setTipOpen(true);
  };

  const handleSaveTip = () => {
    const trimmed = tipText.trim();
    if (trimmed) {
      setExerciseTip(selectedExId, trimmed);
    } else {
      deleteExerciseTip(selectedExId);
    }
    setTipOpen(false);
  };

  const handleDeleteTip = () => {
    deleteExerciseTip(selectedExId);
    setTipText("");
    setTipOpen(false);
  };

  const handleAddCustom = () => {
    const name = customName.trim();
    if (!name) return;
    const def = addCustomExercise(name, category);
    setSelectedExId(def.id);
    setCustomName("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(weight);
    const r = parseInt(reps);
    if (isNaN(w) || isNaN(r) || w <= 0 || r <= 0) return;

    const result = logSet(selectedExId, category, w, r);
    if (result?.isPR) {
      onPR(result);
    }
    setWeight("");
    setReps("");
  };

  const categoryTabs: { id: WorkoutCategoryId; label: string }[] = [
    { id: "chest", label: "胸" },
    { id: "back", label: "背" },
    { id: "shoulder", label: "肩膀" },
  ];

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-zinc-300 mb-3">
        🏋️ 添加训练组
      </h3>

      {/* Category tabs — three parallel tabs matching JSON config */}
      <div className="flex gap-1 mb-3">
        {categoryTabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleTabChange(id)}
            className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition ${
              category === id
                ? "bg-amber-500 text-black"
                : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Exercise selector — card list */}
      <div className="mb-3">
        <label className="block text-xs text-zinc-500 mb-1.5">选择动作</label>
        <div className="grid grid-cols-2 gap-1.5">
          {allExercises.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => handleSelectExercise(ex.id)}
              className={`text-left px-3 py-2 text-xs rounded-lg transition border ${
                selectedExId === ex.id
                  ? "border-amber-500 bg-amber-500/10 text-amber-300"
                  : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              <span>{ex.name}</span>
              {exerciseTips[ex.id] && (
                <span className="ml-1 text-[10px]" title="已有心得">💡</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tip indicator & editor */}
      <div className="mb-3">
        {!tipOpen ? (
          <button
            type="button"
            onClick={handleOpenTip}
            className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition flex items-center gap-2 ${
              currentTip
                ? "border-amber-500/30 bg-amber-500/5 text-amber-300 hover:border-amber-500/60"
                : "border-zinc-800 bg-zinc-800/50 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
            }`}
          >
            <span>{currentTip ? "💡" : "💭"}</span>
            <span className="flex-1 truncate">
              {currentTip ? currentTip.slice(0, 40) + (currentTip.length > 40 ? "…" : "") : "添加动作心得…"}
            </span>
            <span className="text-[10px] text-zinc-600">{currentTip ? "点击编辑" : "点击添加"}</span>
          </button>
        ) : (
          <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400">
                💡 编辑心得 — {getExerciseName(selectedExId)}
              </span>
            </div>
            <textarea
              value={tipText}
              onChange={(e) => setTipText(e.target.value)}
              placeholder="记录这个动作的小技巧、发力感受、注意事项…"
              rows={3}
              autoFocus
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder:text-zinc-600 resize-none mb-2"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveTip}
                className="flex-1 py-1.5 text-xs rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-medium transition"
              >
                保存心得
              </button>
              {currentTip && (
                <button
                  type="button"
                  onClick={handleDeleteTip}
                  className="px-3 py-1.5 text-xs rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition"
                >
                  删除
                </button>
              )}
              <button
                type="button"
                onClick={() => setTipOpen(false)}
                className="px-3 py-1.5 text-xs rounded-lg border border-zinc-600 text-zinc-400 hover:text-white transition"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Custom exercise input */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="自定义动作名称..."
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder:text-zinc-600"
        />
        <button
          type="button"
          onClick={handleAddCustom}
          disabled={!customName.trim()}
          className="px-3 py-1.5 text-xs rounded-lg border border-zinc-600 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:border-zinc-800 disabled:text-zinc-600 transition shrink-0"
        >
          + 自定义
        </button>
      </div>

      {/* Weight + Reps */}
      <div className="flex gap-3 mb-3">
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1">重量 (kg)</label>
          <input
            type="number"
            step="0.5"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="80"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1">次数</label>
          <input
            type="number"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            placeholder="8"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={!weight || !reps}
        className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-bold text-sm transition"
      >
        记录组数
      </button>
    </form>
  );
}

/** Today's exercise log summary */
function TodayExerciseSummary() {
  const todayLog = useFitnessStore((s) => s.todayLog);
  const prRecords = useFitnessStore((s) => s.prRecords);

  const log = todayLog();
  if (!log || log.exercises.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center text-zinc-500 text-sm">
        今日尚无训练记录
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-zinc-300 mb-3">📋 今日训练记录</h3>
      {log.exercises.map((ex) => {
        const pr = prRecords[ex.exerciseId];
        return (
          <div key={ex.exerciseId} className="mb-3 last:mb-0">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-white font-medium">{ex.exerciseName}</span>
              {pr && (
                <span className="text-xs text-amber-500 font-mono">
                  PR: {pr.maxWeight.weight}kg × {pr.maxReps.reps}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ex.sets.map((s, i) => (
                <span
                  key={i}
                  className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-mono"
                >
                  {s.weight}kg × {s.reps}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Collapsible panel showing all exercise tips grouped by category */
function TipsPanel() {
  const exerciseTips = useFitnessStore((s) => s.exerciseTips);
  const customExercises = useFitnessStore((s) => s.customExercises);
  const setExerciseTip = useFitnessStore((s) => s.setExerciseTip);
  const deleteExerciseTip = useFitnessStore((s) => s.deleteExerciseTip);

  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const tippedIds = Object.keys(exerciseTips).filter((id) => exerciseTips[id]?.trim());

  if (tippedIds.length === 0) return null;

  const categories: { id: WorkoutCategoryId; label: string }[] = [
    { id: "chest", label: "胸" },
    { id: "back", label: "背" },
    { id: "shoulder", label: "肩膀" },
  ];

  const handleStartEdit = (id: string) => {
    setEditText(exerciseTips[id] ?? "");
    setEditingId(id);
  };

  const handleSaveEdit = () => {
    if (editingId) {
      const trimmed = editText.trim();
      if (trimmed) {
        setExerciseTip(editingId, trimmed);
      } else {
        deleteExerciseTip(editingId);
      }
    }
    setEditingId(null);
    setEditText("");
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition"
      >
        <span className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <span>📝</span> 训练心得笔记
          <span className="text-xs text-zinc-500 font-normal">({tippedIds.length})</span>
        </span>
        <span className={`text-xs text-zinc-500 transition-transform ${expanded ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {categories.map((cat) => {
            const allExs = getAllExercisesByCategory(cat.id, customExercises);
            const catTips = allExs.filter((ex) => exerciseTips[ex.id]?.trim());
            if (catTips.length === 0) return null;

            return (
              <div key={cat.id}>
                <h5 className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wider">
                  {cat.label}
                </h5>
                <div className="space-y-2">
                  {catTips.map((ex) => (
                    <div
                      key={ex.id}
                      className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-white">{ex.name}</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(ex.id)}
                            className="text-[10px] text-zinc-500 hover:text-amber-400 transition px-1.5 py-0.5"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteExerciseTip(ex.id)}
                            className="text-[10px] text-zinc-500 hover:text-red-400 transition px-1.5 py-0.5"
                          >
                            删除
                          </button>
                        </div>
                      </div>

                      {editingId === ex.id ? (
                        <div>
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={3}
                            autoFocus
                            className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder:text-zinc-600 resize-none mb-2"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              className="px-3 py-1 text-xs rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-medium transition"
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="px-3 py-1 text-xs rounded-lg border border-zinc-600 text-zinc-400 hover:text-white transition"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">
                          {exerciseTips[ex.id]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main Admin Page
// ============================================================

export default function AdminPage() {
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [prEvent, setPrEvent] = useState<PRResult | null>(null);

  const checkIn = useFitnessStore((s) => s.checkIn);
  const hasCheckedInToday = useFitnessStore((s) => s.hasCheckedInToday);
  const todayLog = useFitnessStore((s) => s.todayLog);
  const nutritionTargets = useFitnessStore((s) => s.nutritionTargets);

  const latestWeight = todayLog()?.weight ?? null;

  const targets = latestWeight ? computeNutrition(latestWeight) : nutritionTargets();

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* ---- Header ---- */}
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight">健身控制台</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              {latestWeight ? `今日体重: ${latestWeight}kg` : "尚未打卡"}
            </p>
          </div>
          <button
            onClick={() => setCheckInOpen(true)}
            className={`px-5 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 ${
              hasCheckedInToday()
                ? "bg-zinc-800 text-zinc-500"
                : "bg-amber-500 text-black hover:bg-amber-400 shadow-lg shadow-amber-500/20"
            }`}
          >
            {hasCheckedInToday() ? "✓ 已打卡" : "今日打卡"}
          </button>
        </header>

        {/* ---- Sections ---- */}
        <div className="space-y-6">
          {/* Section A: 动态膳食清单 */}
          <section>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-amber-500 rounded-full" />
              动态膳食清单
            </h2>
            {targets ? (
              <NutritionDashboard targets={targets} />
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-zinc-500">
                请先完成今日打卡以获取营养目标
              </div>
            )}
          </section>

          {/* Section B: 大重量力量训练日志 */}
          <section>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-red-500 rounded-full" />
              大重量力量训练日志
            </h2>
            <div className="space-y-4">
              <ExerciseLogger onPR={(pr) => setPrEvent(pr)} />
              <TodayExerciseSummary />
            </div>
          </section>

          {/* Section C: 训练心得笔记 */}
          <section>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-blue-500 rounded-full" />
              训练心得笔记
            </h2>
            <TipsPanel />
          </section>
        </div>

        {/* Footer nav */}
        <nav className="mt-8 pt-4 border-t border-zinc-800 flex gap-4">
          <a href="/share" className="text-sm text-zinc-500 hover:text-zinc-300 transition">
            查看分享页 →
          </a>
        </nav>
      </div>

      {/* Check-in Modal */}
      <CheckInModal
        open={checkInOpen}
        onClose={() => setCheckInOpen(false)}
        onConfirm={(w) => checkIn(w)}
      />

      {/* PR Celebration Overlay */}
      <PRCelebrationOverlay pr={prEvent} onDismiss={() => setPrEvent(null)} />
    </main>
  );
}
