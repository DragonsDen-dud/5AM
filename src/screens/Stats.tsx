import { useLiveQuery } from 'dexie-react-hooks'
import { db, EMPTY_STREAK } from '../lib/db'
import { AutomaticityBar } from '../components/StreakDisplay'
import { automaticityProgress, completionRate } from '../lib/streak'
import { currentStage, daysSinceOnboarding, STAGE_DESCRIPTIONS, STAGE_LABELS } from '../lib/stage'
import { formatDateKey } from '../lib/dates'
import type { RunLog, Settings } from '../lib/types'

interface Props {
  settings: Settings
}

export function Stats({ settings }: Props) {
  const streak = useLiveQuery(() => db.streak.get('streak'), [], undefined)
  const logs = useLiveQuery(() => db.runLogs.toArray(), [], [] as RunLog[])

  const s = streak ?? EMPTY_STREAK
  const all = logs ?? []
  const stage = currentStage(settings)
  const progress = automaticityProgress(s.currentStreak)

  return (
    <div className="flex flex-col gap-5 px-5 pt-2 pb-6">
      <h1 className="text-sm font-semibold tracking-tight">Stats</h1>

      <section className="card">
        <span className="label">Automaticity progress</span>
        <p className="tnum mt-2 mb-4 text-3xl font-semibold tracking-tight">
          {progress.day}
          <span className="text-lg text-ink-faint"> / {progress.target}</span>
        </p>
        <AutomaticityBar currentStreak={s.currentStreak} />
        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          66 days is the median time to automaticity in Lally et al. (2010), where the full range ran
          from 18 to 254 days. It is a marker, not a deadline.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Tile label="Current streak" value={s.currentStreak} unit="days" accent />
        <Tile label="Longest streak" value={s.longestStreak} unit="days" />
        <Tile label="Total runs" value={s.totalRuns} unit="lifetime" />
        <Tile label="Days tracked" value={daysSinceOnboarding(settings)} unit="since day one" />
      </section>

      <section className="card">
        <span className="label">Completion rate</span>
        <dl className="mt-4 flex flex-col gap-3">
          <RateRow label="Last 30 days" rate={completionRate(all, 30)} />
          <RateRow label="Last 90 days" rate={completionRate(all, 90)} />
          <RateRow label="Last 365 days" rate={completionRate(all, 365)} />
        </dl>
      </section>

      <section className="card">
        <span className="label">Stage {stage} — {STAGE_LABELS[stage]}</span>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">{STAGE_DESCRIPTIONS[stage]}</p>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          Stage is counted from your start date, not your streak. Breaking a streak does not send you
          back to the beginning — the automaticity you have built is still built.
        </p>
      </section>

      <p className="text-[11px] text-ink-faint">
        Tracking since {formatDateKey(settings.onboardedAt)}.
      </p>
    </div>
  )
}

function Tile({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string
  value: number
  unit: string
  accent?: boolean
}) {
  return (
    <div className="card">
      <span className="label">{label}</span>
      <p
        className={`tnum mt-2 text-3xl font-semibold tracking-tight ${
          accent ? 'text-ember' : 'text-ink'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-ink-faint">{unit}</p>
    </div>
  )
}

function RateRow({ label, rate }: { label: string; rate: number | null }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-sm text-ink-dim">{label}</dt>
      <dd className="tnum text-sm font-semibold">
        {rate === null ? '—' : `${Math.round(rate * 100)}%`}
      </dd>
    </div>
  )
}
