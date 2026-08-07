import type { Settings, StreakState } from './types'

/**
 * Commitment & accountability gating — phase-2 spec §4.1.
 *
 * Stakes and temptation bundling meaningfully extend adherence *once a habit is
 * partly formed*. On day three they are noise, so the option is not shown at
 * all until there is real streak data behind it.
 */
export const COMMITMENT_UNLOCK_STREAK = 21

/**
 * Unlocks at a 21-day active streak and then stays unlocked. Losing a streak
 * already costs the number — it should not also confiscate a mechanism that was
 * earned, and re-hiding a stake the user had set would silently drop a promise
 * they made.
 */
export function commitmentUnlocked(
  settings: Settings,
  streak: StreakState | undefined,
): boolean {
  if (settings.commitmentUnlockedAt) return true
  return (streak?.currentStreak ?? 0) >= COMMITMENT_UNLOCK_STREAK
}
