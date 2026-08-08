import Dexie, { type Table } from 'dexie'
import type {
  LoadEntry,
  Message,
  MessageHistory,
  MessagePerformance,
  NightPlan,
  ReadinessScore,
  RunLog,
  Settings,
  SleepEntry,
  StakeFollowUp,
  StreakState,
} from './types'
import seedMessages from '../data/messages.json'
import { todayKey } from './dates'
import { DEFAULT_RAMP_INTERVAL_DAYS, DEFAULT_RAMP_STEP_MINUTES } from './alarmTime'

export const DEFAULT_SETTINGS: Omit<Settings, 'onboardedAt' | 'trackingStartsOn'> = {
  id: 'settings',
  targetTime: '05:00',
  windowMinutes: 75,
  verificationMethod: 'photo',
  whyStatement: '',
  notificationsEnabled: false,
  nightMessageTime: '21:00',
  onboardingComplete: false,

  // Alarm nudge §1: built, shipped off. A fixed target is the point.
  chronotypeRampEnabled: false,
  chronotypeRampStep: DEFAULT_RAMP_STEP_MINUTES,
  chronotypeRampIntervalDays: DEFAULT_RAMP_INTERVAL_DAYS,
}

export const EMPTY_STREAK: StreakState = {
  id: 'streak',
  currentStreak: 0,
  longestStreak: 0,
  lastCheckInDate: null,
  totalRuns: 0,
}

class RunClubDB extends Dexie {
  runLogs!: Table<RunLog, number>
  settings!: Table<Settings, string>
  streak!: Table<StreakState, string>
  messages!: Table<Message, string>
  messageHistory!: Table<MessageHistory, number>
  nightPlans!: Table<NightPlan, number>

  // Phase 2
  sleepEntries!: Table<SleepEntry, number>
  loadEntries!: Table<LoadEntry, number>
  readinessScores!: Table<ReadinessScore, string>
  messagePerformance!: Table<MessagePerformance, string>
  stakeFollowUps!: Table<StakeFollowUp, number>

  constructor() {
    super('5am-run-club')

    this.version(1).stores({
      runLogs: '++id, &date, status',
      settings: 'id',
      streak: 'id',
      messages: 'id, slot, stage, category, [slot+category]',
      messageHistory: '++id, messageId, shownDate, slot, [slot+shownDate]',
      nightPlans: '++id, &date, createdAt',
    })

    /**
     * Phase 2. Purely additive: five new tables, two new indexes on `messages`,
     * no field removed and no existing row rewritten in a way Phase 1 code would
     * not recognise. `footballPlayed` is deliberately not indexed — IndexedDB
     * does not index booleans.
     */
    this.version(2)
      .stores({
        runLogs: '++id, &date, status',
        settings: 'id',
        streak: 'id',
        messages: 'id, slot, stage, category, origin, pendingReview, [slot+category]',
        messageHistory: '++id, messageId, shownDate, slot, [slot+shownDate]',
        nightPlans: '++id, &date, createdAt',
        sleepEntries: '++id, &date, source',
        loadEntries: '++id, &date',
        readinessScores: 'date, level',
        messagePerformance: 'id, slot, category',
        stakeFollowUps: '++id, &date',
      })
      .upgrade(async (tx) => {
        // Existing seed messages predate the origin/pendingReview fields. They
        // must be written explicitly: IndexedDB drops records with an undefined
        // value from that field's index, which would hide every Phase 1 message
        // from the pendingReview query.
        await tx
          .table<Message>('messages')
          .toCollection()
          .modify((m) => {
            m.origin = m.origin ?? 'seed'
            m.pendingReview = m.pendingReview ?? 0
          })

        // Backfill load history from Phase 1 run logs so ACWR has a chronic
        // window to work with immediately rather than 28 days from now.
        const logs = await tx.table<RunLog>('runLogs').toArray()
        const backfill: LoadEntry[] = logs
          .filter((l) => l.status === 'completed' && l.durationMin && l.effort)
          .map((l) => ({
            date: l.date,
            durationMin: l.durationMin as number,
            effort: l.effort as number,
            footballPlayed: false,
            sessionLoad: (l.durationMin as number) * (l.effort as number),
          }))

        if (backfill.length > 0) {
          await tx.table<LoadEntry>('loadEntries').bulkAdd(backfill)
        }
      })

    /**
     * Alarm nudge. Additive and index-free: every new field on `NightPlan` and
     * `Settings` is unindexed, so the stores declaration is inherited from v2
     * unchanged and no table is rebuilt.
     *
     * The backfill writes the new fields explicitly rather than leaving them
     * undefined, so "this night had no alarm confirmation" is a recorded fact
     * instead of an absence that later code has to guess at. Existing plans are
     * marked `alarmConfirmed: false` because that is the truth — they were
     * locked under the old single-condition rule. The only user-visible
     * consequence is that a plan already locked for the coming morning asks for
     * the alarm step once, with the plan text pre-filled.
     */
    this.version(3).upgrade(async (tx) => {
      await tx
        .table<NightPlan>('nightPlans')
        .toCollection()
        .modify((p) => {
          p.suggestedAlarmTime = p.suggestedAlarmTime ?? ''
          p.confirmedAlarmTime = p.confirmedAlarmTime ?? ''
          p.alarmConfirmed = p.alarmConfirmed ?? false
          p.timezoneAtConfirmation = p.timezoneAtConfirmation ?? ''
        })

      await tx
        .table<Settings>('settings')
        .toCollection()
        .modify((s) => {
          s.chronotypeRampEnabled = s.chronotypeRampEnabled ?? false
          s.chronotypeRampStep = s.chronotypeRampStep ?? DEFAULT_RAMP_STEP_MINUTES
          s.chronotypeRampIntervalDays =
            s.chronotypeRampIntervalDays ?? DEFAULT_RAMP_INTERVAL_DAYS
        })
    })
  }
}

export const db = new RunClubDB()

/**
 * Seeds the message bank on first run and adds any messages that appear in
 * messages.json later. Existing seed rows are overwritten so editing the JSON is
 * enough to change copy — no code change, no migration. Generated messages have
 * their own ids and are never touched by this.
 */
export async function seedMessageBank(): Promise<void> {
  const seeds = (seedMessages as Message[]).map((m) => ({
    ...m,
    origin: 'seed' as const,
    pendingReview: 0 as const,
  }))
  await db.messages.bulkPut(seeds)
}

export async function getSettings(): Promise<Settings | undefined> {
  return db.settings.get('settings')
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings()
  const today = todayKey()
  const next: Settings = {
    ...DEFAULT_SETTINGS,
    onboardedAt: current?.onboardedAt ?? today,
    trackingStartsOn: current?.trackingStartsOn ?? today,
    ...current,
    ...patch,
    id: 'settings',
  }
  await db.settings.put(next)
}

/**
 * Alarm nudge §4.6. One `NightPlan` row per calendar day, always.
 *
 * Phase 1 wrote with `nightPlans.put(row)` and no id, which auto-increments a
 * *new* key — a second write for the same date violated the unique `&date`
 * index. It never surfaced because the card only ever wrote once. Now that the
 * plan is saved as a draft and the alarm confirmed separately, the same evening
 * writes several times, and downstream recovery-override and stats logic both
 * assume one row per day. The whole read-modify-write runs in one transaction
 * so two tabs cannot both decide the row is missing.
 */
export async function upsertNightPlan(
  date: string,
  patch: Partial<Omit<NightPlan, 'id' | 'date'>>,
): Promise<NightPlan> {
  return db.transaction('rw', db.nightPlans, async () => {
    const existing = await db.nightPlans.where('date').equals(date).first()
    const next: NightPlan = {
      ...(existing ?? {
        date,
        planText: '',
        createdAt: new Date().toISOString(),
        messageId: '',
        suggestedAlarmTime: '',
        confirmedAlarmTime: '',
        alarmConfirmed: false,
        timezoneAtConfirmation: '',
      }),
      ...patch,
      date,
    }
    if (existing?.id !== undefined) next.id = existing.id
    const id = await db.nightPlans.put(next)
    return { ...next, id }
  })
}

export async function getStreak(): Promise<StreakState> {
  return (await db.streak.get('streak')) ?? EMPTY_STREAK
}

/** Wipes everything, including history. Deliberately unpleasant to reach — see Settings. */
export async function hardReset(): Promise<void> {
  await db.delete()
  window.location.reload()
}
