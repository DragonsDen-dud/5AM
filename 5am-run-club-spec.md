# 5AM Run Club with Dennis
### Build Specification & Claude Code Prompt

**Status:** Draft v1 — ready for scope review before build
**Owner:** Den (Denys)
**Target builder:** Claude Opus / Claude Code
**Repo suggestion:** `5am-run-club` (standalone repo, separate from Strong Log)

---

## 0. Reality Check — Read This First

You asked for "persistent notification, identification-based tracking." Before the prompt, the honest technical picture, so the build doesn't stall on an impossible requirement:

| What you want | What's actually possible | Why |
|---|---|---|
| App fires a loud alarm at 5:00 AM that wakes you, even if phone was idle for hours, even in silent mode | **Not possible as a PWA.** Only marginally possible as a native/Capacitor app (Android: exact alarms; iOS: blocked almost entirely — "critical alerts" entitlement is reserved for medical/safety apps and Apple does not grant it to habit apps) | iOS treats web apps as sandboxed, backgrounded tabs. Even installed PWAs lose the ability to run code or play sound once the OS suspends them. This is a deliberate Apple restriction, not a bug you can code around. |
| App sends a push notification reminder at 5:00 AM | **Yes, reliably on Android. Yes on iOS 16.4+, but only if installed to home screen, and only as a *notification*, not a wake-you-up alarm sound over silent/DND** | Web Push API works on both platforms now, but it's a notification banner, not an alarm clock. |
| App verifies you actually got up and ran (not just tapped "done") | **Yes** — via photo check-in, GPS movement detection, or a QR/NFC tag by your door, all well within PWA capability | This is where the real product value is. |

**The architecture that actually works:** your phone's native Clock app is the alarm (it's already reliable and free). 5AM Run Club's job starts the second the alarm goes off — it becomes the **accountability layer**: a push notification synced to your alarm time, a mandatory verification check-in, streak tracking, and consequences for missing it. This is closer to how Alarmy / Streaks / commitment-contract apps actually work, and it's a stronger habit-formation mechanism than a louder alarm would be anyway — the friction point for a 5AM run isn't hearing the alarm, it's what happens in the 90 seconds after.

If down the line you want a *true* wake-you-up alarm, that requires wrapping this app in Capacitor and shipping to TestFlight/Play Store as a real installed app with alarm permissions — a bigger project than a PWA. Worth flagging as Phase 2, not blocking Phase 1.

---

## 1. Concept

**One habit. One app. No feature creep.**

5AM Run Club with Dennis is a single-purpose accountability tool for one habit: being out the door running by 5:00 AM. Everything in the app either (a) reminds you, (b) makes you prove you did it, (c) shows you your streak, or (d) makes missing it cost something. Nothing else.

**Tone:** Not a wellness app. Not cute. A demanding coach who already assumes you're capable of this and treats a missed day as a broken promise, not a "that's okay, tomorrow's a new day!" moment. Design and copy should feel like a military-adjacent training log crossed with a premium product — dark, disciplined, respectful of the user's intelligence.

---

## 2. Core Habit Loop

Behavioral design is the actual product here. Structure:

1. **Cue** — 5:00 AM push notification ("Run Club opens in 5 minutes.") + your phone alarm (external, user-managed)
2. **Commitment window** — app opens to a full-screen "Check In" state from 4:45–6:00 AM (configurable). Outside this window the check-in button is disabled/greyed — no retroactive cheating at 11am.
3. **Verification** (user picks ONE method during onboarding, can change in settings):
   - **GPS movement proof** — app watches location for continuous outdoor movement for a minimum duration/distance (e.g. 10 min or 1km) before marking the run complete. Most rigorous, zero manual honesty required.
   - **Photo proof** — snap a photo (outside, sunrise, shoes-on-pavement, whatever) at check-in. Timestamped, stored locally.
   - **Honor check-in** — single tap, "I ran." Lowest friction, lowest rigor — flag this option in the UI copy as the weakest choice, let Den pick it knowingly.
4. **Reward** — streak counter increments, calendar cell fills in, a short "log entry" screen where Den can note distance/time/feel (optional, 10 seconds max to fill)
5. **Consequence for miss** — streak resets to zero, missed day is marked red on the calendar permanently (no deleting/editing history), and the app opens the next morning with a callout referencing the last miss ("Last time you skipped, it took 9 days to rebuild your streak.")

---

## 3. Feature Set (Phase 1 — MVP)

### 3.1 Onboarding (one-time)
- Set target wake/run time (default 5:00 AM)
- Choose verification method (GPS / Photo / Honor)
- Set check-in window length (default 75 min)
- Optional: set a "why" — one sentence, shown back to Den on hard days
- Grant permissions: notifications, location (if GPS method chosen), camera (if photo method chosen)

### 3.2 Home / Today Screen
- Big status state machine, one of:
  - **Before window:** countdown to check-in opening
  - **Window open, not checked in:** large "CHECK IN" call to action, live clock, minutes remaining in window shown as a depleting bar
  - **Checked in today:** confirmation, current streak, quick log entry field
  - **Window closed, missed:** stark "MISSED" state, streak-reset acknowledgment, no way to retroactively fix it
- Current streak (days) — the single most prominent number in the app
- Longest streak ever (secondary, smaller)

### 3.3 Check-In Flow
- GPS mode: live map/progress ring showing movement being tracked toward the distance/time threshold; auto-completes when threshold hit
- Photo mode: camera capture, timestamp burned into corner, saved to local log
- Honor mode: single confirm tap with a short typed confirmation ("type RAN to confirm") to add just enough friction to discourage lying on impulse
- Post check-in: optional fields — distance, duration, effort (1–5), one-line note

### 3.4 Calendar / History
- Month grid, GitHub-contributions-style heat cells: green filled = ran, red = missed, grey = future/not yet due
- Tap any past day to see the log entry (photo/distance/note) for that day
- No editing past entries — history is immutable, this is core to the product's integrity

### 3.5 Streak & Stats
- Current streak, longest streak, total runs, completion rate (last 30/90/365 days)
- "Cost of a miss" — simple stat: current streak × some symbolic value Den defines (e.g. "would reset 47 days of progress")

### 3.6 Notifications
- Push notification scheduled for T-minus-5 and at window open (web push, best-effort per platform table in §0)
- Local notification permission requested clearly with the *why* explained, not a generic browser prompt

### 3.7 Settings
- Adjust run time / window length
- Change verification method
- Export data (JSON) — Den owns his data
- Reset app (hard confirm, destroys streak — make this intentionally uncomfortable to access, buried, not a casual toggle)

---

## 4. Feature Set (Phase 2 — later, not in initial build)

Flag these as backlog, don't build now:
- Capacitor-wrapped native shell for real alarm-clock permissions
- Weekly/monthly review screen with trend charts
- Social accountability (share streak, invite a partner who sees your misses)
- Weather integration (auto-log conditions)
- Apple Health / Google Fit sync for run data
- Widget for home screen showing live streak

---

## 5. Design Direction

**Palette:** Pre-dawn, not daytime. Deep navy/charcoal base (`#0B0F14`–`#111820` range), one accent color that reads as "sunrise about to happen" — burnt orange or amber (`#FF6B35` / `#F7931E` family), used sparingly for the CTA and streak number only. Success state uses a cold, disciplined green (not a cheerful green) — think tactical/military green, not confetti green. Miss state uses a flat, unapologetic red-brown, not alarming candy-red — the feeling should be "sober disappointment," not panic.

**Typography:** One geometric sans for numbers/streak (something like a monospace or tabular-figure font so the streak count feels like a scoreboard), one clean humanist sans for body copy. Big numbers dominate — the streak count should be the largest single element on the home screen, bigger than any button.

**Motion:** Minimal, purposeful. The depleting time-bar during the check-in window is the one animated element that matters — it should create real visible urgency. No celebratory confetti/animation on success — a clean, quiet checkmark and the streak ticking up is reward enough; keep the tone disciplined, not gamified-cute.

**Copy voice:** Second person, direct, zero exclamation points, zero emoji in system copy. "Window opens in 12 minutes." Not "You've got this! 💪" Let the app talk like a coach who respects Den enough not to cheerlead him.

---

## 6. Technical Architecture

Consistent with the Strong Log stack for maintainability and shared muscle memory across your projects.

| Layer | Choice | Notes |
|---|---|---|
| Framework | React + Vite | Fast, matches Strong Log |
| Styling | Tailwind CSS | Design tokens per §5 above configured in `tailwind.config` |
| Local storage | Dexie.js (IndexedDB) | Streak history, log entries, photos (as blobs) stored locally-first |
| PWA layer | `vite-plugin-pwa` | Installable, offline-capable, service worker for push |
| Notifications | Web Push API + service worker | Best-effort per platform (see §0); require install-to-home-screen on iOS with an explicit onboarding step explaining this |
| Geolocation | `navigator.geolocation.watchPosition` | For GPS verification mode, with clear battery/permission UX |
| Camera | `<input capture>` or `getUserMedia` | For photo verification mode |
| Deployment | Vercel | New project, new repo — do not fold into Strong Log's repo/branch |
| State | React state + Dexie live queries (`dexie-react-hooks`) | No need for Redux/Zustand at this scope |

**Data model (Dexie schema sketch):**

```
RunLog {
  id: auto
  date: string (YYYY-MM-DD, unique index)
  status: 'completed' | 'missed'
  verificationMethod: 'gps' | 'photo' | 'honor'
  checkInTime: ISO timestamp
  distanceKm?: number
  durationMin?: number
  effort?: 1-5
  note?: string
  photoBlob?: Blob
  gpsTrace?: {lat,lng,timestamp}[]
}

Settings {
  targetTime: 'HH:MM'
  windowMinutes: number
  verificationMethod: 'gps' | 'photo' | 'honor'
  whyStatement?: string
  notificationsEnabled: boolean
}

StreakState {
  currentStreak: number
  longestStreak: number
  lastCheckInDate: string
}
```

---

## 7. Repo Structure (for clean GitHub hosting)

```
5am-run-club/
├── docs/
│   └── 5am-run-club-spec.md      ← this file, committed for continuity
├── public/
│   ├── icons/                     ← PWA icons, all required sizes
│   └── manifest.webmanifest
├── src/
│   ├── components/
│   │   ├── CheckIn/
│   │   ├── Calendar/
│   │   ├── StreakDisplay/
│   │   └── Settings/
│   ├── lib/
│   │   ├── db.ts                  ← Dexie schema
│   │   ├── streak.ts              ← streak calc logic
│   │   ├── notifications.ts       ← push scheduling
│   │   └── verification/
│   │       ├── gps.ts
│   │       ├── photo.ts
│   │       └── honor.ts
│   ├── screens/
│   │   ├── Onboarding.tsx
│   │   ├── Home.tsx
│   │   ├── History.tsx
│   │   └── Settings.tsx
│   ├── App.tsx
│   └── main.tsx
├── sw.ts                          ← service worker (push handling)
├── vite.config.ts
├── tailwind.config.ts
├── README.md
└── package.json
```

README should include: what the app does in two sentences, the §0 platform-limitation caveat (so future-you or Claude Code doesn't re-litigate "why isn't there a real alarm"), setup instructions, and deploy instructions.

---

## 8. The Build Prompt (paste this to Claude Opus / Claude Code)

Everything above is context. Below is the actual instruction to hand off. A clean, standalone copy of this same prompt also lives in `docs/claude-code-build-prompt.md` for easy pasting.

> Build a PWA called **"5AM Run Club with Dennis"** — a single-habit accountability tracker for a 5:00 AM daily run, per the attached spec (`docs/5am-run-club-spec.md`) and research brief (`docs/5am-run-club-research.md`). Read both files first.
>
> Stack: React + Vite + TypeScript + Tailwind CSS + Dexie.js (IndexedDB) + vite-plugin-pwa, deployed to Vercel. New standalone repo — do not reference or depend on any other project.
>
> Scope lock: verification method is **Photo only** for Phase 1, with Honor as a manual Settings override. **Do not build GPS verification** — it's cut from scope, not deferred as a stub.
>
> Build order:
> 1. Scaffold the Vite + React + TS + Tailwind project, configure `vite-plugin-pwa` with manifest and icons.
> 2. Implement the Dexie schema from §6 **plus the Content Engine schema from §10.2** (`Message`, `MessageHistory` tables), seeded from `src/data/messages.json` — build that JSON file from the 20 messages in `docs/5am-run-club-research.md`, tagged by `slot`/`stage`/`category` as described there.
> 3. Build the Onboarding flow (§3.1) — this sets Settings and must run before Home is accessible.
> 4. Build the Home/Today state machine (§3.2) with all four states, the depleting time-bar, and the **Automaticity Progress bar** (§9.3 / §10.5) below the streak number.
> 5. Build the Check-In flow (§3.3) — Photo mode fully implemented, Honor mode as the Settings-toggled fallback. The morning Content Engine message (§10.5) renders at the top of this screen.
> 6. Build the night-before wind-down flow: a full-width card at the scheduled evening time (default 9PM) showing a Content Engine message and a required if-then text input (§10.5) before it can dismiss.
> 7. Implement the rotation algorithm from §10.3 exactly, including the **recovery override** (highest priority: force a recovery-category message the morning after any missed day) and the 10-day no-repeat window.
> 8. Build the Calendar/History view (§3.4) — GitHub-contributions-style heat grid, immutable past entries.
> 9. Build Stats (§3.5, with Automaticity Progress replacing any "cost of miss" concept) and Settings (§3.7, including night-message time and if-then-plan history).
> 10. Wire up the service worker for push notifications (§3.6) for both the night and morning slots, and add an explicit onboarding screen step on iOS explaining the install-to-home-screen requirement (§0).
> 11. **Icon/branding:** generate the sunrise + running-figure + den-silhouette mark described in §9.4 (sun rising behind a low den/cave, runner emerging toward the light, subtle "00" integrated into the sun disc or horizon, tabular-font "5AM RUN CLUB / WITH DENNIS" wordmark) — use the Adobe Express / Adobe for Creativity tools if available to produce two concept directions for me to pick between; otherwise build clean placeholder icons in the §5 palette and flag that final icon art is pending.
> 12. Apply the design direction from §5 throughout — dark, disciplined, sunrise-accent, no gamified cheerfulness, tabular/scoreboard-style streak number as the dominant visual element.
> 13. Deploy to a new Vercel project and confirm the live URL works on both mobile Chrome (Android) and installed-to-home-screen Safari (iOS).
>
> Do not add any feature from §4 (Phase 2 backlog), and do not build GPS verification. Confirm scope with me before writing code if anything above is ambiguous.

---

## 9. Decisions (locked v2)

1. **Verification method default:** Photo. GPS removed from Phase 1 scope entirely — cut it, don't build even a fallback stub. Honor remains available as a manual override in Settings.
2. **Check-in window:** 75 minutes (4:45–6:00 AM default), configurable in Settings. Confirmed as-is.
3. **"Cost of a miss" stat — design decision (made per research in `docs/5am-run-club-research.md`):** replaced with **Automaticity Progress** — a progress bar toward Day 66, the median time-to-automaticity from Lally et al. (2010). Rationale: an arbitrary dollar/day "cost" framing is punitive and not evidence-backed; "you're 23/66 days toward this becoming automatic" is accurate, motivating, and on-brand for a research-driven app. Streak resets restart the bar, but the app explicitly does NOT reset a "total lifetime runs" counter — that number only ever goes up, so a bad week doesn't erase the whole record.
4. **Icon/branding:** Sunrise + running-figure mark, with a subtle **"Dragon's Den" motif** — a low, dark den/cave silhouette in the foreground with the sun rising behind it and a running figure emerging from the mouth of the den toward the light. Small, understated **"00"** numeral integrated into the sun disc or horizon line as a birth-year nod (2000) — must read as a design detail, not a scoreboard. Wordmark: "5AM RUN CLUB" in the tabular/scoreboard font from §5, "WITH DENNIS" as a smaller subordinate line. Two icon concepts to be generated in-build via Adobe Express (Adobe MCP tools are available — use `search_design` / image generation flow), then Den picks one.

---

## 10. Content Engine — Night-Before & Morning Message System

Full research backing this section lives in `docs/5am-run-club-research.md`. This is a fourth core system alongside Check-In, Calendar, and Stats — build it as a first-class feature, not a stretch goal.

### 10.1 Purpose
Two scheduled message slots per day, each pulling a short, evidence-based, coach-voiced message from a tagged content bank, so the habit is reinforced by *why* it works, not just *whether* it happened.

- **Night slot** — fires at a configurable evening time (default 9:00 PM). Wind-down + implementation-intention content. Ends with a required micro-action: user types a one-line if-then plan into a text field before the card dismisses (research: implementation intentions, d = 0.65 — this only works if the user actually writes the plan, not just reads about it).
- **Morning slot** — fires at window-open (5:00 AM default, tied to Settings). Sleep-inertia / physiology / identity content, shown on the Check-In screen itself (not just a push notification) so it's visible during the highest-friction moment.

### 10.2 Data model addition

```
Message {
  id: string
  slot: 'night' | 'morning'
  stage: 1 | 2 | 3 | 'any'      // maps to habit-formation stage, see 10.4
  category: 'sleep' | 'physiology' | 'identity' | 'streak' | 'recovery' | 'plan'
  text: string
}

MessageHistory {
  id: auto
  messageId: string
  shownDate: string (YYYY-MM-DD)
}
```

Seed `Message` table at first run from a bundled JSON (`src/data/messages.json`) containing the 20 messages in the research artifact, tagged by slot/stage/category as marked there. Ship it easy to extend — Den should be able to add more messages later by editing the JSON, no code change required.

### 10.3 Rotation algorithm

1. Determine current **stage** (10.4).
2. Filter `Message` table to `slot` matching the current trigger AND (`stage` matches current stage OR `stage === 'any'`).
3. **Recovery override:** if yesterday's status was `missed`, ignore steps 1–2 for the very next message and force-select a `category: 'recovery'` message instead (the "one missed day doesn't break a habit" message). This is the single highest-priority rule in the system — it exists specifically to interrupt the what-the-hell-effect spiral documented in the research.
4. From the filtered pool, exclude any message shown in the last 10 days (check `MessageHistory`). If that empties the pool, drop the exclusion (repeat is better than nothing).
5. Pick randomly from what remains, weight `category: 'plan'` slightly higher for the night slot specifically (this is the highest-leverage category per research).
6. Log the shown message to `MessageHistory`.

### 10.4 Stage mapping (drives which messages get shown)

- **Stage 1 (days 1–21 since onboarding):** schedule-building — sleep/circadian and plan-writing messages dominate.
- **Stage 2 (days 22–70):** routine-automating — identity and streak/automaticity-progress messages dominate.
- **Stage 3 (day 71+):** fortifying — mix of all categories, occasional fresh-start messages if a lapse is detected.

Stage is computed from `daysSinceOnboarding`, not from streak length (a reset streak shouldn't reset the user back to Stage 1 messaging — they've already built real automaticity even if yesterday broke).

### 10.5 UI touchpoints
- Night message: full-width card, appears once per day at the scheduled time, requires the if-then text input before it can be dismissed, saved to that day's `RunLog` (or a new lightweight `NightPlan` entry) for reference the next morning.
- Morning message: shown at the top of the Check-In screen during the active window, static (no dismiss required), refreshes to the next rotation pick each new day.
- Automaticity Progress bar: shown on Home screen just below the streak number, small and secondary — "Day 23 of 66 — building toward automatic."
