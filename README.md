# 5AM Run Club with Denys

A single-habit accountability PWA for one thing: being out the door and running by 5:00 AM. It reminds you, makes you prove you did it, shows you the streak, and teaches you why the system works. Nothing else is in it.

---

## Read this before filing "why isn't there an alarm"

**This app is not an alarm and cannot become one.** A PWA cannot wake a sleeping phone, override silent mode, or play sound from a suspended tab. That is an OS-level entitlement (iOS critical alerts, Android exact alarms) that web apps are not granted — on iOS, Apple reserves it for medical and safety apps and does not hand it to habit trackers.

Your phone's Clock app does the waking. This app is the accountability layer that takes over the moment the alarm goes off, which is where a 5AM habit is actually won or lost. A true alarm would mean wrapping this in Capacitor and shipping a native build. That was reviewed for Phase 2 and deliberately not built: Apple has a documented pattern of rejecting the critical-alerts entitlement for alarm-clock use cases, so the payoff is asymmetric — Android gains real ground, iOS barely moves.

What the app does do is decide the time, put it in front of you, and refuse to let you skip acknowledging it — see **The alarm step** below.

Notifications work as follows:

| Platform | Behaviour |
|---|---|
| Android / Chrome | Web Push works. Notification banners, not alarm sounds. |
| iOS 16.4+ | Web Push works **only** after the app is installed to the home screen. Onboarding has a dedicated step for this because iOS fails silently otherwise. |
| Everywhere | Reminders are local timers unless a push backend is configured (see below). They fire reliably while the app has been opened recently; they are not a guarantee. |

To enable real server push, set `VITE_VAPID_PUBLIC_KEY` and stand up a backend holding the matching private key. The service worker's `push` and `notificationclick` handlers are already wired (`sw.ts`) — turning it on is a deployment step, not a rewrite.

---

## Phase 2 — what the app now knows

Phase 1 proved the loop works structurally. Phase 2 makes the app know things about the body it is coaching, and adapt instead of running a fixed script. Everything added here is **advisory and transparent**: nothing new can gate a check-in, and nothing hides its reasoning.

- **Chronotype** — a condensed six-question morningness–eveningness assessment at onboarding (optional prompt for existing users). It never gates anything; it lengthens Stage 1 for evening types so they are paced against their own clock rather than told they are behind.
- **Sleep** — two-tap hours/quality logging behind a `SleepSource` interface. Only `manual` is implemented; a HealthKit or Google Fit source drops into the registry without touching a single caller or the schema.
- **Readiness** — Green / Amber / Red from your 7-day sleep average against *your own* median baseline, consecutive training-adjacent days, and last logged effort. One line of plain-language reasoning, never a raw number. Green and Amber never interrupt. Red inserts one screen with a genuine three-way choice — run anyway, easy version, or rest — and records which you picked.
- **Rest days hold the streak.** A red-day rest is logged permanently as a rest, bridges the streak, and does not increment lifetime runs. Only a miss breaks the chain. Rest days are excluded from completion rate on both sides.
- **Load and ACWR** — session-RPE load (duration × effort) plus a one-tap football log, rolled into 7-day acute and 28-day chronic averages. The ratio surfaces only when it enters the elevated range, as an ordinary Content Engine card. A monthly (not daily) load review lands on Stats.
- **Adaptive rotation** — an epsilon-greedy bandit over message *categories* (85% exploit / 15% explore), recomputed weekly. It re-weights **inside** the pool the Phase 1 rules already produced: the recovery override and the 10-day no-repeat window run first and are never overruled. The current weighting is shown in plain language in Settings.
- **Generated messages** — a weekly Claude call drafts new messages in the same voice, grounded in the research file and your actual recent stats, self-tagged by the existing taxonomy. Everything lands as `pendingReview` and cannot enter rotation until you approve it by hand.
- **Commitment layer** — temptation bundling and an honor-system stake, off by default and not offered until a 21-day streak. Once unlocked it stays unlocked.
- **Fresh start** — after 3+ consecutive missed days, a distinct re-engagement card at the next temporal landmark. Separate copy and a separate trigger from the daily recovery message.
- **Stats v2** — completion trend, readiness alongside completion, ACWR trend, and message-category performance. One chart visible at a time.

### The generative pipeline, and your API key

This is the one feature that talks to a network, and it is off until you turn it on. Two transports:

1. **A proxy endpoint you control** (`generationProxyUrl` in Settings) that holds the key server-side. Use this if you ever stand one up.
2. **A key you paste into Settings**, stored in this device's IndexedDB and sent only to Anthropic.

No key is bundled with the app, and the key is excluded from the JSON export. It is still a key in browser storage — scope it to this and nothing else, and revoke it if you lose the device. The SDK is dynamically imported, so it never lands in the main bundle for anyone who leaves this off.

The evidence constraint is enforced **in the system prompt itself**, not as a hope: the model is given `src/data/research-summary.json` as its complete evidence base and is instructed never to invent a statistic, never to promise a performance or health outcome, and to flag uncertainty rather than fill it. Output is self-tagged and held for review.

### Explicitly not built in Phase 2

Native Capacitor shell (Apple does not grant the critical-alerts entitlement for alarm-clock use cases — a policy wall, not an engineering gap), automated payment or stakes processing, wearable integrations beyond the `SleepSource` interface, weather, multi-user, and social features.

---

## The main screen

Today is a hero, a state block, and a control panel, in that order — except when the check-in window is actually open, in which case the window jumps above the hero. The streak is motivation; the check-in is the job, and the job does not sit below the fold on a small phone.

**The streak hero** is one object carrying three readings. The number, filled with the app's one gradient. A ring around it showing progress toward day 66 — the median time-to-automaticity from Lally et al. (2010), which is a target you can actually finish, unlike "don't break the chain". And a fourteen-day rail underneath, because a streak of 9 with two rest days in it has a different shape from a clean 9, and the number alone throws that away. Rail cells encode outcome in height as well as colour, so they read without relying on colour vision.

**The Today panel** answers three questions at a glance: what still needs filling in, what is already filled and can be changed, and what is not yours to change.

| Row | Needed | Done | Locked |
|---|---|---|---|
| Morning run | Window open — the CTA is above | Summary of distance / duration / effort, tap to edit | Before the window, or permanently after a miss |
| Last night's sleep | Auto-expanded, two taps | `7h · quality 4/5`, tap to correct | — |
| Training load | — | Football logged, one tap to undo | Optional by nature, never nags |
| Tomorrow's plan | After the night message time | Alarm time and the locked if-then | Until the wind-down unlocks |

The header counts only the three that are genuinely tasks — football is a fact about your day, not a chore, so it is never counted against you.

The editable/immutable line is the one the whole trust model rests on. **Whether you ran is decided inside the window and is never editable afterwards.** Everything *around* that fact — how far, how hard, how you slept, whether you played football — stays yours to correct for as long as the day lasts. Past days stay closed either way, and a missed day shows no edit affordance at all.

### Gradients, and where they are allowed

Gradient carries depth; colour still carries meaning. There is one light source, above the top of the screen: `.surface` catches a hairline of it and falls away into the base navy, and `.surface-live` is the ember-tinted variant used only for the surface currently asking for an action. The one decorative flourish is `.aurora`, a pre-dawn glow bleeding in at the top of Today.

Amber stays reserved. It appears as a gradient on exactly two things — the streak number and the primary CTA — which is the same rule Phase 1 set, applied to a richer fill.

Every colour introduced here was checked rather than eyeballed. All three meaning-carrying status chips clear WCAG AA for body text against the composited surface (7.96, 6.55, 5.08); the inactive chip and `ink-faint` sit at AA-large, unchanged from Phase 1; both ends of the CTA gradient clear AA against the button label.

## Logging a morning

Distance, duration and effort stay on the surface of the check-in form, because duration × effort is the session-RPE load that drives ACWR — those three feed something. Everything else sits behind a **More detail** disclosure, collapsed by default and auto-opened only when it already has content. At 5am a longer form does not get filled more carefully; it stops getting filled at all.

| Optional field | Why it is there |
|---|---|
| Route | Free text. Pattern-spotting later, nothing more. |
| How it felt (1–5) | Deliberately **not** the same axis as effort. Effort is how hard it was; this is whether you would want to do it again. Affective response is the better predictor of whether the habit survives, and the two genuinely diverge — a hard session can feel great. |
| Average heart rate | Typed by hand if your watch tells you. Nothing syncs; wearable integration stays out of scope. |
| Niggle | A flag plus an optional line. Onboarding already asks about posterior-chain history, and a twinge recorded on the day is worth far more in March than one remembered in March. Logged, never diagnosed. |

None of it is required, none of it can affect the streak, and a check-in is complete without a single one. Pace is derived from distance and duration rather than asked for.

All of these are unindexed fields on `RunLog`, so they need no schema version and no migration — an older entry simply has none of them, and "not recorded" is a truthful reading of that. The day view renders only the fields that exist; a row of em-dashes says nothing and costs the same space as something.

### Reading a day back

Tap any cell in the 14-day rail on Today and that day's record opens in a sheet: photo, distance, duration, effort, pace, felt, heart rate, route, note, niggle. The same view is what the History calendar shows, from one shared component — a second copy would drift the moment either grew a field.

The sheet is read-only, and says so. History is immutable; the only place a day can be edited is Today, and only for the day it belongs to.

## The alarm step

The night wind-down now closes on two conditions instead of one: the if-then plan **and** a confirmed alarm time. Same screen, same lock, one more field — there is no second lock screen and no skip.

The suggested time is `Settings.targetTime`, read fresh every evening, and it does not move. Not for readiness, not for ACWR. Regularity is the mechanism the whole app rests on (UK Biobank: 20–48% lower mortality in the most regular sleepers), and an algorithm that renegotiates your wake time nightly would be attacking the thing it is meant to protect. The one exception is an opt-in chronotype ramp for an evening type easing toward an earlier target from scratch — 15-minute steps, at most one every six days, capped at your target and never past it, Stage 1 only, frozen while a streak is running. **It ships off, and it stays off unless you turn it on in Settings.**

The confirmation is honour-system, and that is not a shortcut — no PWA can verify a native alarm exists. On Android Chrome there is a "Set alarm on this phone" link that attempts an `intent:` handoff to the Clock app; whether it resolves depends on the browser and on a compatible clock app, and neither is detectable from web code. So the written instructions sit next to it permanently rather than appearing after a failure that cannot be detected. A dead link degrades into "the instructions were already right there."

### The awkward cases, and where they are covered

Every one of these is a named test, not a hope. The timezone and DST maths lives in `src/lib/alarmTime.ts` as pure functions and is unit-tested under real IANA zones; the rest is driven through the UI.

| Case | Behaviour |
|---|---|
| Midnight passes with the screen open | The plan is keyed to the next run window that has not opened yet, not `today + 1`. At 00:30 the run being planned is the one five hours away — the naive form would skip it. The lock now runs from the night message time until the window opens, so the screen does not vanish at midnight mid-flow. |
| DST, both directions | `zonedTimeToInstant` resolves a wall-clock time against the zone by trying both candidate offsets and round-tripping each. Spring-forward gaps and fall-back duplicate hours are detected and named, not silently mis-resolved. Tested on the actual 2026 transition nights in London, New York and Sydney. |
| Travel | The zone is read from `Intl.DateTimeFormat().resolvedOptions().timeZone` at render, never cached. `timezoneAtConfirmation` is stored on the row so "it suggested the wrong time" is diagnosable later. |
| `targetTime` edited mid-day | Read live from the settings row on every render. The evening reflects the afternoon's edit. |
| Backgrounded mid-flow | The plan is persisted as a draft while it is written, so reopening restores it with only the alarm outstanding. |
| Reopened twice in one evening | `upsertNightPlan` is keyed by date inside a transaction. One row per day, always — the recovery override and stats both depend on it. |
| Push denied or silently failing | The lock screen is the source of truth and never consults notification state. Tested with `Notification.permission` forced to `denied` and `PushManager` removed. |
| Android intent unsupported | Manual instructions are unconditional. No error state, no dead button, no detection attempt. |
| Ambiguous displayed time | Every time is labelled with the resolved zone abbreviation and IANA name. |
| Malformed `targetTime` | Falls back to 05:00 rather than throwing. That screen being unreachable would lock you out of the whole app, so nothing on it is allowed to depend on a well-formed setting. |

## What it does

- **Onboarding** sets the target time, window length, verification method, your "why", and the night message time. It runs once and gates the rest of the app.
- **Home** is a four-state machine — before the window (countdown), window open (depleting time-bar and the check-in CTA), checked in, missed — wrapped around a streak hero and a Today control panel. See **The main screen** above.
- **Automaticity Progress** is the ring around the streak: progress toward Day 66, the median time-to-automaticity from Lally et al. (2010). This deliberately replaces any "cost of a miss" framing.
- **Check-in** is photo verification by default — camera capture with the timestamp burned into the image, stored locally as a blob. Honor mode is a manual Settings override with a typed-confirmation friction step. Check-in is impossible outside the window; there is no backdating. Optional detail hangs off it — see **Logging a morning** below.
- **Night wind-down** appears each evening at a configurable time and does not dismiss until you write a one-line if-then plan and confirm tomorrow's alarm. Both requirements are load-bearing, not a nag.
- **Content Engine** delivers two evidence-based messages a day from a tagged bank, stage-aware and non-repeating, with a recovery override after any miss.
- **History** is a month heat grid. Past entries are immutable — no edit, no delete.
- **Stats** covers streaks, lifetime runs, completion rates, and your current habit-formation stage.

### The Content Engine rotation

Implemented in `src/lib/content.ts`, in strict priority order:

1. **Recovery override** — if the last settled day was a miss, the very next message in any slot is forced to a `recovery`-category message, skipping the stage filter entirely. This is the highest-priority rule in the system; it exists to interrupt the what-the-hell effect before it starts. It releases once one recovery message has gone out.
2. **Stage filter** — stage comes from days since onboarding (1–21 / 22–70 / 71+), never from streak length. Breaking a streak does not demote you to beginner messaging.
3. **10-day no-repeat window** — dropped only if honouring it would empty the pool.
4. **Plan weighting** — `plan`-category messages are weighted ×2 in the night slot.

The bank lives in `src/data/messages.json` — 20 messages tagged by `slot` / `stage` / `category`, each with its evidence attribution. Add or edit messages there; the app re-seeds on launch and no code change is needed.

---

## Scope

**In:** photo verification, honor override, streak, calendar, stats, content engine, notifications.

**Cut, not deferred:** GPS verification. It is not stubbed and should not be added back without a scope decision.

**Phase 2 backlog, not built:** Capacitor native shell, weekly/monthly trend charts, social accountability, weather integration, Apple Health / Google Fit sync, home screen widget.

---

## Stack

React 19 + Vite + TypeScript + Tailwind CSS 4 + Dexie.js (IndexedDB) + `vite-plugin-pwa`.

Everything is stored on-device. There is no account, no server, and nothing is uploaded — including check-in photos.

```
├── docs/                     specs (phase 1 + 2), research brief, build prompts
├── public/icons/             icon.svg source + generated PWA icon set
├── scripts/build-icons.mjs   renders the icon set from icon.svg
├── src/
│   ├── components/           StreakHero, TodayPanel, TimeBar, NightCard, …
│   ├── data/messages.json    the content bank — edit this to change copy
│   ├── data/research-summary.json  evidence base for generated messages
│   ├── hooks/
│   ├── lib/                  db, streak, window, content, reconcile, notifications
│   │                         readiness, load, sleep, bandit, generate, trends
│   │                         alarmTime (suggestion, DST/zone maths, ramp)
│   │   └── verification/     photo.ts, honor.ts
│   └── screens/              Onboarding, Home, CheckIn, History, Stats, Settings
├── sw.ts                     service worker: precache, push, notificationclick
└── vercel.json
```

### A note on the schema migration

Dexie v1 → v2 is additive: five new tables, two new indexes on `messages`, no field removed. The upgrade backfills `origin`/`pendingReview` on existing messages explicitly — IndexedDB drops records with an undefined value from that field's index, which would otherwise hide every Phase 1 message from the review query — and backfills `LoadEntry` rows from Phase 1 runs that already recorded duration and effort, so ACWR has a chronic window immediately rather than 28 days from now.

v2 → v3 (the alarm step) adds no table and no index: every new field on `NightPlan` and `Settings` is unindexed, so the stores declaration is inherited and nothing is rebuilt. The backfill still writes them explicitly rather than leaving them undefined, so "this night had no alarm confirmation" is a recorded fact instead of an absence later code has to guess at. Existing plans are marked `alarmConfirmed: false`, because that is true — they were locked under the old single-condition rule. The one user-visible consequence is gentle and deliberate: a plan already locked for the coming morning asks for the alarm step once, with the plan text pre-filled.

Both migrations are tested against real data, not a clean install. The test drives the actual Phase 1 bundle's onboarding, injects a month of history, swaps the origin to the Phase 2 bundle and reloads over the same database, locks a plan through the Phase 2 night card, then swaps again to the current bundle — the exact sequence a live install has been through — and asserts the streak, the run logs, the plans, the sleep and load history and the settings all survive intact.

### A note on `reconcile.ts`

A closed window with no check-in would otherwise leave no record, and an absent day is indistinguishable from a future one. On every launch the app backfills a `missed` entry for each settled day since onboarding that has no entry. It only ever fills gaps — it never rewrites an existing entry, because history is immutable.

---

## Setup

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm run preview    # serve the production build locally
npm run icons      # regenerate the icon set from public/icons/icon.svg
```

The service worker is disabled in dev (`devOptions.enabled: false`). To exercise install, offline, or notification behaviour, use `npm run build && npm run preview`.

## Deploy

The repo is Vercel-ready via `vercel.json` (Vite framework preset, SPA rewrites, immutable asset caching, and a no-cache header on `sw.js` so updates are picked up).

```bash
npx vercel            # preview deployment
npx vercel --prod     # production
```

Or import the repo in the Vercel dashboard and accept the detected settings.

After deploying, verify on device:

- **Android / Chrome** — install prompt appears, app opens standalone, notifications can be granted.
- **iOS / Safari** — Share → Add to Home Screen, then open from the icon. Notifications will not work until you do; the onboarding flow says so explicitly on iOS.

## Design

Palette, typography, motion, and copy voice are specified in `docs/5am-run-club-spec.md` §5 and implemented as Tailwind theme tokens in `src/index.css`. In short: pre-dawn navy base, amber reserved for the CTA and the streak number only, tactical green for success, sober red-brown for a miss, tabular figures on every number, and a coach's voice — second person, no exclamation points, no emoji.

### Icon

`public/icons/icon.svg` is the source of truth: sun rising behind a low, dark den, a runner emerging from the lit mouth toward the light, and a quiet "00" set into the horizon line. Edit the SVG and run `npm run icons` to regenerate every size, including the maskable variants.
