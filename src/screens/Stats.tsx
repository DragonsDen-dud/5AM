import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, EMPTY_STREAK } from '../lib/db'
import { AutomaticityBar } from '../components/StreakDisplay'
import { BarList, LineChart, StatusLegend, StatusStrip, type StripCell } from '../components/charts'
import { CATEGORY_LABELS } from '../components/MessageCard'
import { describePerformance, refreshPerformance } from '../lib/bandit'
import { automaticityProgress, completionRate } from '../lib/streak'
import { currentStage, daysSinceOnboarding, stageDescription, STAGE_LABELS } from '../lib/stage'
import { formatDateKey } from '../lib/dates'
import { ACWR_ELEVATED, computeAcwr, reviewLoad } from '../lib/load'
import { acwrTrend, completionTrend, readinessTrend, redDayFollowThrough } from '../lib/trends'
import type {
  LoadEntry,
  MessagePerformance,
  ReadinessScore,
  RunLog,
  Settings,
} from '../lib/types'

interface Props {
  settings: Settings
}

type Panel = 'completion' | 'readiness' | 'load' | 'messages'

const PANELS: { id: Panel; label: string }[] = [
  { id: 'completion', label: 'Completion' },
  { id: 'readiness', label: 'Readiness' },
  { id: 'load', label: 'Load' },
  { id: 'messages', label: 'Messages' },
]

export function Stats({ settings }: Props) {
  const [panel, setPanel] = useState<Panel>('completion')

  const streak = useLiveQuery(() => db.streak.get('streak'), [], undefined)
  const logs = useLiveQuery(() => db.runLogs.toArray(), [], [] as RunLog[])
  const loads = useLiveQuery(() => db.loadEntries.toArray(), [], [] as LoadEntry[])
  const scores = useLiveQuery(() => db.readinessScores.toArray(), [], [] as ReadinessScore[])
  const performance = useLiveQuery(
    () => db.messagePerformance.toArray(),
    [],
    [] as MessagePerformance[],
  )

  /*
   * Performance weights are normally computed lazily when a message is picked.
   * Refresh on mount too, so this screen reports what the data actually says
   * rather than "not enough data" on a morning the check-in has not been opened.
   * The recompute is weekly-gated internally, so this is close to free.
   */
  useEffect(() => {
    void refreshPerformance()
  }, [])

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

      {/* One chart visible at a time — spec §7. A four-panel dashboard would
          make this a thing to interpret rather than a thing to read. */}
      <section className="card">
        <div className="flex gap-1 rounded-lg border border-base-700 bg-base-900 p-1">
          {PANELS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPanel(p.id)}
              className={`flex-1 rounded-md px-2 py-2 text-[11px] font-medium transition-colors ${
                panel === p.id ? 'bg-base-700 text-ink' : 'text-ink-faint'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {panel === 'completion' && <CompletionPanel logs={all} />}
          {panel === 'readiness' && <ReadinessPanel logs={all} scores={scores ?? []} />}
          {panel === 'load' && (
            <LoadPanel settings={settings} loads={loads ?? []} logs={all} />
          )}
          {panel === 'messages' && <MessagesPanel performance={performance ?? []} />}
        </div>
      </section>

      <section className="card">
        <span className="label">Completion rate</span>
        <dl className="mt-4 flex flex-col gap-3">
          <RateRow label="Last 30 days" rate={completionRate(all, 30)} />
          <RateRow label="Last 90 days" rate={completionRate(all, 90)} />
          <RateRow label="Last 365 days" rate={completionRate(all, 365)} />
        </dl>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          Deliberate rest days are excluded from both sides of this ratio. A day you chose to take
          off is not a day you failed.
        </p>
      </section>

      <section className="card">
        <span className="label">
          Stage {stage} — {STAGE_LABELS[stage]}
        </span>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          {stageDescription(stage, settings)}
        </p>
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

/**
 * A chart drawn from two points across a 90-day axis is accurate and useless —
 * it renders as a solid block and invites reading a trend that is not there.
 * Below this many real points, say so instead of drawing it.
 */
const MIN_POINTS_FOR_TREND = 7

function CompletionPanel({ logs }: { logs: RunLog[] }) {
  const points = completionTrend(logs, 90, 14)
  const hasData = points.filter((p) => p.value !== null).length >= MIN_POINTS_FOR_TREND

  return (
    <div className="flex flex-col gap-3">
      <span className="label">90-day completion trend</span>
      {hasData ? (
        <LineChart
          points={points}
          domain={[0, 100]}
          formatValue={(v) => `${Math.round(v)}%`}
          ariaLabel="Rolling 14-day completion rate over the last 90 days"
        />
      ) : (
        <Empty>
          Not enough history yet — this needs about a week of settled days before a line means
          anything. It fills in on its own.
        </Empty>
      )}
      <p className="text-[11px] leading-relaxed text-ink-faint">
        Rolling 14-day rate. A dip is information, not a scoreline.
      </p>
    </div>
  )
}

function ReadinessPanel({ logs, scores }: { logs: RunLog[]; scores: ReadinessScore[] }) {
  const cells = readinessTrend(scores, logs, 60)
  const completion = completionTrend(logs, 60, 7)
  const insight = redDayFollowThrough(scores, logs)

  const stripCells: StripCell[] = cells.map((c) => ({
    date: c.date,
    tone: c.level,
    label: c.level
      ? `${c.level[0].toUpperCase()}${c.level.slice(1)}${c.choice ? ` — ${c.choice}` : ''}`
      : 'Not scored',
  }))

  const scored = cells.filter((c) => c.level !== null).length
  const completionPoints = completion.filter((p) => p.value !== null).length

  return (
    <div className="flex flex-col gap-4">
      <span className="label">Readiness alongside completion</span>

      {scored === 0 ? (
        <Empty>
          No readiness history yet. It starts accumulating from the first morning you open the
          check-in screen.
        </Empty>
      ) : (
        <>
          {/* Two panels, one shared time axis — never two y-scales on one plot. */}
          {completionPoints >= MIN_POINTS_FOR_TREND && (
            <LineChart
              points={completion}
              domain={[0, 100]}
              formatValue={(v) => `${Math.round(v)}%`}
              height={100}
              ariaLabel="Rolling 7-day completion rate over the last 60 days"
            />
          )}
          <div>
            <StatusStrip cells={stripCells} ariaLabel="Daily readiness over the last 60 days" />
            <div className="mt-2">
              <StatusLegend />
            </div>
          </div>
        </>
      )}

      {insight && (
        <p className="text-xs leading-relaxed text-ink-dim">{insight.sentence}</p>
      )}
      <p className="text-[11px] leading-relaxed text-ink-faint">
        Descriptive only. The app states what it sees and stops there.
      </p>
    </div>
  )
}

function LoadPanel({
  settings,
  loads,
  logs,
}: {
  settings: Settings
  loads: LoadEntry[]
  logs: RunLog[]
}) {
  const points = acwrTrend(loads, settings.trackingStartsOn, 60)
  const current = computeAcwr(loads, settings.trackingStartsOn)
  const review = reviewLoad(loads, logs)
  const hasData = points.filter((p) => p.value !== null).length >= MIN_POINTS_FOR_TREND

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <span className="label">Acute:chronic workload</span>
        <span className="tnum text-sm font-semibold text-ink">
          {current.ratio === null ? '—' : current.ratio.toFixed(2)}
        </span>
      </div>

      {hasData ? (
        <LineChart
          points={points}
          formatValue={(v) => v.toFixed(2)}
          reference={{ value: ACWR_ELEVATED, label: `elevated ≥ ${ACWR_ELEVATED}` }}
          ariaLabel="Acute to chronic workload ratio over the last 60 days"
        />
      ) : (
        <Empty>
          Needs about two weeks of logged duration and effort before the ratio means anything.
        </Empty>
      )}

      <div className="rounded-lg border border-base-700 bg-base-800 px-4 py-3">
        <span className="label">Last four weeks</span>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{review.summary}</p>
      </div>

      <p className="text-[11px] leading-relaxed text-ink-faint">
        Load is duration × effort, plus a fixed allowance for any football day. Advisory only — it
        has never blocked a check-in and cannot.
      </p>
    </div>
  )
}

function MessagesPanel({ performance }: { performance: MessagePerformance[] }) {
  const { best, rows } = describePerformance(performance)

  return (
    <div className="flex flex-col gap-4">
      <span className="label">Which coaching lands</span>

      {rows.length === 0 ? (
        <Empty>
          Not enough data yet. The app needs a few weeks of messages and outcomes before it will
          claim anything about what works for you.
        </Empty>
      ) : (
        <>
          {best && (
            <p className="text-sm leading-relaxed text-ink-dim">
              Messages about{' '}
              <span className="text-ink">{CATEGORY_LABELS[best.category].toLowerCase()}</span> in the{' '}
              {best.slot} slot seem to land best for you lately.
            </p>
          )}
          <BarList
            data={rows.map((r) => ({
              label: `${CATEGORY_LABELS[r.category]} · ${r.slot}`,
              value: r.rate * 100,
              meta: `${r.sampleSize} exposures`,
            }))}
            formatValue={(v) => `${Math.round(v)}%`}
            max={100}
          />
        </>
      )}

      <p className="text-[11px] leading-relaxed text-ink-faint">
        The rotation weights toward what performs, 85% of the time, and picks at random the other
        15% so it keeps checking its own assumptions. The recovery override and the no-repeat window
        always run first and are never overruled by this.
      </p>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-base-700 px-4 py-6 text-center text-xs leading-relaxed text-ink-faint">
      {children}
    </p>
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
