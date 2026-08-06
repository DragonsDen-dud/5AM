import Dexie, { type Table } from 'dexie'
import type {
  Message,
  MessageHistory,
  NightPlan,
  RunLog,
  Settings,
  StreakState,
} from './types'
import seedMessages from '../data/messages.json'
import { todayKey } from './dates'

export const DEFAULT_SETTINGS: Omit<Settings, 'onboardedAt' | 'trackingStartsOn'> = {
  id: 'settings',
  targetTime: '05:00',
  windowMinutes: 75,
  verificationMethod: 'photo',
  whyStatement: '',
  notificationsEnabled: false,
  nightMessageTime: '21:00',
  onboardingComplete: false,
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
  }
}

export const db = new RunClubDB()

/**
 * Seeds the message bank on first run and adds any messages that appear in
 * messages.json later. Existing rows are overwritten so editing the JSON is
 * enough to change copy — no code change, no migration.
 */
export async function seedMessageBank(): Promise<void> {
  await db.messages.bulkPut(seedMessages as Message[])
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

export async function getStreak(): Promise<StreakState> {
  return (await db.streak.get('streak')) ?? EMPTY_STREAK
}

/** Wipes everything, including history. Deliberately unpleasant to reach — see Settings. */
export async function hardReset(): Promise<void> {
  await db.delete()
  window.location.reload()
}
