import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings, seedMessageBank } from './lib/db'
import { addDays, parseTime, todayKey } from './lib/dates'
import { reconcileMissedDays } from './lib/reconcile'
import { startLocalReminderScheduler } from './lib/notifications'
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

  // The night card plans for tomorrow, so it is keyed to tomorrow's run date.
  const tomorrow = addDays(today, 1)
  const tonightPlan = useLiveQuery(
    async () => (await db.nightPlans.where('date').equals(tomorrow).first()) ?? null,
    [tomorrow],
  )

  const minutesNow = now.getHours() * 60 + now.getMinutes()
  const nightDue =
    minutesNow >= parseTime(settings.nightMessageTime) && tonightPlan === null && !checkInOpen

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-md flex-1 safe-t">
        {tab === 'today' && <Home settings={settings} onOpenCheckIn={() => setCheckInOpen(true)} />}
        {tab === 'history' && <History settings={settings} />}
        {tab === 'stats' && <Stats settings={settings} />}
        {tab === 'settings' && <SettingsScreen settings={settings} />}
      </main>

      <BottomNav active={tab} onChange={setTab} />

      {checkInOpen && <CheckIn settings={settings} onClose={() => setCheckInOpen(false)} />}
      {/* Dismissal is driven by the plan appearing in the live query, not by a callback. */}
      {nightDue && <NightCard settings={settings} onDone={() => undefined} />}
    </div>
  )
}
