import { formatDuration } from '../lib/dates'

interface Props {
  fraction: number
  msRemaining: number
}

/**
 * The one animated element that matters (spec §5). It depletes left-to-right and
 * shifts from amber to the miss colour as the window runs out — visible urgency,
 * no gamification.
 */
export function TimeBar({ fraction, msRemaining }: Props) {
  const urgent = fraction <= 0.2

  return (
    <div className="w-full">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="label">Window closes in</span>
        <span className={`tnum text-sm font-semibold ${urgent ? 'text-miss' : 'text-ink'}`}>
          {formatDuration(msRemaining)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-base-700">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
            urgent ? 'animate-bar-pulse bg-miss' : 'bg-ember'
          }`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  )
}
