// ============================================================
// PR Determination Logic
// ============================================================
// 判定规则:
//   1. 当前负重 > 历史最大负重 → 重量 PR
//   2. 同等或更高重量下，完成次数 > 历史最高次数 → 次数 PR
// ============================================================

import type { PRRecord, PRResult } from "@/lib/types";

export interface PRCheckInput {
  exerciseId: string;
  exerciseName: string;
  category: "chest" | "back" | "shoulder";
  weight: number;
  reps: number;
  date: string;
}

/**
 * Determine if a new set is a PR.
 * Mutates the `prRecords` object in-place to update bests if a PR is found.
 * Returns a PRResult with full comparison details, or null.
 */
export function checkPR(
  prRecords: Record<string, PRRecord>,
  input: PRCheckInput
): PRResult | null {
  const existing = prRecords[input.exerciseId];
  const newEntry = { weight: input.weight, reps: input.reps, date: input.date };

  // First-ever record for this exercise → instant PR
  if (!existing) {
    prRecords[input.exerciseId] = {
      exerciseId: input.exerciseId,
      exerciseName: input.exerciseName,
      category: input.category,
      maxWeight: newEntry,
      maxReps: newEntry,
    };
    return {
      isPR: true,
      type: "weight", // inaugural record
      exerciseName: input.exerciseName,
      newBest: { weight: input.weight, reps: input.reps },
    };
  }

  let weightPR = false;
  let repsPR = false;
  const oldMaxWeight = { ...existing.maxWeight };
  const oldMaxReps = { ...existing.maxReps };

  // Weight PR: heavier than ever before
  if (input.weight > existing.maxWeight.weight) {
    weightPR = true;
    existing.maxWeight = newEntry;
  }

  // Reps PR: same or higher weight AND more reps than previous best
  if (
    input.weight >= existing.maxReps.weight &&
    input.reps > existing.maxReps.reps
  ) {
    repsPR = true;
    existing.maxReps = newEntry;
  }

  if (weightPR || repsPR) {
    return {
      isPR: true,
      type: weightPR ? "weight" : "reps",
      exerciseName: input.exerciseName,
      oldBest: weightPR
        ? { weight: oldMaxWeight.weight, reps: oldMaxWeight.reps }
        : { weight: oldMaxReps.weight, reps: oldMaxReps.reps },
      newBest: { weight: input.weight, reps: input.reps },
    };
  }

  return null;
}

/** PR comparison display text */
export function prSummary(pr: PRResult): string {
  if (!pr.isPR) return "";
  if (pr.type === "weight") {
    return `${pr.oldBest ? `${pr.oldBest.weight}kg → ` : ""}${pr.newBest.weight}kg (重量突破)`;
  }
  return `${pr.oldBest ? `${pr.oldBest.reps} → ` : ""}${pr.newBest.reps} reps @ ${pr.newBest.weight}kg (次数突破)`;
}
