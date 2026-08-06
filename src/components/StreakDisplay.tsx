import { automaticityProgress } from '../lib/streak'

interface Props {
  currentStreak: number
  longestStreak: number
}

/**
 * The streak number is deliberately the largest element on the screen — bigger
 * than any button (spec §5). Amber is reserved for this and the CTA.
 */
export function StreakDisplay({ currentStreak, longestStreak }: Props) {
  return (
    <div className="flex flex-col items-center">
      <span className="label">Current streak</span>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className={`tnum text-[5.5rem] leading-none font-semibold tracking-tight ${
            currentStreak > 0 ? 'text-ember' : 'text-ink-faint'
          }`}
        >
          {currentStreak}
        </span>
        <span className="text-sm font-medium text-ink-dim">
          {currentStreak === 1 ? 'day' : 'days'}
        </span>
      </div>
      <span className="tnum mt-2 text-xs text-ink-faint">
        Longest {longestStreak} {longestStreak === 1 ? 'day' : 'days'}
      </span>
    </div>
  )
}

export function AutomaticityBar({ currentStreak }: { currentStreak: number }) {
  const progress = automaticityProgress(currentStreak)

  return (
    <div className="w-full">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-base-700">
        <div
          className="h-full rounded-full bg-signal transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(progress.fraction * 100, currentStreak > 0 ? 2 : 0)}%` }}
        />
      </div>
      <p className="tnum mt-2 text-center text-[11px] tracking-wide text-ink-faint">
        {progress.label}
      </p>
    </div>
  )
}
