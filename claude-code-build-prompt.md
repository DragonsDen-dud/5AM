# Claude Code Build Prompt — 5AM Run Club with Dennis

*Paste this directly into Claude Code / Claude Opus as the first message of the build session. It assumes `docs/5am-run-club-spec.md` and `docs/5am-run-club-research.md` are already committed to the repo it's working in — commit them first if they aren't.*

---

Build a PWA called **"5AM Run Club with Dennis"** — a single-habit accountability tracker for a 5:00 AM daily run. Full specification is in `docs/5am-run-club-spec.md`; the behavioral-science backing for the content system is in `docs/5am-run-club-research.md`. **Read both files in full before writing any code.**

**What this app is:** one habit, one tool, tracked rigorously. It is not a general fitness app. Every feature either reminds the user, verifies they ran, shows their streak, or teaches them why the system works. Nothing else.

**Critical constraint, read first:** this is a PWA. It cannot fire a true wake-you-up alarm that overrides silent mode — that's an OS-level permission (iOS critical alerts / Android exact alarms) not available to web apps. The user's phone alarm does the waking; this app is the accountability layer that takes over the moment the alarm goes off. Don't try to build alarm functionality — build the verification/streak/content system instead, per spec.

## Stack
React + Vite + TypeScript + Tailwind CSS + Dexie.js (IndexedDB) + `vite-plugin-pwa`, deployed to Vercel. New standalone repo — no dependency on any other project in this account.

## Scope lock
- Verification: **Photo only** for Phase 1. Honor mode available as a manual Settings override. **Do not build GPS verification** — cut, not deferred.
- No Phase 2 features (native alarm shell, social accountability, weather, health-app sync, home screen widget) — these are explicitly out of scope for this build.

## Build order

1. **Scaffold** — Vite + React + TS + Tailwind, `vite-plugin-pwa` configured with manifest and icons.
2. **Data layer** — Dexie schema per spec §6, plus the Content Engine schema per spec §10.2 (`Message`, `MessageHistory` tables). Seed `Message` from `src/data/messages.json`, built from the 20 tagged messages in the research file (tag each by `slot`: night/morning, `stage`: 1/2/3/any, `category`: sleep/physiology/identity/streak/recovery/plan).
3. **Onboarding** (spec §3.1) — sets Settings, required before Home is reachable. Include verification method, target time, check-in window, "why" statement, permission grants.
4. **Home / Today** (spec §3.2) — four-state machine (before window / window open / checked in / missed), depleting time-bar, current + longest streak, and the **Automaticity Progress bar** (spec §9.3, §10.5): a progress indicator toward Day 66 (the Lally et al. median time-to-automaticity), not a punitive "cost of miss" stat.
5. **Check-In flow** (spec §3.3) — Photo verification fully built (camera capture, burned-in timestamp, local storage as blob); Honor mode as the lightweight fallback with a typed-confirmation friction step. The morning Content Engine message renders at the top of this screen.
6. **Night wind-down flow** — full-width card at a configurable evening time (default 9PM), pulling a Content Engine message, ending with a **required** if-then plan text input before it dismisses (this requirement is load-bearing — implementation intentions only work if the user writes the plan, per the research file's citation of Gollwitzer & Sheeran).
7. **Content Engine rotation** (spec §10.3) — implement exactly as specified, in this priority order:
   - Recovery override (any missed day → force a `recovery`-category message the next relevant slot) — **highest priority rule in the whole system**
   - Stage filter (spec §10.4: stage computed from days-since-onboarding, not streak length)
   - 10-day no-repeat window (drop the exclusion only if it would empty the pool)
   - Slight weighting toward `plan`-category messages in the night slot
8. **Calendar/History** (spec §3.4) — GitHub-contributions-style heat grid, immutable past entries, tap-to-view logged photo/note.
9. **Stats** (spec §3.5) and **Settings** (spec §3.7) — include night-message timing and if-then plan history in Settings.
10. **Notifications** — service worker wired for both night and morning push slots (Web Push API); explicit iOS onboarding step explaining the install-to-home-screen requirement, since push silently fails without it.
11. **Icon/branding** — sunrise + running-figure mark with a Dragon's Den motif: a low, dark den/cave silhouette in the foreground, sun rising behind it, a running figure emerging from the den's mouth toward the light, and a subtle "00" integrated into the sun disc or horizon line (a quiet 2000-birth-year nod — should read as a design detail, not a number badge). Wordmark: "5AM RUN CLUB" in a tabular/scoreboard font, "WITH DENNIS" smaller beneath. If Adobe Express / Adobe for Creativity tools are available, generate two concept directions for selection; otherwise build clean placeholder icons in the palette below and flag final art as pending.
12. **Design system** — apply throughout:
    - Palette: deep navy/charcoal base (`#0B0F14`–`#111820`), sunrise amber/orange accent (`#FF6B35`/`#F7931E` family) used sparingly on CTA and streak number only, tactical/muted green for success, sober red-brown (not alarm-red) for miss
    - Typography: tabular/monospace-leaning font for the streak number and all stats (scoreboard feel — this should be the single largest element on the Home screen), clean humanist sans for body copy
    - Motion: minimal; the only animated element that matters is the check-in window's depleting time-bar. No confetti or gamified celebration on success — a quiet checkmark is enough
    - Copy voice: second person, direct, no exclamation points, no emoji in system copy — a coach who respects the user enough not to cheerlead
13. **Deploy** — new Vercel project, confirm the live URL installs and functions on both mobile Chrome (Android) and installed-to-home-screen Safari (iOS).

## Guardrails
- Confirm scope with me before writing code if anything above is ambiguous — don't guess on ambiguous points, ask.
- Don't add anything from the Phase 2 backlog in the spec.
- Don't build GPS verification, even partially.
- History (calendar entries, streak resets) is immutable by design — no edit/delete UI for past days.
- Keep all copy in the disciplined-coach voice described above; avoid wellness-app cheerfulness anywhere in the UI.
