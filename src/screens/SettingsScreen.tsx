import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, hardReset, saveSettings } from '../lib/db'
import { formatDateKey, formatTime, parseTime, todayKey } from '../lib/dates'
import { windowLabel, WINDOW_LEAD_MINUTES } from '../lib/window'
import {
  detectNotificationEnvironment,
  requestNotificationPermission,
  showNotification,
} from '../lib/notifications'
import { BAND_LABELS, BAND_NOTES } from '../lib/chronotype'
import { ChronotypeQuiz } from '../components/ChronotypeQuiz'
import { CATEGORY_LABELS } from '../components/MessageCard'
import { describePerformance, EPSILON, MIN_SAMPLE } from '../lib/bandit'
import {
  approveMessage,
  generationIsDue,
  rejectMessage,
  runWeeklyGeneration,
  MODEL,
} from '../lib/generate'
import { COMMITMENT_UNLOCK_STREAK, commitmentUnlocked } from '../lib/commitment'
import type {
  Message,
  MessagePerformance,
  NightPlan,
  Settings,
  StreakState,
  VerificationMethod,
} from '../lib/types'

const RESET_PHRASE = 'RESET EVERYTHING'

interface Props {
  settings: Settings
}

export function SettingsScreen({ settings }: Props) {
  const env = detectNotificationEnvironment()
  const plans = useLiveQuery(
    () => db.nightPlans.orderBy('createdAt').reverse().limit(30).toArray(),
    [],
    [] as NightPlan[],
  )
  const streak = useLiveQuery(() => db.streak.get('streak'), [], undefined)

  const patch = (next: Partial<Settings>) => void saveSettings(next)

  return (
    <div className="flex flex-col gap-5 px-5 pt-2 pb-6">
      <h1 className="text-sm font-semibold tracking-tight">Settings</h1>

      <section className="card flex flex-col gap-5">
        <span className="label">Schedule</span>

        <Field label="Target run time" hint={`Window ${windowLabel(settings)}`}>
          <input
            type="time"
            value={settings.targetTime}
            onChange={(e) => patch({ targetTime: e.target.value })}
            className="field tnum"
          />
        </Field>

        <Field
          label="Window length"
          hint={`Opens ${WINDOW_LEAD_MINUTES} minutes before the target time.`}
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={30}
              max={180}
              step={5}
              value={settings.windowMinutes}
              onChange={(e) => patch({ windowMinutes: Number(e.target.value) })}
              className="h-1 flex-1 accent-[#FF6B35]"
            />
            <span className="tnum w-16 text-right text-sm">{settings.windowMinutes} min</span>
          </div>
        </Field>

        <Field label="Night message" hint="When the wind-down card unlocks.">
          <input
            type="time"
            value={settings.nightMessageTime}
            onChange={(e) => patch({ nightMessageTime: e.target.value })}
            className="field tnum"
          />
        </Field>

        {/*
          Alarm-nudge §1. Off by default and worth leaving off: sleep/wake
          regularity, not optimisation, is the finding the whole app is built
          on. This exists for one narrow case — an evening type easing toward an
          earlier target during initial adaptation.
        */}
        <Field
          label="Chronotype ramp"
          hint={
            settings.chronotypeRampEnabled
              ? `Walks the suggested alarm toward ${settings.targetTime} in ${
                  settings.chronotypeRampStep ?? 15
                }-minute steps, at most one step every ${
                  settings.chronotypeRampIntervalDays ?? 6
                } days. Stops while a streak is running, and never moves past your target.`
              : 'Off. Your suggested alarm is your target time, every night. Nothing — not readiness, not training load — moves it. Turn this on only if you are easing toward an earlier target from scratch.'
          }
        >
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-base-600 bg-base-900 px-3.5 py-3">
            <input
              type="checkbox"
              checked={settings.chronotypeRampEnabled === true}
              onChange={(e) => patch({ chronotypeRampEnabled: e.target.checked })}
              className="size-4 shrink-0 accent-[#FF6B35]"
            />
            <span className="text-sm">Ease toward the target time gradually</span>
          </label>
        </Field>
      </section>

      <section className="card flex flex-col gap-4">
        <span className="label">Verification</span>
        <div className="grid grid-cols-2 gap-3">
          <MethodButton
            method="photo"
            active={settings.verificationMethod === 'photo'}
            title="Photo"
            body="Timestamped, stored on device."
            onSelect={() => patch({ verificationMethod: 'photo' })}
          />
          <MethodButton
            method="honor"
            active={settings.verificationMethod === 'honor'}
            title="Honor"
            body="Typed confirmation only."
            onSelect={() => patch({ verificationMethod: 'honor' })}
          />
        </div>
        {settings.verificationMethod === 'honor' && (
          <p className="text-xs leading-relaxed text-miss">
            Honor mode is the weakest option in the app. It proves nothing. You have chosen it
            knowingly.
          </p>
        )}
      </section>

      <ChronotypeSection settings={settings} onPatch={patch} />
      <InjurySection settings={settings} onPatch={patch} />

      <section className="card flex flex-col gap-4">
        <span className="label">Why you started</span>
        <textarea
          value={settings.whyStatement ?? ''}
          onChange={(e) => patch({ whyStatement: e.target.value })}
          rows={3}
          maxLength={240}
          className="field resize-none"
          placeholder="One sentence. Shown back to you on the bad days."
        />
      </section>

      <NotificationSection settings={settings} env={env} onPatch={patch} />
      <MessagePerformanceSection />
      <GenerationSection settings={settings} onPatch={patch} />
      <CommitmentSection settings={settings} streak={streak} onPatch={patch} />

      <section className="card flex flex-col gap-3">
        <span className="label">If-then plan history</span>
        {plans && plans.length > 0 ? (
          <ul className="flex flex-col divide-y divide-base-700">
            {plans.map((plan) => (
              <li key={plan.id} className="py-3 first:pt-0 last:pb-0">
                <p className="tnum text-[11px] text-ink-faint">{formatDateKey(plan.date)}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-dim">{plan.planText}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-faint">No plans written yet.</p>
        )}
      </section>

      <ExportSection />
      <DangerSection />

      <p className="text-[11px] leading-relaxed text-ink-faint">
        Everything in this app is stored on this device only. Nothing is uploaded, and there is no
        account. The one exception is message generation, which you turn on yourself and which talks
        only to Anthropic.
      </p>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-2 text-[11px] text-ink-faint">{hint}</p>}
    </div>
  )
}

function MethodButton({
  active,
  title,
  body,
  onSelect,
}: {
  method: VerificationMethod
  active: boolean
  title: string
  body: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-lg border p-3.5 text-left transition-colors ${
        active ? 'border-ember bg-base-800' : 'border-base-600 bg-base-800/40'
      }`}
    >
      <span className={`text-sm font-semibold ${active ? 'text-ember' : 'text-ink'}`}>{title}</span>
      <span className="mt-1 block text-[11px] leading-snug text-ink-faint">{body}</span>
    </button>
  )
}

function ChronotypeSection({
  settings,
  onPatch,
}: {
  settings: Settings
  onPatch: (next: Partial<Settings>) => void
}) {
  const [retaking, setRetaking] = useState(false)

  return (
    <section className="card flex flex-col gap-4">
      <span className="label">Chronotype</span>

      {retaking ? (
        <ChronotypeQuiz
          onComplete={(score, band) => {
            onPatch({
              chronotypeScore: score,
              chronotypeBand: band,
              chronotypeAnsweredAt: new Date().toISOString(),
              chronotypePromptDismissed: true,
            })
            setRetaking(false)
          }}
          onSkip={() => setRetaking(false)}
          skipLabel="Cancel"
        />
      ) : settings.chronotypeBand ? (
        <>
          <p className="font-semibold">{BAND_LABELS[settings.chronotypeBand]}</p>
          <p className="text-sm leading-relaxed text-ink-dim">
            {BAND_NOTES[settings.chronotypeBand]}
          </p>
          <button type="button" onClick={() => setRetaking(true)} className="btn-secondary w-full">
            Answer again
          </button>
        </>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-ink-dim">
            Six questions. It calibrates how the app paces you — an evening type gets a longer
            schedule-building phase rather than being told they are behind.
          </p>
          <button type="button" onClick={() => setRetaking(true)} className="btn-secondary w-full">
            Take the assessment
          </button>
        </>
      )}
    </section>
  )
}

function InjurySection({
  settings,
  onPatch,
}: {
  settings: Settings
  onPatch: (next: Partial<Settings>) => void
}) {
  return (
    <section className="card flex flex-col gap-4">
      <span className="label">Injury history</span>

      <button
        type="button"
        onClick={() => onPatch({ hamstringHistoryConfirmed: !settings.hamstringHistoryConfirmed })}
        className="flex items-center justify-between gap-3 text-left"
      >
        <span className="text-sm text-ink">Previous hamstring / posterior-chain strain</span>
        <span
          className={`h-4 w-4 shrink-0 rounded-full border ${
            settings.hamstringHistoryConfirmed ? 'border-ember bg-ember' : 'border-base-500'
          }`}
        />
      </button>

      <textarea
        value={settings.injuryNotes ?? ''}
        onChange={(e) => onPatch({ injuryNotes: e.target.value })}
        rows={2}
        maxLength={280}
        className="field resize-none"
        placeholder="Anything else that tends to flare."
      />

      <p className="text-[11px] leading-relaxed text-ink-faint">
        Weights warm-up and load messaging. Not medical advice — the app does not diagnose anything
        and never will.
      </p>
    </section>
  )
}

function MessagePerformanceSection() {
  const performance = useLiveQuery(
    () => db.messagePerformance.toArray(),
    [],
    [] as MessagePerformance[],
  )
  const { best, rows } = describePerformance(performance ?? [])

  return (
    <section className="card flex flex-col gap-3">
      <span className="label">How the app is picking messages</span>

      {best ? (
        <p className="text-sm leading-relaxed text-ink-dim">
          Messages about{' '}
          <span className="text-ink">{CATEGORY_LABELS[best.category].toLowerCase()}</span> in the{' '}
          {best.slot} slot seem to land best for you lately —{' '}
          <span className="tnum">{Math.round(best.rate * 100)}%</span> completion after them, across{' '}
          <span className="tnum">{best.sampleSize}</span> showings.
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-ink-dim">
          Still gathering data. A category needs at least {MIN_SAMPLE} showings before the app will
          claim anything about it.
        </p>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col gap-1.5 pt-1">
          {rows.map((r) => (
            <li key={`${r.slot}-${r.category}`} className="flex justify-between gap-3 text-xs">
              <span className="text-ink-dim">
                {CATEGORY_LABELS[r.category]} · {r.slot}
              </span>
              <span className="tnum text-ink">{Math.round(r.rate * 100)}%</span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] leading-relaxed text-ink-faint">
        {Math.round((1 - EPSILON) * 100)}% of the time the rotation leans toward what performs; the
        other {Math.round(EPSILON * 100)}% it picks at random so it keeps testing its own
        assumptions. Recovery messages after a miss, and the 10-day no-repeat rule, always run first
        and are never overruled by this.
      </p>
    </section>
  )
}

function GenerationSection({
  settings,
  onPatch,
}: {
  settings: Settings
  onPatch: (next: Partial<Settings>) => void
}) {
  const pending = useLiveQuery(
    () => db.messages.where('pendingReview').equals(1).toArray(),
    [],
    [] as Message[],
  )
  const [keyDraft, setKeyDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const configured = Boolean(settings.anthropicApiKey || settings.generationProxyUrl)

  const generate = async () => {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const results = await runWeeklyGeneration(settings)
      const added = results.reduce((sum, r) => sum + r.added, 0)
      setNote(`${added} new messages drafted. Review them below before they enter rotation.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card flex flex-col gap-4">
      <span className="label">Message generation</span>

      <p className="text-sm leading-relaxed text-ink-dim">
        The 20 seed messages will start repeating within a couple of months. Weekly, the app can
        draft new ones in the same voice using {MODEL}, grounded in the research file and your
        actual recent stats. Nothing it writes enters rotation until you approve it.
      </p>

      {!configured ? (
        <>
          <div>
            <label htmlFor="api-key" className="label">
              Anthropic API key
            </label>
            <input
              id="api-key"
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="field mt-2"
              placeholder="sk-ant-..."
            />
          </div>
          <button
            type="button"
            disabled={keyDraft.trim().length < 20}
            onClick={() => {
              onPatch({ anthropicApiKey: keyDraft.trim(), generationEnabled: true })
              setKeyDraft('')
            }}
            className="btn-secondary w-full"
          >
            Save key and enable
          </button>
          <p className="text-[11px] leading-relaxed text-miss">
            Be deliberate about this. The key is stored in this device&rsquo;s browser storage and
            sent only to Anthropic — never to any server of ours, and it is excluded from your data
            export. It is still a key sitting in a browser: use one scoped to this and nothing else,
            and revoke it if you lose the device. If you would rather not, leave this off — the app
            works exactly as it did without it.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink-dim">
              {settings.generationProxyUrl ? 'Using your proxy endpoint' : 'Key saved on this device'}
            </span>
            <button
              type="button"
              onClick={() =>
                onPatch({
                  anthropicApiKey: undefined,
                  generationProxyUrl: undefined,
                  generationEnabled: false,
                })
              }
              className="btn-ghost px-2 py-1 text-xs"
            >
              Remove
            </button>
          </div>

          <button type="button" onClick={generate} disabled={busy} className="btn-secondary w-full">
            {busy ? 'Drafting' : 'Draft new messages now'}
          </button>

          <p className="tnum text-[11px] text-ink-faint">
            {settings.lastGenerationDate
              ? `Last run ${formatDateKey(settings.lastGenerationDate)}.`
              : 'Not run yet.'}
            {generationIsDue(settings) ? ' Due now.' : ''}
          </p>
        </>
      )}

      {error && <p className="text-sm text-miss">{error}</p>}
      {note && <p className="text-sm text-signal">{note}</p>}

      {pending && pending.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-base-700 pt-4">
          <span className="label">Awaiting review ({pending.length})</span>
          {pending.map((m) => (
            <div key={m.id} className="rounded-lg border border-base-600 bg-base-900 p-3.5">
              <span className="label">
                {CATEGORY_LABELS[m.category]} · {m.slot} · stage {String(m.stage)}
              </span>
              <p className="mt-2 text-sm leading-relaxed text-ink">{m.text}</p>
              {m.source && <p className="mt-2 text-[11px] text-ink-faint">{m.source}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void rejectMessage(m.id)}
                  className="btn-ghost flex-1 py-2 text-xs"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => void approveMessage(m.id)}
                  className="btn-secondary flex-1 py-2 text-xs"
                >
                  Approve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Commitment layer (§4). Off by default and not offered at all until the habit
 * is partly formed — stakes and bundling extend adherence once there is
 * something to protect, and mean nothing on day three.
 */
function CommitmentSection({
  settings,
  streak,
  onPatch,
}: {
  settings: Settings
  streak: StreakState | undefined
  onPatch: (next: Partial<Settings>) => void
}) {
  const unlocked = commitmentUnlocked(settings, streak)

  useEffect(() => {
    if (unlocked && !settings.commitmentUnlockedAt) {
      onPatch({ commitmentUnlockedAt: new Date().toISOString() })
    }
  }, [unlocked, settings.commitmentUnlockedAt, onPatch])

  if (!unlocked) return null

  return (
    <section className="card flex flex-col gap-5">
      <span className="label">Commitment</span>

      <Field
        label="Run-only reward"
        hint="One thing you allow yourself during the run and nowhere else. Shown at check-in."
      >
        <input
          value={settings.runOnlyReward ?? ''}
          onChange={(e) => onPatch({ runOnlyReward: e.target.value })}
          maxLength={140}
          className="field"
          placeholder="The one podcast you only listen to running."
        />
      </Field>

      <Field
        label="Stake for a miss"
        hint="Honor system only. The app records the promise and asks whether you kept it — it processes nothing and contacts nobody."
      >
        <input
          value={settings.commitmentStake ?? ''}
          onChange={(e) => onPatch({ commitmentStake: e.target.value })}
          maxLength={180}
          className="field"
          placeholder="Text a friend who will not let it slide."
        />
      </Field>

      <p className="text-[11px] leading-relaxed text-ink-faint">
        Both are optional and off unless you fill them in. They appeared at day{' '}
        {COMMITMENT_UNLOCK_STREAK} because stakes reliably extend adherence once a habit is partly
        formed, and do very little before that.
      </p>
    </section>
  )
}

function NotificationSection({
  settings,
  env,
  onPatch,
}: {
  settings: Settings
  env: ReturnType<typeof detectNotificationEnvironment>
  onPatch: (next: Partial<Settings>) => void
}) {
  const [permission, setPermission] = useState(env.permission)

  const enable = async () => {
    const result = await requestNotificationPermission()
    setPermission(result)
    onPatch({ notificationsEnabled: result === 'granted' })
  }

  return (
    <section className="card flex flex-col gap-4">
      <span className="label">Notifications</span>

      {!env.supported ? (
        <p className="text-sm text-ink-dim">This browser does not support notifications.</p>
      ) : env.needsHomeScreenInstall ? (
        <p className="text-sm leading-relaxed text-ink-dim">
          On iOS, notifications only work once this app is installed to the home screen. Open the
          share sheet in Safari and choose Add to Home Screen, then reopen it from the icon.
        </p>
      ) : permission === 'granted' && settings.notificationsEnabled ? (
        <>
          <p className="text-sm text-ink-dim">
            Reminders are on: wind-down at {settings.nightMessageTime}, and five minutes before the
            window opens at {formatTime(parseTime(settings.targetTime) - WINDOW_LEAD_MINUTES)}.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void showNotification('Test', 'Notifications are working.', 'test')}
              className="btn-secondary flex-1"
            >
              Send a test
            </button>
            <button
              type="button"
              onClick={() => onPatch({ notificationsEnabled: false })}
              className="btn-ghost flex-1"
            >
              Turn off
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-ink-dim">
            Two a day: the wind-down prompt at night, and the window-open reminder in the morning.
            Nothing else.
          </p>
          <button type="button" onClick={enable} className="btn-secondary w-full">
            {permission === 'denied' ? 'Blocked in browser settings' : 'Turn on reminders'}
          </button>
        </>
      )}

      <p className="text-[11px] leading-relaxed text-ink-faint">
        This is not an alarm and cannot become one. A web app cannot wake a sleeping phone or
        override silent mode — keep using your phone&rsquo;s Clock app for that. These reminders are
        best-effort and fire most reliably while the app has been opened recently.
      </p>
    </section>
  )
}

function ExportSection() {
  const [state, setState] = useState<'idle' | 'working'>('idle')

  const exportData = async () => {
    setState('working')
    try {
      const [
        runLogs,
        settingsRows,
        streak,
        nightPlans,
        messageHistory,
        sleepEntries,
        loadEntries,
        readinessScores,
        messagePerformance,
        stakeFollowUps,
      ] = await Promise.all([
        db.runLogs.toArray(),
        db.settings.toArray(),
        db.streak.toArray(),
        db.nightPlans.toArray(),
        db.messageHistory.toArray(),
        db.sleepEntries.toArray(),
        db.loadEntries.toArray(),
        db.readinessScores.toArray(),
        db.messagePerformance.toArray(),
        db.stakeFollowUps.toArray(),
      ])

      const payload = {
        exportedAt: new Date().toISOString(),
        app: '5AM Run Club with Denys',
        // Photos are deliberately excluded: they live on this device and would
        // bloat the export past what a browser can serialise. The API key is
        // excluded because an export is a file you might send somewhere.
        runLogs: runLogs.map(({ photoBlob, ...rest }) => ({
          ...rest,
          hasPhoto: Boolean(photoBlob),
        })),
        settings: settingsRows.map(({ anthropicApiKey, ...rest }) => rest),
        streak,
        nightPlans,
        messageHistory,
        sleepEntries,
        loadEntries,
        readinessScores,
        messagePerformance,
        stakeFollowUps,
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `5am-run-club-${todayKey()}.json`
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setState('idle')
    }
  }

  return (
    <section className="card flex flex-col gap-3">
      <span className="label">Your data</span>
      <button type="button" onClick={exportData} className="btn-secondary w-full">
        {state === 'working' ? 'Preparing' : 'Export as JSON'}
      </button>
      <p className="text-[11px] leading-relaxed text-ink-faint">
        Logs, sleep, load, readiness, plans, and settings. Check-in photos stay on the device, and
        your API key is never included.
      </p>
    </section>
  )
}

function DangerSection() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')

  return (
    <section className="flex flex-col gap-3 pt-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-center text-[11px] text-ink-faint underline underline-offset-4"
        >
          Reset the app
        </button>
      ) : (
        <div className="rounded-xl border border-miss/50 bg-miss-dim/20 p-5">
          <span className="label text-miss">Destroy everything</span>
          <p className="mt-2 text-sm leading-relaxed text-ink-dim">
            This deletes every logged run, every photo, every plan, and the streak. It cannot be
            undone and there is no backup.
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder={RESET_PHRASE}
            className="field mt-4 uppercase"
          />
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setTyped('')
              }}
              className="btn-secondary flex-1"
            >
              Keep it
            </button>
            <button
              type="button"
              disabled={typed.trim().toUpperCase() !== RESET_PHRASE}
              onClick={() => void hardReset()}
              className="btn flex-1 bg-miss text-ink"
            >
              Erase
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
