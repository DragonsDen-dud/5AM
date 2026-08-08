import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings, saveSettings, seedMessageBank } from './lib/db'
import { parseTime, todayKey } from './lib/dates'
import { nextRunDate, safeTargetTime } from './lib/alarmTime'
import { windowForDate } from './lib/window'
import { reconcileMissedDays } from './lib/reconcile'
import { generationIsDue, runWeeklyGeneration } from './lib/generate'
import { startLocalReminderScheduler } from './lib/notifications'
import { ChronotypeQuiz } from './components/ChronotypeQuiz'
import { useNow } from './hooks/useNow'
import { BottomNav, type Tab } from './components/BottomNav'
import { NightCard } from './components/NightCard'
import { Wordmark } from './components/Wordmark'
import { CheckIn } from './screens/CheckIn'
import { History } from './screens/History'
import { Home } from './screens/Home'
import { Onboarding } from './screens/Onboarding'
import { SettingsScreen } from './screens/SettingsScreen'
import { Stats } from './screens/Stats'
import type { Settings } from './lib/types'

export default function App() {
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    void seedMessageBank().finally(() => setBooted(true))
  }, [])

  // `undefined` means still loading; `null` means onboarding has never run.
  const settings = useLiveQuery(async () => (await getSettings()) ?? null, [])

  if (!booted || settings === undefined) return <Splash />
  if (settings === null || !settings.onboardingComplete) return <Onboarding />
  return <Shell settings={settings} />
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Wordmark showIcon />
    </div>
  )
}

function Shell({ settings }: { settings: Settings }) {
  const [tab, setTab] = useState<Tab>('today')
  const [checkInOpen, setCheckInOpen] = useState(false)
  const now = useNow(30_000)
  const today = todayKey(now)

  // Settle any windows that have closed since the app was last open.
  useEffect(() => {
    void reconcileMissedDays(settings)
  }, [settings, today])

  useEffect(() => startLocalReminderScheduler(settings), [settings])

  /*
   * Weekly message generation. Fire-and-forget on purpose: a failed or
   * unconfigured generation must never block the app, and everything it drafts
   * lands in review rather than in rotation.
   */
  useEffect(() => {
    if (!generationIsDue(settings)) return
    void runWeeklyGeneration(settings).catch(() => undefined)
  }, [settings, today])

  /*
   * The night card is keyed to the next run that has not started yet, not to
   * `today + 1` (alarm-nudge §4.1). Those differ after midnight: at 00:30 the
   * run being planned is five hours away, today — the naive form would quietly
   * skip it and plan for the morning after.
   */
  const runDate = nextRunDate(settings, now)
  const tonightPlan = useLiveQuery(
    async () => (await db.nightPlans.where('date').equals(runDate).first()) ?? null,
    [runDate],
  )

  /*
   * The lock runs from the night message time until the check-in window opens,
   * rather than ending at midnight — otherwise the screen vanishes mid-flow at
   * 00:00 and the plan it was collecting is for a run that has not happened yet.
   */
  const minutesNow = now.getHours() * 60 + now.getMinutes()
  const windowOpensAt = windowForDate(
    { ...settings, targetTime: safeTargetTime(settings.targetTime) },
    today,
  ).opensAt
  const nightWindowOpen =
    minutesNow >= parseTime(settings.nightMessageTime) || now < windowOpensAt

  /*
   * Both halves of the gate live here: an unlocked evening is one where the
   * plan is written and the alarm acknowledged (§2). `undefined` is the
   * still-loading state and must not flash the card.
   */
  const nightDue =
    nightWindowOpen &&
    tonightPlan !== undefined &&
    tonightPlan?.alarmConfirmed !== true &&
    !checkInOpen

  /*
   * Existing users predate the chronotype step, so they get an optional prompt
   * rather than a forced one — the assessment calibrates pacing, and a user who
   * declines it simply keeps the default pacing.
   */
  const chronotypeDue =
    !settings.chronotypeBand && !settings.chronotypePromptDismissed && !nightDue && !checkInOpen

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-md flex-1 safe-t">
        {tab === 'today' && <Home settings={settings} onOpenCheckIn={() => setCheckInOpen(true)} />}
        {tab === 'history' && <History settings={settings} />}
        {tab === 'stats' && <Stats settings={settings} />}
        {tab === 'settings' && <SettingsScreen settings={settings} />}
      </main>

      <BottomNav active={tab} onChange={setTab} />

      {chronotypeDue && (
        <ChronotypePrompt
          onDone={(patch) => void saveSettings(patch)}
        />
      )}

      {checkInOpen && <CheckIn settings={settings} onClose={() => setCheckInOpen(false)} />}
      {/* Dismissal is driven by the plan appearing in the live query, not by a callback. */}
      {nightDue && <NightCard settings={settings} onDone={() => undefined} />}
    </div>
  )
}

/**
 * Post-onboarding chronotype prompt for users who installed before Phase 2.
 * Dismissable — unlike the night card, nothing here is load-bearing enough to
 * justify blocking the app.
 */
function ChronotypePrompt({ onDone }: { onDone: (patch: Partial<Settings>) => void }) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-base-900">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-6 px-5 safe-t safe-b">
        <header className="pt-4">
          <span className="label">New in this version</span>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your clock</h1>
          <p className="mt-2 leading-relaxed text-ink-dim">
            Six questions. Five in the morning sits at a different distance from everyone&rsquo;s
            natural clock — this calibrates how the app paces you, and nothing else.
          </p>
        </header>

        <div className="flex-1 pb-8">
          <ChronotypeQuiz
            onComplete={(score, band) =>
              onDone({
                chronotypeScore: score,
                chronotypeBand: band,
                chronotypeAnsweredAt: new Date().toISOString(),
                chronotypePromptDismissed: true,
              })
            }
            onSkip={() => onDone({ chronotypePromptDismissed: true })}
            skipLabel="Not now"
          />
        </div>
      </div>
    </div>
  )
}
