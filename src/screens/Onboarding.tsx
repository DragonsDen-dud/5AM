import { useMemo, useState } from 'react'
import { DEFAULT_SETTINGS, saveSettings } from '../lib/db'
import { Wordmark } from '../components/Wordmark'
import { ChronotypeQuiz } from '../components/ChronotypeQuiz'
import { BAND_LABELS, BAND_NOTES, type ChronotypeBand } from '../lib/chronotype'
import { addDays, atMinutes, formatTime, parseTime, todayKey } from '../lib/dates'
import { WINDOW_LEAD_MINUTES } from '../lib/window'
import {
  detectNotificationEnvironment,
  requestNotificationPermission,
  subscribeToPush,
} from '../lib/notifications'
import type { VerificationMethod } from '../lib/types'

type StepId =
  | 'intro'
  | 'time'
  | 'chronotype'
  | 'method'
  | 'injury'
  | 'why'
  | 'night'
  | 'notify'
  | 'ios'

export function Onboarding() {
  const env = useMemo(() => detectNotificationEnvironment(), [])

  const [targetTime, setTargetTime] = useState(DEFAULT_SETTINGS.targetTime)
  const [windowMinutes, setWindowMinutes] = useState(DEFAULT_SETTINGS.windowMinutes)
  const [method, setMethod] = useState<VerificationMethod>(DEFAULT_SETTINGS.verificationMethod)
  const [why, setWhy] = useState('')
  const [nightTime, setNightTime] = useState(DEFAULT_SETTINGS.nightMessageTime)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const [chronotypeScore, setChronotypeScore] = useState<number | null>(null)
  const [chronotypeBand, setChronotypeBand] = useState<ChronotypeBand | null>(null)
  const [hamstringHistory, setHamstringHistory] = useState<boolean | null>(null)
  const [injuryNotes, setInjuryNotes] = useState('')

  const steps = useMemo<StepId[]>(() => {
    const base: StepId[] = [
      'intro',
      'time',
      'chronotype',
      'method',
      'injury',
      'why',
      'night',
      'notify',
    ]
    return env.needsHomeScreenInstall ? [...base, 'ios'] : base
  }, [env.needsHomeScreenInstall])

  const [index, setIndex] = useState(0)
  const step = steps[index]
  const isLast = index === steps.length - 1

  const windowOpen = parseTime(targetTime) - WINDOW_LEAD_MINUTES

  const finish = async () => {
    if (finishing) return
    setFinishing(true)

    // If today's window has already closed, tracking starts tomorrow — nobody
    // should be handed a miss for a day that was over before they signed up.
    const now = new Date()
    const today = todayKey(now)
    const todayClosesAt = atMinutes(today, windowOpen + windowMinutes)

    await saveSettings({
      targetTime,
      windowMinutes,
      verificationMethod: method,
      whyStatement: why.trim() || undefined,
      nightMessageTime: nightTime,
      notificationsEnabled,
      onboardedAt: today,
      trackingStartsOn: now <= todayClosesAt ? today : addDays(today, 1),
      onboardingComplete: true,
      chronotypeScore: chronotypeScore ?? undefined,
      chronotypeBand: chronotypeBand ?? undefined,
      chronotypeAnsweredAt: chronotypeBand ? new Date().toISOString() : undefined,
      chronotypePromptDismissed: true,
      hamstringHistoryConfirmed: hamstringHistory ?? false,
      injuryNotes: injuryNotes.trim() || undefined,
    })
  }

  const next = () => {
    if (isLast) void finish()
    else setIndex((i) => i + 1)
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 safe-t safe-b">
      <header className="flex items-center gap-1.5 pt-4">
        {steps.map((id, i) => (
          <span
            key={id}
            className={`h-0.5 flex-1 rounded-full transition-colors ${
              i <= index ? 'bg-ember' : 'bg-base-700'
            }`}
          />
        ))}
      </header>

      <div className="flex flex-1 flex-col justify-center gap-6 py-10">
        {step === 'intro' && (
          <Step
            title="5AM Run Club"
            lead="One habit. Out the door and running by five. Nothing else lives in this app."
            mark
          >
            <p className="text-sm leading-relaxed text-ink-dim">
              Read this once so it never comes up again: this app is not an alarm and cannot become
              one. A web app cannot wake a sleeping phone or override silent mode — that permission
              does not exist for us.
            </p>
            <p className="text-sm leading-relaxed text-ink-dim">
              Your phone&rsquo;s Clock app does the waking. This app takes over the ninety seconds
              after, which is where the habit is actually won or lost.
            </p>
          </Step>
        )}

        {step === 'time' && (
          <Step
            title="Set the time"
            lead="The fixed time is the whole lever. Regularity beats duration in the data, by a wide margin."
          >
            <div>
              <label htmlFor="target" className="label">
                Target run time
              </label>
              <input
                id="target"
                type="time"
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value)}
                className="field tnum mt-2"
              />
            </div>

            <div>
              <span className="label">Check-in window</span>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range"
                  min={30}
                  max={180}
                  step={5}
                  value={windowMinutes}
                  onChange={(e) => setWindowMinutes(Number(e.target.value))}
                  className="h-1 flex-1 accent-[#FF6B35]"
                />
                <span className="tnum w-16 text-right text-sm">{windowMinutes} min</span>
              </div>
              <p className="tnum mt-3 text-sm text-ink">
                {formatTime(windowOpen)} – {formatTime(windowOpen + windowMinutes)}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
                Check-in is impossible outside this window. No early credit, no catching up at
                eleven.
              </p>
            </div>
          </Step>
        )}

        {step === 'chronotype' && (
          <Step
            title="Your clock"
            lead="Six quick questions. Five in the morning sits at a different distance from everyone's natural clock, and the app should know yours."
          >
            {chronotypeBand === null ? (
              <ChronotypeQuiz
                onComplete={(score, band) => {
                  setChronotypeScore(score)
                  setChronotypeBand(band)
                }}
              />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="card">
                  <span className="label">Result</span>
                  <p className="mt-2 font-semibold">{BAND_LABELS[chronotypeBand]}</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-dim">
                    {BAND_NOTES[chronotypeBand]}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setChronotypeBand(null)
                    setChronotypeScore(null)
                  }}
                  className="btn-ghost text-xs"
                >
                  Answer again
                </button>
              </div>
            )}
          </Step>
        )}

        {step === 'method' && (
          <Step title="How you prove it" lead="Pick one. You can change it later in Settings.">
            <div className="flex flex-col gap-3">
              <MethodCard
                active={method === 'photo'}
                title="Photo"
                body="Snap one photo outside during the window. The time is burned into the image and it stays on this device."
                recommended
                onSelect={() => setMethod('photo')}
              />
              <MethodCard
                active={method === 'honor'}
                title="Honor"
                body="Type a word to confirm. This proves nothing and you should know that going in."
                onSelect={() => setMethod('honor')}
              />
            </div>
          </Step>
        )}

        {step === 'injury' && (
          <Step
            title="Injury history"
            lead="Running daily on top of football and the gym loads the same posterior chain three ways. The app manages that risk — but only if it knows."
          >
            <div>
              <span className="label">Previous hamstring or posterior-chain strain?</span>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {[
                  { value: true, label: 'Yes' },
                  { value: false, label: 'No' },
                ].map((option) => {
                  const active = hamstringHistory === option.value
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setHamstringHistory(option.value)}
                      className={`rounded-lg border py-3 text-sm font-semibold transition-colors ${
                        active
                          ? 'border-ember bg-base-850 text-ember'
                          : 'border-base-600 bg-base-850/50 text-ink'
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label htmlFor="injury-notes" className="label">
                Anything else worth knowing
              </label>
              <textarea
                id="injury-notes"
                value={injuryNotes}
                onChange={(e) => setInjuryNotes(e.target.value)}
                rows={3}
                maxLength={280}
                className="field mt-2 resize-none"
                placeholder="Shoulder tightness, old ankle, whatever tends to flare."
              />
            </div>

            <p className="text-[11px] leading-relaxed text-ink-faint">
              Used to weight warm-up and load messaging. This is not medical advice and the app does
              not diagnose anything.
            </p>
          </Step>
        )}

        {step === 'why' && (
          <Step
            title="Why"
            lead="One sentence. You will see it back on the mornings you want to quit."
          >
            <textarea
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              rows={3}
              maxLength={240}
              className="field resize-none"
              placeholder="Because I said I would."
            />
            <p className="text-[11px] text-ink-faint">Optional. Skip it if you would rather.</p>
          </Step>
        )}

        {step === 'night' && (
          <Step
            title="The night before"
            lead="Each evening you write a one-line if-then plan. It is the single highest-leverage thing in this app."
          >
            <div>
              <label htmlFor="night" className="label">
                Wind-down time
              </label>
              <input
                id="night"
                type="time"
                value={nightTime}
                onChange={(e) => setNightTime(e.target.value)}
                className="field tnum mt-2"
              />
            </div>
            <p className="text-sm leading-relaxed text-ink-dim">
              The card will not dismiss until the plan is written. That requirement is the point —
              reading about a plan does nothing, writing one does.
            </p>
          </Step>
        )}

        {step === 'notify' && (
          <Step
            title="Reminders"
            lead="Two a day. The wind-down prompt at night, and five minutes before the window opens."
          >
            <button
              type="button"
              onClick={async () => {
                const result = await requestNotificationPermission()
                setNotificationsEnabled(result === 'granted')
                if (result === 'granted') await subscribeToPush().catch(() => null)
              }}
              className="btn-secondary w-full"
              disabled={!env.supported}
            >
              {notificationsEnabled
                ? 'Reminders on'
                : env.supported
                  ? 'Allow notifications'
                  : 'Not supported in this browser'}
            </button>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              These are notifications, not alarms. They will not sound over silent mode and they will
              not wake a sleeping phone. Keep your Clock app doing that job.
            </p>
            {method === 'photo' && (
              <p className="text-[11px] leading-relaxed text-ink-faint">
                Camera access is requested the first time you check in, not now.
              </p>
            )}
          </Step>
        )}

        {step === 'ios' && (
          <Step
            title="Install it first"
            lead="On iOS this only works properly from the home screen."
          >
            <ol className="flex flex-col gap-3 text-sm leading-relaxed text-ink-dim">
              <li>
                <span className="tnum mr-2 text-ember">1</span>Tap the share button in Safari.
              </li>
              <li>
                <span className="tnum mr-2 text-ember">2</span>Choose Add to Home Screen.
              </li>
              <li>
                <span className="tnum mr-2 text-ember">3</span>Open the app from that icon from now
                on.
              </li>
            </ol>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              Until you do, iOS blocks notifications for this app entirely and will not tell you it
              is doing so. Everything else works in the browser.
            </p>
          </Step>
        )}
      </div>

      <footer className="flex items-center gap-3 pb-6">
        {index > 0 && step !== 'chronotype' && (
          <button type="button" onClick={() => setIndex((i) => i - 1)} className="btn-ghost">
            Back
          </button>
        )}
        {(step !== 'chronotype' || chronotypeBand !== null) && (
          <button type="button" onClick={next} className="btn-primary flex-1" disabled={finishing}>
            {isLast ? (finishing ? 'Starting' : 'Start') : 'Continue'}
          </button>
        )}
      </footer>
    </div>
  )
}

function Step({
  title,
  lead,
  mark = false,
  children,
}: {
  title: string
  lead: string
  mark?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-5">
      {mark && (
        <div className="pb-2">
          <Wordmark size="lg" showIcon />
        </div>
      )}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 leading-relaxed text-ink-dim">{lead}</p>
      </div>
      {children}
    </section>
  )
}

function MethodCard({
  active,
  title,
  body,
  recommended = false,
  onSelect,
}: {
  active: boolean
  title: string
  body: string
  recommended?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-xl border p-4 text-left transition-colors ${
        active ? 'border-ember bg-base-850' : 'border-base-600 bg-base-850/50'
      }`}
    >
      <span className="flex items-center justify-between">
        <span className={`font-semibold ${active ? 'text-ember' : 'text-ink'}`}>{title}</span>
        {recommended && <span className="label">Default</span>}
      </span>
      <span className="mt-2 block text-sm leading-relaxed text-ink-dim">{body}</span>
    </button>
  )
}
