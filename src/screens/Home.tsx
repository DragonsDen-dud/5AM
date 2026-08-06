import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { formatClock, formatDateKey, formatDuration, todayKey } from '../lib/dates'
import { useNow } from '../hooks/useNow'
import { AutomaticityBar, StreakDisplay } from '../components/StreakDisplay'
import { TimeBar } from '../components/TimeBar'
import { RunDetailsForm } from '../components/RunDetailsForm'
import {
  windowForDate,
  windowLabel,
  windowPhase,
  windowRemainingFraction,
} from '../lib/window'
import { EMPTY_STREAK } from '../lib/db'
import type { Settings } from '../lib/types'

interface Props {
  settings: Settings
  onOpenCheckIn: () => void
}

export function Home({ settings, onOpenCheckIn }: Props) {
  const now = useNow(1000)
  const today = todayKey(now)

  // Before the first eligible window the app targets that day rather than today,
  // so a late sign-up shows a countdown instead of a miss it never had a shot at.
  const targetDate = today >= settings.trackingStartsOn ? today : settings.trackingStartsOn

  const streak = useLiveQuery(() => db.streak.get('streak'), [], undefined)
  const todayLog = useLiveQuery(
    () => db.runLogs.where('date').equals(targetDate).first(),
    [targetDate],
  )
  const plan = useLiveQuery(
    () => db.nightPlans.where('date').equals(targetDate).first(),
    [targetDate],
  )

  const streakState = streak ?? EMPTY_STREAK
  const window = windowForDate(settings, targetDate)
  const phase = windowPhase(window, now)
  const checkedIn = todayLog?.status === 'completed'

  return (
    <div className="flex min-h-[calc(100dvh-4.75rem)] flex-col gap-7 px-5 pt-2 pb-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-sm font-semibold tracking-tight">{formatDateKey(today)}</h1>
          <p className="tnum mt-0.5 text-[11px] text-ink-faint">
            Window {windowLabel(settings)}
          </p>
        </div>
        <span className="tnum text-sm text-ink-dim">{formatClock(now)}</span>
      </header>

      <section className="flex flex-col items-center gap-5 pt-2">
        <StreakDisplay
          currentStreak={streakState.currentStreak}
          longestStreak={streakState.longestStreak}
        />
        <AutomaticityBar currentStreak={streakState.currentStreak} />
      </section>

      {/* The state block takes the remaining height so the screen never ends in
          a large void, whichever state is showing. */}
      <div className="flex flex-1 flex-col justify-center pb-4">
        {checkedIn ? (
          <CheckedInState logDate={targetDate} />
        ) : phase === 'before' ? (
          <BeforeWindow opensAt={window.opensAt} now={now} plan={plan?.planText} />
        ) : phase === 'open' ? (
          <OpenWindow
            fraction={windowRemainingFraction(window, now)}
            msRemaining={window.closesAt.getTime() - now.getTime()}
            onOpenCheckIn={onOpenCheckIn}
            plan={plan?.planText}
          />
        ) : (
          <MissedState why={settings.whyStatement} />
        )}
      </div>
    </div>
  )
}

function BeforeWindow({
  opensAt,
  now,
  plan,
}: {
  opensAt: Date
  now: Date
  plan?: string
}) {
  return (
    <section className="card flex flex-col gap-3">
      <span className="label">Next window</span>
      <p className="tnum text-3xl font-semibold tracking-tight">
        {formatDuration(opensAt.getTime() - now.getTime())}
      </p>
      <p className="text-sm leading-relaxed text-ink-dim">
        Check-in is locked until the window opens. There is no early credit and no late credit.
      </p>
      {plan && <PlanRow plan={plan} />}
    </section>
  )
}

function OpenWindow({
  fraction,
  msRemaining,
  onOpenCheckIn,
  plan,
}: {
  fraction: number
  msRemaining: number
  onOpenCheckIn: () => void
  plan?: string
}) {
  return (
    <section className="flex flex-col gap-5">
      <TimeBar fraction={fraction} msRemaining={msRemaining} />
      <button type="button" onClick={onOpenCheckIn} className="btn-primary w-full py-5 text-base">
        CHECK IN
      </button>
      {plan && <PlanRow plan={plan} />}
    </section>
  )
}

function CheckedInState({ logDate }: { logDate: string }) {
  const log = useLiveQuery(() => db.runLogs.where('date').equals(logDate).first(), [logDate])

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center gap-3 rounded-xl border border-signal/40 bg-signal-dim/25 px-4 py-3.5">
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-signal" aria-hidden="true">
          <path
            d="M4 12.5 9.5 18 20 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="text-sm font-medium">Logged. That is today done.</p>
      </div>

      {log && (
        <div className="card">
          <span className="label">Today&rsquo;s log</span>
          <div className="mt-4">
            <RunDetailsForm log={log} submitLabel="Save log" />
          </div>
        </div>
      )}
    </section>
  )
}

function MissedState({ why }: { why?: string }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-xl border border-miss/50 bg-miss-dim/25 px-5 py-6">
        <p className="tnum text-3xl font-semibold tracking-[0.14em] text-miss">MISSED</p>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          The window closed without a check-in. The streak is back to zero and today is marked
          permanently. There is no way to fix it from here — the next window is the only move.
        </p>
      </div>
      {why && (
        <div className="card">
          <span className="label">Why you started</span>
          <p className="mt-2 leading-relaxed">{why}</p>
        </div>
      )}
    </section>
  )
}

function PlanRow({ plan }: { plan: string }) {
  return (
    <div className="rounded-lg border border-base-700 bg-base-800 px-4 py-3">
      <span className="label">Last night&rsquo;s plan</span>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{plan}</p>
    </div>
  )
}
