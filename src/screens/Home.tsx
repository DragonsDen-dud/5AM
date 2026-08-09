import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, saveSettings } from '../lib/db'
import {
  formatDateKey,
  formatDayMonth,
  formatDuration,
  formatWeekday,
  todayKey,
} from '../lib/dates'
import { detectFreshStart, type FreshStartTrigger } from '../lib/freshStart'
import { getReadiness } from '../lib/readiness'
import { useNow } from '../hooks/useNow'
import { StreakHero } from '../components/StreakHero'
import { TodayPanel } from '../components/TodayPanel'
import { ReadinessRow } from '../components/Readiness'
import { TimeBar } from '../components/TimeBar'
import {
  windowForDate,
  windowLabel,
  windowPhase,
  windowRemainingFraction,
} from '../lib/window'
import { EMPTY_STREAK } from '../lib/db'
import type { ReadinessScore, Settings } from '../lib/types'

interface Props {
  settings: Settings
  onOpenCheckIn: () => void
  onOpenWindDown: () => void
}

export function Home({ settings, onOpenCheckIn, onOpenWindDown }: Props) {
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
  const sleepToday = useLiveQuery(
    async () => (await db.sleepEntries.where('date').equals(today).first()) ?? null,
    [today],
  )

  const [readiness, setReadiness] = useState<ReadinessScore | null>(null)
  const [freshStart, setFreshStart] = useState<FreshStartTrigger | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [score, trigger] = await Promise.all([
        getReadiness(),
        detectFreshStart(settings),
      ])
      if (cancelled) return
      setReadiness(score)
      setFreshStart(trigger)
    })()
    return () => {
      cancelled = true
    }
  }, [settings, today, todayLog, sleepToday])

  const streakState = streak ?? EMPTY_STREAK
  const window = windowForDate(settings, targetDate)
  const phase = windowPhase(window, now)
  const checkedIn = todayLog?.status === 'completed'
  const rested = todayLog?.status === 'rest'

  const dismissFreshStart = async () => {
    await saveSettings({ lastFreshStartDate: today })
    setFreshStart(null)
  }

  /*
   * The headline state for right now. When the window is actually open and the
   * run is not yet logged this is the only thing that matters, so it goes above
   * the streak — the streak is motivation, the check-in is the job, and the job
   * must not sit below the fold on a small phone. Every other state sits under
   * the hero where it belongs.
   */
  const urgent = phase === 'open' && !todayLog?.status

  const stateBlock = rested ? (
    <RestedState reason={todayLog?.restReason} />
  ) : checkedIn ? (
    <CheckedInBanner />
  ) : phase === 'open' ? (
    <OpenWindow
      fraction={windowRemainingFraction(window, now)}
      msRemaining={window.closesAt.getTime() - now.getTime()}
      onOpenCheckIn={onOpenCheckIn}
      plan={plan?.planText}
    />
  ) : phase === 'closed' ? (
    <MissedState why={settings.whyStatement} />
  ) : (
    <BeforeWindow opensAt={window.opensAt} now={now} plan={plan?.planText} />
  )

  return (
    <div className="relative flex min-h-[calc(100dvh-4.75rem)] flex-col gap-6 px-5 pt-2 pb-6">
      {/* Pre-dawn light at the top of the screen — the app's one piece of pure
          atmosphere. Decorative, behind everything, never interactive. */}
      <div className="aurora" aria-hidden="true" />

      <header className="relative flex items-end justify-between pt-1">
        <div>
          <p className="label">{formatWeekday(today)}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{formatDayMonth(today)}</h1>
        </div>
        <div className="text-right">
          {/* Seconds are set smaller than minutes: the clock reads at a glance
              and still shows the app is live. */}
          <p className="tnum leading-none">
            <span className="text-xl font-semibold">
              {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}
            </span>
            <span className="text-xs text-ink-faint">
              :{String(now.getSeconds()).padStart(2, '0')}
            </span>
          </p>
          <p className="tnum mt-1.5 text-[10px] tracking-wide text-ink-faint">
            Window {windowLabel(settings)}
          </p>
        </div>
      </header>

      {urgent && stateBlock}

      <StreakHero
        currentStreak={streakState.currentStreak}
        longestStreak={streakState.longestStreak}
        totalRuns={streakState.totalRuns}
        targetDate={targetDate}
        trackingStartsOn={settings.trackingStartsOn}
        now={now}
      />

      {readiness && (
        <div className="relative">
          <ReadinessRow score={readiness} />
        </div>
      )}

      {freshStart && <FreshStartCard trigger={freshStart} onDismiss={dismissFreshStart} />}

      <StakeFollowUpCard settings={settings} />

      {!urgent && stateBlock}

      <TodayPanel
        settings={settings}
        now={now}
        todayLog={todayLog}
        phase={phase}
        opensAt={window.opensAt}
        onOpenWindDown={onOpenWindDown}
      />
    </div>
  )
}

function FreshStartCard({
  trigger,
  onDismiss,
}: {
  trigger: FreshStartTrigger
  onDismiss: () => void
}) {
  return (
    <section className="surface surface-live p-5">
      <span className="label text-ember/80">Clean start</span>
      <p className="mt-2 leading-relaxed text-ink">{trigger.message}</p>
      <p className="mt-3 text-[11px] leading-snug text-ink-faint">
        Dai, Milkman &amp; Riis, 2014 (fresh start effect)
      </p>
      <button type="button" onClick={onDismiss} className="btn-secondary mt-4 w-full">
        Understood
      </button>
    </section>
  )
}

function StakeFollowUpCard({ settings }: { settings: Settings }) {
  const pending = useLiveQuery(
    async () =>
      (await db.stakeFollowUps.filter((f) => f.acknowledgedAt === undefined).first()) ?? null,
    [],
  )

  if (!settings.commitmentStake || !pending) return null

  return (
    <section className="surface p-5">
      <span className="label">Your commitment</span>
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">
        You missed {formatDateKey(pending.date)}. You said the consequence would be:
      </p>
      <p className="mt-2 leading-relaxed text-ink">{pending.stake}</p>
      <button
        type="button"
        onClick={() =>
          void db.stakeFollowUps.update(pending.id as number, {
            acknowledgedAt: new Date().toISOString(),
          })
        }
        className="btn-secondary mt-4 w-full"
      >
        Done — I followed through
      </button>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        Honor system. The app tracks the promise; it cannot enforce it and does not try.
      </p>
    </section>
  )
}

function BeforeWindow({ opensAt, now, plan }: { opensAt: Date; now: Date; plan?: string }) {
  return (
    <section className="surface flex flex-col gap-3 p-5">
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
    <section className="surface surface-live flex flex-col gap-5 p-5">
      <TimeBar fraction={fraction} msRemaining={msRemaining} />
      <button
        type="button"
        onClick={onOpenCheckIn}
        className="btn-primary pressable w-full py-5 text-base tracking-[0.08em]"
      >
        CHECK IN
      </button>
      {plan && <PlanRow plan={plan} />}
    </section>
  )
}

function CheckedInBanner() {
  return (
    <section className="flex items-center gap-3 rounded-2xl border border-signal/40 bg-linear-to-b from-signal-dim/45 to-signal-dim/15 px-4 py-3.5">
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
    </section>
  )
}

function RestedState({ reason }: { reason?: string }) {
  return (
    <section className="surface px-5 py-6">
      <p className="tnum text-2xl font-semibold tracking-[0.12em] text-ink-dim">REST</p>
      <p className="mt-3 text-sm leading-relaxed text-ink-dim">
        A deliberate rest day, taken on a red readiness call. The streak carries. Lifetime runs do
        not move, because you did not run — the record stays honest in both directions.
      </p>
      {reason && <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">{reason}</p>}
    </section>
  )
}

function MissedState({ why }: { why?: string }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-2xl border border-miss/50 bg-linear-to-b from-miss-dim/45 to-miss-dim/15 px-5 py-6">
        <p className="tnum text-3xl font-semibold tracking-[0.14em] text-miss">MISSED</p>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          The window closed without a check-in. The streak is back to zero and today is marked
          permanently. There is no way to fix it from here — the next window is the only move.
        </p>
      </div>
      {why && (
        <div className="surface p-5">
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
