import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, hardReset, saveSettings } from '../lib/db'
import { formatDateKey, formatTime, parseTime } from '../lib/dates'
import { windowLabel, WINDOW_LEAD_MINUTES } from '../lib/window'
import {
  detectNotificationEnvironment,
  requestNotificationPermission,
  showNotification,
} from '../lib/notifications'
import type { NightPlan, Settings, VerificationMethod } from '../lib/types'

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
        account.
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
      const [runLogs, settings, streak, nightPlans, messageHistory] = await Promise.all([
        db.runLogs.toArray(),
        db.settings.toArray(),
        db.streak.toArray(),
        db.nightPlans.toArray(),
        db.messageHistory.toArray(),
      ])

      const payload = {
        exportedAt: new Date().toISOString(),
        app: '5AM Run Club with Denys',
        // Photos are deliberately excluded: they live on this device and would
        // bloat the export past what a browser can serialise.
        runLogs: runLogs.map(({ photoBlob, ...rest }) => ({
          ...rest,
          hasPhoto: Boolean(photoBlob),
        })),
        settings,
        streak,
        nightPlans,
        messageHistory,
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `5am-run-club-${new Date().toISOString().slice(0, 10)}.json`
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
        Logs, plans, and settings. Check-in photos stay on the device and are not included.
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
