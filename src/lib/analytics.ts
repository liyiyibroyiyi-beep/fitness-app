// ============================================================
// Analytics Helpers — weekly / bi-weekly / half-month summaries
// ============================================================

import type { DailyLog, PRRecord, DailyMeals, WorkoutCategoryId } from "@/lib/types";

// ---- Date Helpers ----

/** Parse "YYYY-MM-DD" → Date at midnight local time */
function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Format Date → "YYYY-MM-DD" */
function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Get the Monday of the week containing the given date */
function getMondayOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

/** Get the Sunday of the week containing the given date */
function getSundayOfWeek(d: Date): Date {
  const mon = getMondayOfWeek(d);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return sun;
}

/** Add N days to a date */
function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

// ============================================================
// Weekly Summary
// ============================================================

export interface WeekSummary {
  /** "YYYY-MM-DD" start of the week (Monday) */
  weekStart: string;
  /** "YYYY-MM-DD" end of the week (Sunday) */
  weekEnd: string;
  /** Label like "6/16 – 6/22" */
  label: string;
  /** Average morning weight over the week */
  avgWeight: number | null;
  /** Weight on the first logged day of the week */
  startWeight: number | null;
  /** Weight on the last logged day of the week */
  endWeight: number | null;
  /** Weight change across the week (end - start) */
  weightDelta: number | null;
  /** Number of days with training logged */
  trainingDays: number;
  /** Number of days checked in */
  checkInDays: number;
  /** Total sets logged */
  totalSets: number;
  /** Per-exercise volume: exerciseName → total kg lifted */
  exerciseVolume: Record<string, { totalKg: number; sets: number; maxWeight: number }>;
  /** PRs achieved during the week */
  weeklyPRs: { exerciseName: string; weight: number; reps: number; date: string }[];
  /** Average daily macros (only days with meals) */
  avgProtein: number | null;
  avgCarbs: number | null;
  avgFat: number | null;
  avgKcal: number | null;
}

/** Compute a summary for a specific week (Monday–Sunday) */
export function computeWeekSummary(
  logs: Record<string, DailyLog>,
  meals: Record<string, DailyMeals>,
  prRecords: Record<string, PRRecord>,
  weekStartDate: Date
): WeekSummary {
  const mon = getMondayOfWeek(weekStartDate);
  const sun = getSundayOfWeek(weekStartDate);
  const weekStart = formatDate(mon);
  const weekEnd = formatDate(sun);

  const monthNames = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
  const label = `${mon.getMonth() + 1}/${mon.getDate()} – ${sun.getMonth() + 1}/${sun.getDate()}`;

  const datesInWeek: string[] = [];
  let cursor = new Date(mon);
  while (cursor <= sun) {
    datesInWeek.push(formatDate(cursor));
    cursor = addDays(cursor, 1);
  }

  const weekLogs = datesInWeek.filter((d) => d in logs).map((d) => logs[d]);
  const weekMeals = datesInWeek.filter((d) => d in meals).map((d) => meals[d]);

  // Weight stats
  const weights = weekLogs.map((l) => l.weight).filter((w) => w > 0);
  const avgWeight = weights.length > 0 ? Math.round(weights.reduce((a, b) => a + b, 0) / weights.length * 10) / 10 : null;
  const sortedByDate = [...weekLogs].sort((a, b) => a.date.localeCompare(b.date));
  const startWeight = sortedByDate.length > 0 ? sortedByDate[0].weight : null;
  const endWeight = sortedByDate.length > 0 ? sortedByDate[sortedByDate.length - 1].weight : null;
  const weightDelta = startWeight !== null && endWeight !== null ? Math.round((endWeight - startWeight) * 10) / 10 : null;

  // Training stats
  const trainingDays = weekLogs.filter((l) => l.exercises.length > 0).length;
  const checkInDays = weekLogs.length;
  let totalSets = 0;
  const exerciseVolume: WeekSummary["exerciseVolume"] = {};

  const weeklyPRs: WeekSummary["weeklyPRs"] = [];

  for (const log of weekLogs) {
    for (const ex of log.exercises) {
      const name = ex.exerciseName;
      if (!exerciseVolume[name]) {
        exerciseVolume[name] = { totalKg: 0, sets: 0, maxWeight: 0 };
      }
      for (const set of ex.sets) {
        const vol = set.weight * set.reps;
        exerciseVolume[name].totalKg = Math.round((exerciseVolume[name].totalKg + vol) * 10) / 10;
        exerciseVolume[name].sets += 1;
        if (set.weight > exerciseVolume[name].maxWeight) {
          exerciseVolume[name].maxWeight = set.weight;
        }
        totalSets += 1;
      }
    }
  }

  // PRs achieved this week (check PR record dates)
  for (const [, pr] of Object.entries(prRecords)) {
    if (datesInWeek.includes(pr.maxWeight.date)) {
      weeklyPRs.push({
        exerciseName: pr.exerciseName,
        weight: pr.maxWeight.weight,
        reps: pr.maxWeight.reps,
        date: pr.maxWeight.date,
      });
    }
    if (pr.maxReps.date !== pr.maxWeight.date && datesInWeek.includes(pr.maxReps.date)) {
      weeklyPRs.push({
        exerciseName: pr.exerciseName,
        weight: pr.maxReps.weight,
        reps: pr.maxReps.reps,
        date: pr.maxReps.date,
      });
    }
  }

  // Macros averages (only from days with meal data)
  const mealDays = weekMeals.filter((m) => {
    const total = (m.breakfast?.kcal ?? 0) + (m.lunch?.kcal ?? 0) + (m.dinner?.kcal ?? 0) + (m.snack?.kcal ?? 0);
    return total > 0;
  });

  const avgProtein = mealDays.length > 0
    ? Math.round(mealDays.reduce((s, m) => s + (m.breakfast?.protein ?? 0) + (m.lunch?.protein ?? 0) + (m.dinner?.protein ?? 0) + (m.snack?.protein ?? 0), 0) / mealDays.length * 10) / 10
    : null;
  const avgCarbs = mealDays.length > 0
    ? Math.round(mealDays.reduce((s, m) => s + (m.breakfast?.carbs ?? 0) + (m.lunch?.carbs ?? 0) + (m.dinner?.carbs ?? 0) + (m.snack?.carbs ?? 0), 0) / mealDays.length * 10) / 10
    : null;
  const avgFat = mealDays.length > 0
    ? Math.round(mealDays.reduce((s, m) => s + (m.breakfast?.fat ?? 0) + (m.lunch?.fat ?? 0) + (m.dinner?.fat ?? 0) + (m.snack?.fat ?? 0), 0) / mealDays.length * 10) / 10
    : null;
  const avgKcal = mealDays.length > 0
    ? Math.round(mealDays.reduce((s, m) => s + (m.breakfast?.kcal ?? 0) + (m.lunch?.kcal ?? 0) + (m.dinner?.kcal ?? 0) + (m.snack?.kcal ?? 0), 0) / mealDays.length * 10) / 10
    : null;

  return {
    weekStart,
    weekEnd,
    label,
    avgWeight,
    startWeight,
    endWeight,
    weightDelta,
    trainingDays,
    checkInDays,
    totalSets,
    exerciseVolume,
    weeklyPRs,
    avgProtein,
    avgCarbs,
    avgFat,
    avgKcal,
  };
}

/** Get the current week summary */
export function getCurrentWeekSummary(
  logs: Record<string, DailyLog>,
  meals: Record<string, DailyMeals>,
  prRecords: Record<string, PRRecord>
): WeekSummary {
  return computeWeekSummary(logs, meals, prRecords, new Date());
}

/** Get the previous week summary */
export function getPreviousWeekSummary(
  logs: Record<string, DailyLog>,
  meals: Record<string, DailyMeals>,
  prRecords: Record<string, PRRecord>
): WeekSummary {
  const lastWeek = addDays(new Date(), -7);
  return computeWeekSummary(logs, meals, prRecords, lastWeek);
}

// ============================================================
// Bi-Weekly Strength Breakthrough
// ============================================================

export interface BiWeeklyBreakthrough {
  /** Period label like "6/9 – 6/22" */
  periodLabel: string;
  /** Start of the 2-week period */
  periodStart: string;
  /** End of the 2-week period */
  periodEnd: string;
  /** Number of training days in the period */
  trainingDays: number;
  /** Total sets completed */
  totalSets: number;
  /** PRs achieved in this period */
  prs: { exerciseName: string; weight: number; reps: number; date: string; category: WorkoutCategoryId }[];
  /** Exercises where volume increased vs previous period */
  volumeIncreases: { exerciseName: string; prevVolume: number; currVolume: number; pctChange: number }[];
  /** Most improved exercise */
  topImprovement: { exerciseName: string; detail: string } | null;
  /** Whether this is a "breakthrough" period (has PRs or significant volume increase) */
  hasBreakthrough: boolean;
}

/** Get the current bi-weekly period start (aligned to even weeks from epoch) */
function getCurrentBiWeeklyStart(): Date {
  const now = new Date();
  const mon = getMondayOfWeek(now);
  // Align to even-numbered weeks: week number of year % 2
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.floor((mon.getTime() - getMondayOfWeek(jan1).getTime()) / (7 * 86400000));
  if (weekNum % 2 !== 0) {
    // Go back one week to align to even
    return addDays(mon, -7);
  }
  return mon;
}

/** Compute bi-weekly breakthrough for a given 14-day period */
export function computeBiWeeklyBreakthrough(
  logs: Record<string, DailyLog>,
  prRecords: Record<string, PRRecord>,
  periodStart: Date
): BiWeeklyBreakthrough {
  const periodEnd = addDays(periodStart, 13); // 14 days total
  const prevStart = addDays(periodStart, -14);
  const prevEnd = addDays(periodStart, -1);

  const periodStartStr = formatDate(periodStart);
  const periodEndStr = formatDate(periodEnd);

  const monthNames = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
  const periodLabel = `${periodStart.getMonth() + 1}/${periodStart.getDate()} – ${periodEnd.getMonth() + 1}/${periodEnd.getDate()}`;

  // Collect dates in current period
  const currentDates: string[] = [];
  let c = new Date(periodStart);
  while (c <= periodEnd) {
    currentDates.push(formatDate(c));
    c = addDays(c, 1);
  }

  // Collect dates in previous period
  const prevDates: string[] = [];
  let p = new Date(prevStart);
  while (p <= prevEnd) {
    prevDates.push(formatDate(p));
    p = addDays(p, 1);
  }

  const currentLogs = currentDates.filter((d) => d in logs).map((d) => logs[d]);
  const prevLogs = prevDates.filter((d) => d in logs).map((d) => logs[d]);

  // Training stats
  const trainingDays = currentLogs.filter((l) => l.exercises.length > 0).length;
  let totalSets = 0;

  // Current period exercise volume
  const currVolume: Record<string, number> = {};
  for (const log of currentLogs) {
    for (const ex of log.exercises) {
      if (!currVolume[ex.exerciseName]) currVolume[ex.exerciseName] = 0;
      for (const set of ex.sets) {
        currVolume[ex.exerciseName] += set.weight * set.reps;
        totalSets++;
      }
    }
  }

  // Previous period exercise volume
  const prevVolume: Record<string, number> = {};
  for (const log of prevLogs) {
    for (const ex of log.exercises) {
      if (!prevVolume[ex.exerciseName]) prevVolume[ex.exerciseName] = 0;
      for (const set of ex.sets) {
        prevVolume[ex.exerciseName] += set.weight * set.reps;
      }
    }
  }

  // PRs achieved in this period
  const prs: BiWeeklyBreakthrough["prs"] = [];
  for (const log of currentLogs) {
    for (const ex of log.exercises) {
      const pr = prRecords[ex.exerciseId];
      if (!pr) continue;
      // Check if the max weight PR date falls in this period
      const maxWDate = pr.maxWeight.date;
      const maxRDate = pr.maxReps.date;
      if (currentDates.includes(maxWDate) && pr.maxWeight.weight > 0) {
        // Only add if this exact entry is in this period's logs
        const matchingSet = ex.sets.find(
          (s) => s.weight === pr.maxWeight.weight && s.reps === pr.maxWeight.reps
        );
        if (matchingSet) {
          // Avoid duplicates
          const alreadyListed = prs.some(
            (p) => p.exerciseName === ex.exerciseName && p.date === maxWDate && p.weight === pr.maxWeight.weight
          );
          if (!alreadyListed) {
            prs.push({
              exerciseName: ex.exerciseName,
              weight: pr.maxWeight.weight,
              reps: pr.maxWeight.reps,
              date: maxWDate,
              category: pr.category,
            });
          }
        }
      }
    }
  }

  // Volume increases
  const volumeIncreases: BiWeeklyBreakthrough["volumeIncreases"] = [];
  for (const [name, vol] of Object.entries(currVolume)) {
    const prev = prevVolume[name];
    if (prev && prev > 0) {
      const pctChange = Math.round(((vol - prev) / prev) * 1000) / 10;
      if (pctChange > 5) {
        volumeIncreases.push({ exerciseName: name, prevVolume: Math.round(prev), currVolume: Math.round(vol), pctChange });
      }
    }
  }
  volumeIncreases.sort((a, b) => b.pctChange - a.pctChange);

  // Top improvement
  let topImprovement: BiWeeklyBreakthrough["topImprovement"] = null;
  if (prs.length > 0) {
    const best = prs[0];
    topImprovement = {
      exerciseName: best.exerciseName,
      detail: `新PR: ${best.weight}kg × ${best.reps}`,
    };
  } else if (volumeIncreases.length > 0) {
    const best = volumeIncreases[0];
    topImprovement = {
      exerciseName: best.exerciseName,
      detail: `训练量 +${best.pctChange}%`,
    };
  }

  const hasBreakthrough = prs.length > 0 || volumeIncreases.length >= 2;

  return {
    periodLabel,
    periodStart: periodStartStr,
    periodEnd: periodEndStr,
    trainingDays,
    totalSets,
    prs,
    volumeIncreases,
    topImprovement,
    hasBreakthrough,
  };
}

/** Get the current bi-weekly breakthrough */
export function getCurrentBiWeeklyBreakthrough(
  logs: Record<string, DailyLog>,
  prRecords: Record<string, PRRecord>
): BiWeeklyBreakthrough {
  return computeBiWeeklyBreakthrough(logs, prRecords, getCurrentBiWeeklyStart());
}

// ============================================================
// Half-Month Summary (半月总结)
// ============================================================

export interface HalfMonthSummary {
  /** Period label like "6月上半月" or "6月下半月" */
  label: string;
  /** "YYYY-MM-DD" start */
  periodStart: string;
  /** "YYYY-MM-DD" end */
  periodEnd: string;
  /** Is this period completed (all dates in the past)? */
  isCompleted: boolean;
  /** Number of check-in days */
  checkInDays: number;
  /** Number of training days */
  trainingDays: number;
  /** Average weight */
  avgWeight: number | null;
  /** Weight at start vs end */
  weightStart: number | null;
  weightEnd: number | null;
  weightDelta: number | null;
  /** Total sets */
  totalSets: number;
  /** PRs achieved */
  prs: { exerciseName: string; weight: number; reps: number; date: string }[];
  /** Average macros */
  avgProtein: number | null;
  avgCarbs: number | null;
  avgFat: number | null;
  avgKcal: number | null;
  /** Most trained exercise */
  topExercise: { name: string; totalSets: number; maxWeight: number } | null;
}

/** Get the current and previous half-month periods */
export function getHalfMonthPeriods(): { current: { start: Date; end: Date }; previous: { start: Date; end: Date } } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  let currStart: Date, currEnd: Date;
  let prevStart: Date, prevEnd: Date;

  if (day <= 15) {
    // Current: 1st-15th of current month
    currStart = new Date(year, month, 1);
    currEnd = new Date(year, month, 15);
    // Previous: 16th-last of previous month
    prevStart = new Date(year, month - 1, 16);
    prevEnd = new Date(year, month, 0); // last day of previous month
  } else {
    // Current: 16th-last of current month
    currStart = new Date(year, month, 16);
    currEnd = new Date(year, month + 1, 0); // last day of current month
    // Previous: 1st-15th of current month
    prevStart = new Date(year, month, 1);
    prevEnd = new Date(year, month, 15);
  }

  return {
    current: { start: currStart, end: currEnd },
    previous: { start: prevStart, end: prevEnd },
  };
}

/** Compute a half-month summary for a given date range */
export function computeHalfMonthSummary(
  logs: Record<string, DailyLog>,
  meals: Record<string, DailyMeals>,
  start: Date,
  end: Date,
  label: string
): HalfMonthSummary {
  const today = formatDate(new Date());
  const endStr = formatDate(end);
  const isCompleted = endStr < today;

  const dates: string[] = [];
  let c = new Date(start);
  while (c <= end) {
    dates.push(formatDate(c));
    c = addDays(c, 1);
  }

  const periodLogs = dates.filter((d) => d in logs).map((d) => logs[d]);
  const periodMeals = dates.filter((d) => d in meals).map((d) => meals[d]);

  // Weights
  const weights = periodLogs.map((l) => l.weight).filter((w) => w > 0);
  const avgWeight = weights.length > 0 ? Math.round(weights.reduce((a, b) => a + b, 0) / weights.length * 10) / 10 : null;
  const sorted = [...periodLogs].sort((a, b) => a.date.localeCompare(b.date));
  const weightStart = sorted.length > 0 ? sorted[0].weight : null;
  const weightEnd = sorted.length > 0 ? sorted[sorted.length - 1].weight : null;
  const weightDelta = weightStart !== null && weightEnd !== null ? Math.round((weightEnd - weightStart) * 10) / 10 : null;

  // Training
  const trainingDays = periodLogs.filter((l) => l.exercises.length > 0).length;
  let totalSets = 0;
  const exerciseStats: Record<string, { sets: number; maxWeight: number }> = {};

  // PRs
  const prs: HalfMonthSummary["prs"] = [];

  for (const log of periodLogs) {
    for (const ex of log.exercises) {
      if (!exerciseStats[ex.exerciseName]) {
        exerciseStats[ex.exerciseName] = { sets: 0, maxWeight: 0 };
      }
      exerciseStats[ex.exerciseName].sets += ex.sets.length;
      for (const set of ex.sets) {
        if (set.weight > exerciseStats[ex.exerciseName].maxWeight) {
          exerciseStats[ex.exerciseName].maxWeight = set.weight;
        }
        totalSets++;
      }
    }
  }

  // Top exercise
  let topExercise: HalfMonthSummary["topExercise"] = null;
  const sortedEx = Object.entries(exerciseStats).sort((a, b) => b[1].sets - a[1].sets);
  if (sortedEx.length > 0) {
    topExercise = {
      name: sortedEx[0][0],
      totalSets: sortedEx[0][1].sets,
      maxWeight: sortedEx[0][1].maxWeight,
    };
  }

  // Macros
  const mealDays = periodMeals.filter((m) => {
    return ((m.breakfast?.kcal ?? 0) + (m.lunch?.kcal ?? 0) + (m.dinner?.kcal ?? 0) + (m.snack?.kcal ?? 0)) > 0;
  });

  const avgProtein = mealDays.length > 0
    ? Math.round(mealDays.reduce((s, m) => s + (m.breakfast?.protein ?? 0) + (m.lunch?.protein ?? 0) + (m.dinner?.protein ?? 0) + (m.snack?.protein ?? 0), 0) / mealDays.length * 10) / 10
    : null;
  const avgCarbs = mealDays.length > 0
    ? Math.round(mealDays.reduce((s, m) => s + (m.breakfast?.carbs ?? 0) + (m.lunch?.carbs ?? 0) + (m.dinner?.carbs ?? 0) + (m.snack?.carbs ?? 0), 0) / mealDays.length * 10) / 10
    : null;
  const avgFat = mealDays.length > 0
    ? Math.round(mealDays.reduce((s, m) => s + (m.breakfast?.fat ?? 0) + (m.lunch?.fat ?? 0) + (m.dinner?.fat ?? 0) + (m.snack?.fat ?? 0), 0) / mealDays.length * 10) / 10
    : null;
  const avgKcal = mealDays.length > 0
    ? Math.round(mealDays.reduce((s, m) => s + (m.breakfast?.kcal ?? 0) + (m.lunch?.kcal ?? 0) + (m.dinner?.kcal ?? 0) + (m.snack?.kcal ?? 0), 0) / mealDays.length * 10) / 10
    : null;

  return {
    label,
    periodStart: formatDate(start),
    periodEnd: formatDate(end),
    isCompleted,
    checkInDays: periodLogs.length,
    trainingDays,
    avgWeight,
    weightStart,
    weightEnd,
    weightDelta,
    totalSets,
    prs,
    avgProtein,
    avgCarbs,
    avgFat,
    avgKcal,
    topExercise,
  };
}

/** Get summaries for all completed half-month periods, newest first */
export function getAllHalfMonthSummaries(
  logs: Record<string, DailyLog>,
  meals: Record<string, DailyMeals>
): HalfMonthSummary[] {
  const results: HalfMonthSummary[] = [];
  const now = new Date();

  // Go back up to 6 months
  for (let i = 0; i < 6; i++) {
    const year = now.getFullYear();
    const month = now.getMonth() - i;
    const d = new Date(year, month, 1);

    const monthNames = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
    const monthLabel = `${d.getMonth() + 1}月`;

    // First half
    const firstStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const firstEnd = new Date(d.getFullYear(), d.getMonth(), 15);
    const firstSummary = computeHalfMonthSummary(logs, meals, firstStart, firstEnd, `${monthLabel}上半月`);
    if (firstSummary.checkInDays > 0) {
      results.push(firstSummary);
    }

    // Second half
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const secondStart = new Date(d.getFullYear(), d.getMonth(), 16);
    const secondEnd = new Date(d.getFullYear(), d.getMonth(), lastDay);
    const secondSummary = computeHalfMonthSummary(logs, meals, secondStart, secondEnd, `${monthLabel}下半月`);
    if (secondSummary.checkInDays > 0) {
      results.push(secondSummary);
    }
  }

  return results;
}
