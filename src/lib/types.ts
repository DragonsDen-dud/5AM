/** Photo is the Phase 1 default. GPS is out of scope — cut, not deferred. */
export type VerificationMethod = 'photo' | 'honor'

export type RunStatus = 'completed' | 'missed'

export type MessageSlot = 'night' | 'morning'

/** Habit-formation stage — spec §10.4. `any` messages are eligible at every stage. */
export type MessageStage = 1 | 2 | 3 | 'any'

export type MessageCategory =
  | 'sleep'
  | 'physiology'
  | 'identity'
  | 'streak'
  | 'recovery'
  | 'plan'

export interface RunLog {
  id?: number
  /** YYYY-MM-DD, unique. The calendar date of the check-in window. */
  date: string
  status: RunStatus
  verificationMethod?: VerificationMethod
  /** ISO timestamp. */
  checkInTime?: string
  distanceKm?: number
  durationMin?: number
  /** 1–5. */
  effort?: number
  note?: string
  photoBlob?: Blob
}

export interface Settings {
  id: 'settings'
  /** HH:MM, 24h. The time you intend to be running. */
  targetTime: string
  /** Total length of the check-in window in minutes. */
  windowMinutes: number
  verificationMethod: VerificationMethod
  whyStatement?: string
  notificationsEnabled: boolean
  /** HH:MM, 24h. When the night wind-down card unlocks. */
  nightMessageTime: string
  /** YYYY-MM-DD. Drives stage mapping — never reset by a streak break. */
  onboardedAt: string
  /**
   * YYYY-MM-DD of the first window you could actually make. Onboarding after
   * today's window has closed starts you tomorrow rather than handing you a
   * miss for a day that was already over when you arrived.
   */
  trackingStartsOn: string
  onboardingComplete: boolean
}

export interface StreakState {
  id: 'streak'
  currentStreak: number
  longestStreak: number
  lastCheckInDate: string | null
  /** Lifetime completed runs. Only ever goes up — a bad week does not erase the record. */
  totalRuns: number
}

export interface Message {
  id: string
  slot: MessageSlot
  stage: MessageStage
  category: MessageCategory
  text: string
  /** Short attribution for the evidence behind the message, where there is one. */
  source?: string
}

export interface MessageHistory {
  id?: number
  messageId: string
  /** YYYY-MM-DD. */
  shownDate: string
  slot: MessageSlot
}

export interface NightPlan {
  id?: number
  /** YYYY-MM-DD of the run this plan is for — i.e. the morning after it was written. */
  date: string
  planText: string
  /** ISO timestamp of when it was written. */
  createdAt: string
  messageId: string
}
