import { atMinutes, parseTime, todayKey } from './dates'
import type { Settings } from './types'
import { PRE_OPEN_NOTICE_MINUTES, WINDOW_LEAD_MINUTES } from './window'

/**
 * Honest scope, per spec §0: this cannot be an alarm. A PWA cannot wake a
 * sleeping phone, override silent mode, or play sound from a suspended tab —
 * that is an OS-level entitlement web apps do not get. Your phone's Clock app
 * does the waking. These notifications are the accountability layer that takes
 * over once you are already awake.
 *
 * Two delivery paths:
 *  1. Server push (the `push` handler in sw.ts) — needs a push backend and a
 *     VAPID key. Wired and ready; set VITE_VAPID_PUBLIC_KEY to turn it on.
 *  2. Local scheduling — fires reliably only while the app is running or
 *     recently backgrounded. Best-effort, and labelled as such in the UI.
 */

export interface NotificationEnvironment {
  supported: boolean
  permission: NotificationPermission
  isIOS: boolean
  isStandalone: boolean
  /** iOS refuses Web Push entirely until the app is installed to the home screen. */
  needsHomeScreenInstall: boolean
}

export function detectNotificationEnvironment(): NotificationEnvironment {
  const supported =
    typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator

  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (typeof navigator !== 'undefined' &&
      navigator.platform === 'MacIntel' &&
      navigator.maxTouchPoints > 1)

  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true)

  return {
    supported,
    permission: supported ? Notification.permission : 'denied',
    isIOS,
    isStandalone,
    needsHomeScreenInstall: isIOS && !isStandalone,
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

export async function showNotification(title: string, body: string, tag: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const reg = await registration()
  const options: NotificationOptions = {
    body,
    tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: '/' },
  }
  if (reg) await reg.showNotification(title, options)
  else new Notification(title, options)
}

interface ScheduledReminder {
  key: string
  at: Date
  title: string
  body: string
}

/** The three fixed daily slots, resolved against a specific day. */
function remindersForDay(settings: Settings, dateKey: string): ScheduledReminder[] {
  const windowOpen = parseTime(settings.targetTime) - WINDOW_LEAD_MINUTES
  const night = parseTime(settings.nightMessageTime)

  return [
    {
      key: `night-${dateKey}`,
      at: atMinutes(dateKey, night),
      title: 'Wind-down',
      body: 'Write tomorrow’s if-then plan before you sleep.',
    },
    {
      key: `pre-${dateKey}`,
      at: atMinutes(dateKey, windowOpen - PRE_OPEN_NOTICE_MINUTES),
      title: '5AM Run Club',
      body: `Run Club opens in ${PRE_OPEN_NOTICE_MINUTES} minutes.`,
    },
    {
      key: `open-${dateKey}`,
      at: atMinutes(dateKey, windowOpen),
      title: 'Window open',
      body: `You have ${settings.windowMinutes} minutes to check in.`,
    },
  ]
}

const MAX_TIMER_MS = 6 * 60 * 60 * 1000 // setTimeout beyond this is not worth trusting

/**
 * Arms local timers for any upcoming slot within the next few hours and re-arms
 * whenever the tab comes back to the foreground. Returns a teardown function.
 */
export function startLocalReminderScheduler(settings: Settings): () => void {
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const fired = new Set<string>()
  let stopped = false

  const arm = () => {
    if (stopped || !settings.notificationsEnabled) return
    for (const timer of timers) clearTimeout(timer)
    timers.clear()

    const now = new Date()
    const today = todayKey(now)
    const tomorrow = todayKey(new Date(now.getTime() + 86_400_000))
    const upcoming = [...remindersForDay(settings, today), ...remindersForDay(settings, tomorrow)]

    for (const reminder of upcoming) {
      const delay = reminder.at.getTime() - now.getTime()
      if (delay <= 0 || delay > MAX_TIMER_MS || fired.has(reminder.key)) continue
      const timer = setTimeout(() => {
        fired.add(reminder.key)
        void showNotification(reminder.title, reminder.body, reminder.key)
        arm()
      }, delay)
      timers.add(timer)
    }
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') arm()
  }

  arm()
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    stopped = true
    document.removeEventListener('visibilitychange', onVisible)
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalised)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

/**
 * Subscribes to real server push. No-ops unless a VAPID public key is
 * configured, since without a backend there is nothing to subscribe to.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  if (!vapidKey) return null

  const reg = await registration()
  if (!reg || !('pushManager' in reg)) return null

  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
  })
}
