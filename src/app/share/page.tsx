"use client";

// ============================================================
// /share — 访客只读页面 (Read-only Visitor Page)
// ============================================================
// 无任何输入框和提交按钮
//   1. 顶部: 连续打卡天数 + 大重量高光墙 (PR records by category)
//   2. 中间: 体重走势迷你图 + 今日宏量营养素达成率
// ============================================================

import { useMemo, useEffect } from "react";
import {
  useFitnessStore,
  computeNutrition,
  getLatestWeight,
} from "@/stores/useFitnessStore";
import {
  getCurrentWeekSummary,
  getPreviousWeekSummary,
  getCurrentBiWeeklyBreakthrough,
  getHalfMonthPeriods,
  computeHalfMonthSummary,
  type WeekSummary,
  type BiWeeklyBreakthrough,
  type HalfMonthSummary,
} from "@/lib/analytics";
import type { WorkoutCategoryId, NutritionTargets } from "@/lib/types";

// ---- Mini SVG Line Chart for Weight Trend ----
function WeightTrendChart({ data }: { data: { date: string; weight: number }[] }) {
  if (data.length === 0) return null;

  const W = 320;
  const H = 100;
  const pad = 10;
  const maxW = Math.max(...data.map((d) => d.weight));
  const minW = Math.min(...data.map((d) => d.weight));
  const range = maxW - minW || 1;

  const points = data
    .map((d, i) => {
      const x = pad + (i / Math.max(data.length - 1, 1)) * (W - pad * 2);
      const y = H - pad - ((d.weight - minW) / range) * (H - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxWidth: W }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = pad + frac * (H - pad * 2);
        return (
          <line
            key={frac}
            x1={pad} y1={y} x2={W - pad} y2={y}
            stroke="#27272a" strokeWidth={0.5}
          />
        );
      })}
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke="#f59e0b"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dots */}
      {data.map((d, i) => {
        const x = pad + (i / Math.max(data.length - 1, 1)) * (W - pad * 2);
        const y = H - pad - ((d.weight - minW) / range) * (H - pad * 2);
        return (
          <circle
            key={i}
            cx={x} cy={y} r={2.5}
            fill="#f59e0b" stroke="#18181b" strokeWidth={1}
          />
        );
      })}
    </svg>
  );
}

// ---- Macro Donut (simple CSS ring) ----
function MacroRing({
  label,
  current,
  target,
  color,
}: {
  label: string;
  current: number;
  target: number;
  color: string;
}) {
  const pct = Math.min((current / target) * 100, 100);
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r="28" fill="none" stroke="#27272a" strokeWidth="5" />
        <circle
          cx="36" cy="36" r="28"
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 36 36)"
          className="transition-all duration-700"
        />
        <text x="36" y="34" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">
          {pct.toFixed(0)}%
        </text>
        <text x="36" y="48" textAnchor="middle" fill="#71717a" fontSize="7">
          {current.toFixed(0)}/{target.toFixed(0)}g
        </text>
      </svg>
      <span className="text-xs text-zinc-400 mt-1">{label}</span>
    </div>
  );
}

// ---- Calorie Surplus Ring ----
function CalorieRing({
  current,
  tdee,
  surplusLow,
  surplusHigh,
}: {
  current: number;
  tdee: number;
  surplusLow: number;
  surplusHigh: number;
}) {
  const pct = tdee > 0 ? (current / tdee) * 100 : 0;
  const displayPct = Math.min(pct, 130);
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (displayPct / 130) * circumference;

  const surplusPct = tdee > 0 ? ((current - tdee) / tdee) * 100 : 0;
  const inZone = current >= surplusLow && current <= surplusHigh;

  return (
    <div className="flex flex-col items-center">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r="28" fill="none" stroke="#27272a" strokeWidth="5" />
        {/* 10% surplus zone marker on ring */}
        <circle
          cx="36" cy="36" r="28"
          fill="none"
          stroke="#10b981"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.015} ${circumference * 0.985}`}
          strokeDashoffset={circumference * 0.89}
          transform="rotate(-90 36 36)"
          opacity={0.3}
        />
        <circle
          cx="36" cy="36" r="28"
          fill="none"
          stroke={inZone ? "#10b981" : "#f59e0b"}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 36 36)"
          className="transition-all duration-700"
        />
        <text x="36" y="32" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
          {current.toFixed(0)}
        </text>
        <text x="36" y="44" textAnchor="middle" fill="#71717a" fontSize="7">
          /{tdee.toFixed(0)} kcal
        </text>
        <text x="36" y="56" textAnchor="middle" fill={inZone ? "#10b981" : "#f59e0b"} fontSize="7">
          {surplusPct >= 0 ? "+" : ""}{surplusPct.toFixed(1)}%
        </text>
      </svg>
      <span className="text-xs text-zinc-400 mt-1">热量盈余</span>
    </div>
  );
}

// ============================================================
// Main Share Page
// ============================================================

export default function SharePage() {
  const logs = useFitnessStore((s) => s.logs);
  const prRecords = useFitnessStore((s) => s.prRecords);
  const streak = useFitnessStore((s) => s.streak);
  const todayMeals = useFitnessStore((s) => s.meals);
  const loaded = useFitnessStore((s) => s.loaded);
  const loading = useFitnessStore((s) => s.loading);
  const loadData = useFitnessStore((s) => s.loadData);

  useEffect(() => {
    if (!loaded && !loading) {
      loadData();
    }
  }, [loaded, loading, loadData]);
  // Derive today's meals from meals data so component re-renders on change
  const d = new Date();
  const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const emptySlot = () => ({ foods: [] as never[], protein: 0, carbs: 0, fat: 0, kcal: 0 });
  const meals = todayMeals[todayKey] ?? { breakfast: emptySlot(), lunch: emptySlot(), dinner: emptySlot(), snack: emptySlot() };

  // Latest weight & nutrition
  const latestWeight = useMemo(() => {
    return getLatestWeight(logs);
  }, [logs]);

  const targets: NutritionTargets | null = latestWeight
    ? computeNutrition(latestWeight)
    : null;

  // Weight trend data
  const weightTrend = useMemo(() => {
    return Object.keys(logs)
      .sort()
      .map((date) => ({ date, weight: logs[date].weight }));
  }, [logs]);

  // Today's meal totals
  const mealTotals = useMemo(() => {
    return {
      protein: meals.breakfast.protein + meals.lunch.protein + meals.dinner.protein + meals.snack.protein,
      carbs: meals.breakfast.carbs + meals.lunch.carbs + meals.dinner.carbs + meals.snack.carbs,
      fat: meals.breakfast.fat + meals.lunch.fat + meals.dinner.fat + meals.snack.fat,
      kcal: meals.breakfast.kcal + meals.lunch.kcal + meals.dinner.kcal + meals.snack.kcal,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayMeals]);

  // PR wall grouped by category
  const prByCat = useMemo(() => {
    const groups: Record<WorkoutCategoryId, typeof prRecords> = {
      chest: {},
      back: {},
      shoulder: {},
    };
    Object.entries(prRecords).forEach(([id, pr]) => {
      groups[pr.category][id] = pr;
    });
    return groups;
  }, [prRecords]);

  // ---- Analytics: Weekly / Bi-Weekly / Half-Month ----
  const currentWeek = useMemo(() => getCurrentWeekSummary(logs, todayMeals, prRecords), [logs, todayMeals, prRecords]);
  const previousWeek = useMemo(() => getPreviousWeekSummary(logs, todayMeals, prRecords), [logs, todayMeals, prRecords]);
  const biWeekly = useMemo(() => getCurrentBiWeeklyBreakthrough(logs, prRecords), [logs, prRecords]);

  const halfMonthPeriods = useMemo(() => getHalfMonthPeriods(), []);
  const currentHalfMonth = useMemo(
    () =>
      computeHalfMonthSummary(
        logs, todayMeals,
        halfMonthPeriods.current.start,
        halfMonthPeriods.current.end,
        `${halfMonthPeriods.current.start.getMonth() + 1}月${halfMonthPeriods.current.start.getDate() <= 15 ? "上半月" : "下半月"}`
      ),
    [logs, todayMeals, halfMonthPeriods]
  );
  const previousHalfMonth = useMemo(
    () =>
      computeHalfMonthSummary(
        logs, todayMeals,
        halfMonthPeriods.previous.start,
        halfMonthPeriods.previous.end,
        `${halfMonthPeriods.previous.start.getMonth() + 1}月${halfMonthPeriods.previous.start.getDate() <= 15 ? "上半月" : "下半月"}`
      ),
    [logs, todayMeals, halfMonthPeriods]
  );

  const catMeta: Record<WorkoutCategoryId, { label: string; emoji: string }> = {
    chest: { label: "胸", emoji: "💪" },
    back: { label: "背", emoji: "🦅" },
    shoulder: { label: "肩膀", emoji: "🔥" },
  };

  if (!loaded) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-zinc-500 text-sm">加载数据中…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* ---- Hero card: Streak + Weight ---- */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-amber-900/20 border border-zinc-800 p-6 mb-6">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
          <div className="relative">
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">
              Current Streak
            </p>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-6xl font-black text-amber-500">{streak()}</span>
              <span className="text-2xl text-zinc-400 font-light">天</span>
            </div>
            <p className="text-sm text-zinc-500">已连续打卡</p>
            {latestWeight && (
              <div className="mt-3 inline-flex items-center gap-2 bg-zinc-800/80 rounded-lg px-3 py-1.5">
                <span className="text-xs text-zinc-400">当前体重</span>
                <span className="text-lg font-bold text-white">{latestWeight} kg</span>
              </div>
            )}
          </div>
        </div>

        {/* ---- Weekly Summary: 本周总结 ---- */}
        <section className="mb-6">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-emerald-500 rounded-full" />
            本周总结
          </h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-zinc-500">{currentWeek.label}</span>
              <span className="text-xs text-zinc-600">
                打卡 {currentWeek.checkInDays}/7 · 训练 {currentWeek.trainingDays}天
              </span>
            </div>

            {/* Weight row */}
            {currentWeek.avgWeight && (
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-zinc-500">周均体重</p>
                  <p className="text-sm font-bold text-white">{currentWeek.avgWeight}kg</p>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-zinc-500">周初</p>
                  <p className="text-sm font-bold text-white">{currentWeek.startWeight ?? "-"}kg</p>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-zinc-500">周末</p>
                  <p className="text-sm font-bold text-white">{currentWeek.endWeight ?? "-"}kg</p>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-zinc-500">体重变化</p>
                  <p className={`text-sm font-bold ${(currentWeek.weightDelta ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {currentWeek.weightDelta !== null ? `${currentWeek.weightDelta > 0 ? "+" : ""}${currentWeek.weightDelta}kg` : "-"}
                  </p>
                </div>
              </div>
            )}

            {/* Macros row */}
            {currentWeek.avgKcal && (
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-zinc-500">日均热量</p>
                  <p className="text-sm font-bold text-amber-400">{currentWeek.avgKcal}kcal</p>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-zinc-500">日均蛋白</p>
                  <p className="text-sm font-bold text-red-400">{currentWeek.avgProtein}g</p>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-zinc-500">日均碳水</p>
                  <p className="text-sm font-bold text-amber-300">{currentWeek.avgCarbs}g</p>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-zinc-500">日均脂肪</p>
                  <p className="text-sm font-bold text-blue-400">{currentWeek.avgFat}g</p>
                </div>
              </div>
            )}

            {/* Exercise volumes */}
            {Object.keys(currentWeek.exerciseVolume).length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 mb-2">训练量 (总kg = 重量×次数)</p>
                <div className="space-y-1.5">
                  {Object.entries(currentWeek.exerciseVolume)
                    .sort((a, b) => b[1].totalKg - a[1].totalKg)
                    .map(([name, stats]) => (
                      <div key={name} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400 truncate flex-1">{name}</span>
                        <span className="text-zinc-500 mx-2">{stats.sets}组</span>
                        <span className="text-white font-mono">{stats.totalKg.toFixed(0)}kg</span>
                        <span className="text-zinc-600 font-mono ml-1">max {stats.maxWeight}kg</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {currentWeek.checkInDays === 0 && (
              <p className="text-center text-zinc-500 text-sm py-4">本周尚无打卡数据</p>
            )}
          </div>
        </section>

        {/* ---- PR Wall: 大重量高光墙 ---- */}
        <section className="mb-6">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-amber-500 rounded-full" />
            大重量高光墙
          </h2>
          <div className="space-y-3">
            {(Object.entries(catMeta) as [WorkoutCategoryId, { label: string; emoji: string }][]).map(
              ([cat, { label, emoji }]) => {
                const prs = Object.values(prByCat[cat]);
                if (prs.length === 0) return null;
                return (
                  <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-3">
                      {emoji} {label}部
                    </h3>
                    <div className="space-y-2">
                      {prs.map((pr) => (
                        <div
                          key={pr.exerciseId}
                          className="flex justify-between items-center"
                        >
                          <span className="text-sm text-zinc-400">{pr.exerciseName}</span>
                          <div className="flex gap-3 text-right">
                            <span className="text-xs text-amber-500 font-mono">
                              {pr.maxWeight.weight}kg × {pr.maxWeight.reps}
                            </span>
                            <span className="text-xs text-zinc-600 font-mono">
                              {pr.maxReps.reps} reps @ {pr.maxReps.weight}kg
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
            )}
            {Object.values(prRecords).length === 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-zinc-500 text-sm">
                尚无力量训练记录 — 期待你的每一次突破
              </div>
            )}
          </div>
        </section>

        {/* ---- Bi-Weekly Strength Breakthrough: 双周力量突破 ---- */}
        <section className="mb-6">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-orange-500 rounded-full" />
            双周力量突破
          </h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-zinc-500">{biWeekly.periodLabel}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${biWeekly.hasBreakthrough ? "bg-orange-500/20 text-orange-400" : "bg-zinc-800 text-zinc-500"}`}>
                {biWeekly.hasBreakthrough ? "🔥 有突破" : "持续积累"}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                <p className="text-[10px] text-zinc-500">训练天数</p>
                <p className="text-lg font-bold text-white">{biWeekly.trainingDays}</p>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                <p className="text-[10px] text-zinc-500">总组数</p>
                <p className="text-lg font-bold text-white">{biWeekly.totalSets}</p>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                <p className="text-[10px] text-zinc-500">新PR</p>
                <p className="text-lg font-bold text-orange-400">{biWeekly.prs.length}</p>
              </div>
            </div>

            {/* New PRs */}
            {biWeekly.prs.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-zinc-500 mb-2">🏆 本期新PR</p>
                <div className="space-y-1">
                  {biWeekly.prs.map((pr, i) => (
                    <div key={i} className="flex items-center justify-between bg-orange-500/5 border border-orange-500/20 rounded-lg px-3 py-2">
                      <span className="text-sm text-white">{pr.exerciseName}</span>
                      <span className="text-xs text-orange-400 font-mono font-bold">
                        {pr.weight}kg × {pr.reps}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Volume increases */}
            {biWeekly.volumeIncreases.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 mb-2">📈 训练量增长 (vs 前两周)</p>
                <div className="space-y-1">
                  {biWeekly.volumeIncreases.map((v, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">{v.exerciseName}</span>
                      <span className="text-emerald-400 font-mono">
                        +{v.pctChange}% ({v.prevVolume} → {v.currVolume}kg)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {biWeekly.trainingDays === 0 && (
              <p className="text-center text-zinc-500 text-sm py-4">本周期尚无训练记录</p>
            )}
          </div>
        </section>

        {/* ---- Weight Trend Chart ---- */}
        <section className="mb-6">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-blue-500 rounded-full" />
            体重走势
          </h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            {weightTrend.length > 1 ? (
              <WeightTrendChart data={weightTrend} />
            ) : (
              <div className="text-center text-zinc-500 text-sm py-6">
                需要至少两次打卡数据才能展示走势
              </div>
            )}
            {weightTrend.length > 0 && (
              <div className="flex justify-between text-xs text-zinc-600 mt-2">
                <span>{weightTrend[0].date}</span>
                <span>最新: {weightTrend[weightTrend.length - 1].weight}kg</span>
              </div>
            )}
          </div>
        </section>

        {/* ---- Today's Macro Achievement ---- */}
        {targets && (
          <section className="mb-6">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-emerald-500 rounded-full" />
              今日营养素达成率
            </h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex justify-center gap-6">
                <MacroRing
                  label="蛋白质"
                  current={mealTotals.protein}
                  target={targets.proteinG}
                  color="#ef4444"
                />
                <MacroRing
                  label="碳水"
                  current={mealTotals.carbs}
                  target={targets.carbsG}
                  color="#f59e0b"
                />
                <MacroRing
                  label="脂肪"
                  current={mealTotals.fat}
                  target={targets.fatG}
                  color="#3b82f6"
                />
                <CalorieRing
                  current={mealTotals.kcal}
                  tdee={targets.tdee}
                  surplusLow={targets.surplusLow}
                  surplusHigh={targets.surplusHigh}
                />
              </div>
              <div className="mt-4 text-center text-xs text-zinc-500">
                TDEE: {targets.tdee.toFixed(0)} kcal · 目标盈余:{" "}
                {targets.surplusLow.toFixed(0)} kcal (10%)
              </div>
            </div>
          </section>
        )}

        {/* ---- Half-Month Summary: 半月总结 ---- */}
        {previousHalfMonth.checkInDays > 0 && (
          <section className="mb-6">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-purple-500 rounded-full" />
              半月总结 · {previousHalfMonth.label}
            </h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              {/* Summary badge */}
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${previousHalfMonth.isCompleted ? "bg-purple-500/20 text-purple-400" : "bg-zinc-800 text-zinc-400"}`}>
                  {previousHalfMonth.isCompleted ? "✓ 已完成" : "进行中"}
                </span>
                <span className="text-xs text-zinc-500">
                  打卡 {previousHalfMonth.checkInDays}天 · 训练 {previousHalfMonth.trainingDays}天
                </span>
              </div>

              {/* Weight stats */}
              {previousHalfMonth.avgWeight && (
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-zinc-500">平均体重</p>
                    <p className="text-sm font-bold text-white">{previousHalfMonth.avgWeight}kg</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-zinc-500">期初</p>
                    <p className="text-sm font-bold text-white">{previousHalfMonth.weightStart ?? "-"}kg</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-zinc-500">期末</p>
                    <p className="text-sm font-bold text-white">{previousHalfMonth.weightEnd ?? "-"}kg</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-zinc-500">体重变化</p>
                    <p className={`text-sm font-bold ${(previousHalfMonth.weightDelta ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {previousHalfMonth.weightDelta !== null ? `${previousHalfMonth.weightDelta > 0 ? "+" : ""}${previousHalfMonth.weightDelta}kg` : "-"}
                    </p>
                  </div>
                </div>
              )}

              {/* Macros averages */}
              {previousHalfMonth.avgKcal && (
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-zinc-500">日均热量</p>
                    <p className="text-sm font-bold text-amber-400">{previousHalfMonth.avgKcal}kcal</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-zinc-500">日均蛋白</p>
                    <p className="text-sm font-bold text-red-400">{previousHalfMonth.avgProtein}g</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-zinc-500">日均碳水</p>
                    <p className="text-sm font-bold text-amber-300">{previousHalfMonth.avgCarbs}g</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-zinc-500">日均脂肪</p>
                    <p className="text-sm font-bold text-blue-400">{previousHalfMonth.avgFat}g</p>
                  </div>
                </div>
              )}

              {/* Top exercise */}
              {previousHalfMonth.topExercise && (
                <div className="bg-zinc-800/50 rounded-lg p-3 mb-3">
                  <p className="text-xs text-zinc-500 mb-1">🏅 最常训练动作</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white font-medium">{previousHalfMonth.topExercise.name}</span>
                    <span className="text-xs text-zinc-400">
                      {previousHalfMonth.topExercise.totalSets}组 · 最大{previousHalfMonth.topExercise.maxWeight}kg
                    </span>
                  </div>
                </div>
              )}

              {/* Overall summary line */}
              <div className="border-t border-zinc-800 pt-3">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {previousHalfMonth.label}共完成 <span className="text-white font-bold">{previousHalfMonth.checkInDays}</span> 天打卡、
                  <span className="text-white font-bold">{previousHalfMonth.trainingDays}</span> 天训练，
                  累计完成 <span className="text-white font-bold">{previousHalfMonth.totalSets}</span> 组。
                  {previousHalfMonth.avgWeight && (
                    <>平均体重 <span className="text-white font-bold">{previousHalfMonth.avgWeight}kg</span></>
                  )}
                  {previousHalfMonth.weightDelta !== null && previousHalfMonth.weightDelta !== 0 && (
                    <span className={previousHalfMonth.weightDelta > 0 ? "text-red-400" : "text-emerald-400"}>
                      （{previousHalfMonth.weightDelta > 0 ? "+" : ""}{previousHalfMonth.weightDelta}kg）
                    </span>
                  )}
                  。
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ---- Current Half-Month Progress ---- */}
        <section className="mb-6">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-purple-500 rounded-full" />
            本月进度 · {currentHalfMonth.label}
          </h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            {currentHalfMonth.checkInDays > 0 ? (
              <>
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-zinc-500">打卡</p>
                    <p className="text-lg font-bold text-white">{currentHalfMonth.checkInDays}</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-zinc-500">训练</p>
                    <p className="text-lg font-bold text-white">{currentHalfMonth.trainingDays}</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-zinc-500">总组数</p>
                    <p className="text-lg font-bold text-white">{currentHalfMonth.totalSets}</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-zinc-500">均体重</p>
                    <p className="text-lg font-bold text-white">{currentHalfMonth.avgWeight ?? "-"}kg</p>
                  </div>
                </div>
                {currentHalfMonth.avgKcal && (
                  <div className="flex gap-4 text-xs text-zinc-500 justify-center">
                    <span>日均热量 <span className="text-amber-400">{currentHalfMonth.avgKcal}</span> kcal</span>
                    <span>蛋白 <span className="text-red-400">{currentHalfMonth.avgProtein}</span>g</span>
                    <span>碳水 <span className="text-amber-300">{currentHalfMonth.avgCarbs}</span>g</span>
                    <span>脂肪 <span className="text-blue-400">{currentHalfMonth.avgFat}</span>g</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-center text-zinc-500 text-sm py-4">本期尚无数据</p>
            )}
          </div>
        </section>

        {/* Footer nav */}
        <nav className="mt-8 pt-4 border-t border-zinc-800">
          <a href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300 transition">
            ← 返回控制台
          </a>
        </nav>
      </div>
    </main>
  );
}
