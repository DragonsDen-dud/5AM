/** Photo is the Phase 1 default. GPS is out of scope — cut, not deferred. */
export type VerificationMethod = 'photo' | 'honor'

/** `rest` is a deliberate red-readiness rest day — it holds the streak (phase-2 §1.4). */
export type RunStatus = 'completed' | 'missed' | 'rest'

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
  /** Phase 2 — posterior-chain prep, surfaced when load or football flags. */
  | 'injury-aware'

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
  /** Phase 2. Set on a `rest` entry so the calendar can explain itself. */
  restReason?: string

  /*
   * Optional morning detail. Every one of these is unindexed, so they need no
   * schema version and no migration — an older row simply has none of them, and
   * "not recorded" is a truthful reading of that. None of them gates anything or
   * feeds the streak; the check-in is complete without a single one.
   */

  /** Where it was. Free text, one line. */
  routeName?: string
  /**
   * 1–5, how the run *felt* — deliberately not the same axis as `effort`. Effort
   * is RPE and feeds training load; this is affective response, which is the
   * thing that actually predicts whether someone keeps showing up.
   */
  feltScore?: number
  /** Anything that twinged. Flag first, description optional. */
  niggle?: boolean
  niggleNote?: string
  /** Manually entered bpm. No wearable integration — that stays out of scope. */
  avgHeartRate?: number
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

  /* ── Phase 2 ─────────────────────────────────────────────────────────── */

  /** Raw questionnaire score. Absent until the chronotype step is answered. */
  chronotypeScore?: number
  chronotypeBand?: ChronotypeBand
  /** ISO timestamp. Also used to stop re-prompting existing users who declined. */
  chronotypeAnsweredAt?: string
  /** Set once the optional post-onboarding prompt has been shown and dismissed. */
  chronotypePromptDismissed?: boolean

  /** Confirmed in-app rather than assumed, so it lives in the data model. */
  hamstringHistoryConfirmed?: boolean
  injuryNotes?: string

  /** Temptation bundling — the one thing reserved for the run. */
  runOnlyReward?: string
  /** Honor-system only. The app tracks and prompts; it never processes anything. */
  commitmentStake?: string
  /**
   * ISO timestamp of when the commitment layer first became available. Once
   * unlocked it stays unlocked — losing a streak should not also confiscate a
   * mechanism you had already earned.
   */
  commitmentUnlockedAt?: string

  /** Anthropic API key for message generation. Local-only; excluded from export. */
  anthropicApiKey?: string
  /** Optional backend that holds the key instead. Preferred when you have one. */
  generationProxyUrl?: string
  generationEnabled?: boolean
  /** YYYY-MM-DD of the last generation run — the pipeline is weekly. */
  lastGenerationDate?: string
  /** YYYY-MM-DD of the last dormancy re-engagement card shown. */
  lastFreshStartDate?: string

  /* ── Alarm nudge — chronotype ramp (alarm-nudge spec §1) ──────────────── */

  /**
   * Off by default and meant to stay that way for anyone already holding a
   * fixed target. Regularity is the mechanism; a nightly-moving wake time
   * undermines it. Only a genuine evening type easing toward an earlier target
   * during initial adaptation should turn this on.
   */
  chronotypeRampEnabled?: boolean
  /** Minutes per adjustment. Default 15. */
  chronotypeRampStep?: number
  /** Minimum days between adjustments. Default 6. */
  chronotypeRampIntervalDays?: number
  /**
   * How many minutes later than `targetTime` the ramp starts. Not specified by
   * the spec — derived from `chronotypeBand` when absent (see
   * `defaultRampStartOffset`), overridable here.
   */
  chronotypeRampStartOffsetMin?: number
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

  /* Phase 2 — generated messages live in this same table and rotation pool. */
  origin?: 'seed' | 'generated'
  /** 1 while awaiting review, 0 once approved. Numeric because IndexedDB cannot index booleans. */
  pendingReview?: 0 | 1
  generatedAt?: string
  /** Stored for auditability — what the model was asked. */
  sourcePrompt?: string
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

  /* ── Alarm nudge ──────────────────────────────────────────────────────── */

  /** "HH:MM". Computed fresh each evening from Settings.targetTime (or the ramp). */
  suggestedAlarmTime?: string
  /** "HH:MM". What was actually set — may differ from the suggestion. */
  confirmedAlarmTime?: string
  /**
   * The second half of the night lock. The plan alone no longer unlocks;
   * the plan and this together do.
   */
  alarmConfirmed?: boolean
  /**
   * IANA zone reported by the device at confirmation, e.g. "Europe/London".
   * Stored purely so "the app suggested the wrong time" can be diagnosed
   * against what the device actually claimed that night (§4.3).
   */
  timezoneAtConfirmation?: string
}

/* ────────────────────────────────────────────────────────────────────────────
 * Phase 2 — readiness, load management, adaptive content, commitment.
 * Everything below is additive. Phase 1 shapes above are unchanged except
 * `RunStatus`, which gains `rest` so a red-readiness rest day can preserve the
 * streak (phase-2 spec §1.4).
 * ──────────────────────────────────────────────────────────────────────────── */

export type ReadinessLevel = 'green' | 'amber' | 'red'

/** What you chose on a red day. Recorded so the choice itself is auditable. */
export type RedDayChoice = 'ran' | 'easy' | 'rest'

export type SleepSourceId = 'manual' | 'healthkit' | 'googlefit'

/**
 * Condensed morningness–eveningness score. Higher is more morning-typed.
 * Informational only — it calibrates messaging and stage pacing, never access.
 */
export type ChronotypeBand =
  | 'definite-evening'
  | 'moderate-evening'
  | 'intermediate'
  | 'moderate-morning'
  | 'definite-morning'

export interface SleepEntry {
  id?: number
  /** YYYY-MM-DD of the morning you woke. */
  date: string
  hoursSlept: number
  /** 1–5. */
  quality: number
  source: SleepSourceId
  loggedAt: string
}

export interface LoadEntry {
  id?: number
  /** YYYY-MM-DD, unique. */
  date: string
  durationMin: number
  /** 1–5. */
  effort: number
  footballPlayed: boolean
  /** Session-RPE proxy: duration × effort, summed across the day's sessions. */
  sessionLoad: number
}

export interface ReadinessScore {
  /** YYYY-MM-DD, primary key. */
  date: string
  level: ReadinessLevel
  /** Plain-language, generated at compute time. Never a raw number. */
  reasoning: string
  computedAt: string
  /** What you chose when the level was red. Absent on green/amber days. */
  choice?: RedDayChoice
}

export interface MessagePerformance {
  /** `${slot}:${category}` — Dexie needs a single-value primary key. */
  id: string
  slot: MessageSlot
  category: MessageCategory
  /** Completion rate on the day(s) following exposure to this category. */
  rollingCompletionRate: number
  /** How many exposures the rate is computed from. Small samples are ignored. */
  sampleSize: number
  lastRecomputed: string
}

export interface StakeFollowUp {
  id?: number
  /** YYYY-MM-DD of the miss that triggered it. */
  date: string
  stake: string
  /** ISO timestamp. Absent until you mark it done. */
  acknowledgedAt?: string
}
