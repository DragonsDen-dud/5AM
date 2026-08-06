# 5AM Run Club with Denys

A single-habit accountability PWA for one thing: being out the door and running by 5:00 AM. It reminds you, makes you prove you did it, shows you the streak, and teaches you why the system works. Nothing else is in it.

---

## Read this before filing "why isn't there an alarm"

**This app is not an alarm and cannot become one.** A PWA cannot wake a sleeping phone, override silent mode, or play sound from a suspended tab. That is an OS-level entitlement (iOS critical alerts, Android exact alarms) that web apps are not granted — on iOS, Apple reserves it for medical and safety apps and does not hand it to habit trackers.

Your phone's Clock app does the waking. This app is the accountability layer that takes over the moment the alarm goes off, which is where a 5AM habit is actually won or lost. A true alarm would mean wrapping this in Capacitor and shipping a native build — Phase 2, not this.

Notifications work as follows:

| Platform | Behaviour |
|---|---|
| Android / Chrome | Web Push works. Notification banners, not alarm sounds. |
| iOS 16.4+ | Web Push works **only** after the app is installed to the home screen. Onboarding has a dedicated step for this because iOS fails silently otherwise. |
| Everywhere | Reminders are local timers unless a push backend is configured (see below). They fire reliably while the app has been opened recently; they are not a guarantee. |

To enable real server push, set `VITE_VAPID_PUBLIC_KEY` and stand up a backend holding the matching private key. The service worker's `push` and `notificationclick` handlers are already wired (`sw.ts`) — turning it on is a deployment step, not a rewrite.

---

## What it does

- **Onboarding** sets the target time, window length, verification method, your "why", and the night message time. It runs once and gates the rest of the app.
- **Home** is a four-state machine: before the window (countdown), window open (depleting time-bar and the check-in CTA), checked in (quiet confirmation and the log form), and missed. The streak number is the largest element on the screen.
- **Automaticity Progress** sits under the streak: progress toward Day 66, the median time-to-automaticity from Lally et al. (2010). This deliberately replaces any "cost of a miss" framing.
- **Check-in** is photo verification by default — camera capture with the timestamp burned into the image, stored locally as a blob. Honor mode is a manual Settings override with a typed-confirmation friction step. Check-in is impossible outside the window; there is no backdating.
- **Night wind-down** appears each evening at a configurable time and does not dismiss until you write a one-line if-then plan. That requirement is load-bearing, not a nag.
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
├── docs/                     spec, research brief, original build prompt
├── public/icons/             icon.svg source + generated PWA icon set
├── scripts/build-icons.mjs   renders the icon set from icon.svg
├── src/
│   ├── components/           StreakDisplay, TimeBar, MessageCard, NightCard, …
│   ├── data/messages.json    the content bank — edit this to change copy
│   ├── hooks/
│   ├── lib/                  db, streak, window, content, reconcile, notifications
│   │   └── verification/     photo.ts, honor.ts
│   └── screens/              Onboarding, Home, CheckIn, History, Stats, Settings
├── sw.ts                     service worker: precache, push, notificationclick
└── vercel.json
```

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
