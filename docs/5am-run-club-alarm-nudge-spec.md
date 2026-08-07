# 5AM Run Club — Evening Alarm Setup Nudge
### Patch spec (small, scoped addition to the existing night wind-down flow)

**Status:** Ready to build
**Builds on:** Phase 1 + Phase 2, live on `claude/dennis-to-denys-rename-l7fcdl`
**Size:** This is a patch, not a new phase — one feature, folded into an existing screen. Don't let it grow.

---

## 0. The honest constraint, stated up front (coach hat + engineer hat, same answer)

There is no web API that lets a PWA set an entry in the phone's native alarm clock. Not on iOS, not really on Android either — the one narrow exception is that Chrome on Android can *attempt* to hand off to the Clock app via an `intent:` URL, and even that isn't guaranteed (depends on browser, depends on whether a compatible clock app is installed, can't be verified to have succeeded from web code). So this feature is not "the app sets your alarm." It's **"the app decides the right time, makes it effortless to act on, and won't let you skip acknowledging it"** — same spirit as the existing if-then plan lock. That's actually the more important half of the job anyway: the research already on file is clear that the wake-time *decision* and the *commitment* to it matter more than the mechanical act of turning a dial.

## 1. What gets suggested, and why it should almost never move

**Default behavior (the 95% case): the suggested time is simply `Settings.targetTime`, unchanged, every single night.**

This is deliberate, not a limitation. The single strongest finding in `docs/5am-run-club-research.md` is that sleep/wake **regularity** — not duration, not optimization — is what predicts the outcomes that matter (UK Biobank: 20–48% lower mortality in the most regular sleepers). An algorithm that jitters the suggested time night to night based on mood, readiness, or ACWR would directly undermine the one mechanism the whole app is built around. So:

- **Readiness (Green/Amber/Red) does NOT change the suggested alarm time.** A Red day changes whether Den runs or rests (already built, Phase 2 §1.4) — it does not change when he wakes. Waking on schedule and choosing rest is a different, better-evidenced move than sleeping in.
- **ACWR flags do NOT change the suggested alarm time**, for the same reason.
- **The only thing allowed to move the suggested time is a deliberate, bounded, opt-in ramp** — for a genuine evening-chronotype user easing toward an earlier target over several weeks (a real, evidence-supported technique: gradual phase advance, not daily renegotiation). Rules if this is ever turned on: increments of 15 minutes, no more than once every 5–7 days, capped at reaching the final `Settings.targetTime` and never moving past it, and it never fires while a streak is active mid-ramp — only at Stage 1, pre-streak, during onboarding-adjacent adaptation. **Off by default.** Den's already running a live 5AM target with real streak data — leave this toggle off unless he explicitly asks for it later.

So: build the ramp mechanism because the spec should be complete, but ship it disabled, and the daily suggestion Den will actually see is just his existing target time, pulled fresh from Settings every night (not cached from a prior night — see §4 error cases).

## 2. Where it lives in the flow

Fold into the **existing night wind-down screen** — do not create a second lock screen. Sequence within that one screen:

1. (Existing) Content Engine message
2. (Existing) If-then plan text input
3. **(New) Alarm confirmation step** — shown directly below the plan input, same card:
   - Large display of the suggested time (device-local, explicitly labeled with timezone — see §4.3)
   - Editable time picker, pre-filled with the suggested time, so a manual override is one tap away and never requires fighting a locked value
   - On Android Chrome: a "Set alarm" button that attempts the `intent:` handoff to the Clock app, pre-filled with the chosen time
   - On everything else (iOS Safari, desktop, or if the Android attempt is unavailable): plain instructions ("Set your phone alarm for [time] now") — always visible, never conditionally hidden behind a failed deep-link attempt, because success/failure of that attempt can't be reliably detected from web code
   - A single confirmation checkbox: "My alarm is set for [time]." This, plus the existing if-then plan, are now the two conditions the lock checks — one unified gate, not two competing ones.
4. (Existing) "Save & Unlock" action — now validates both conditions before unlocking History/Settings for the night, same UX pattern as today, just one more field.

## 3. Data model addition

```
NightPlan (extend existing entity from Phase 1) {
  ...existing fields (date, ifThenPlan, etc.)
  suggestedAlarmTime: string       // "HH:MM", computed fresh each evening from Settings.targetTime (or ramp, if enabled)
  confirmedAlarmTime: string       // "HH:MM", what the user actually set (may differ from suggested)
  alarmConfirmed: boolean
  timezoneAtConfirmation: string   // IANA tz name, e.g. "Europe/London" — captured for travel/DST auditability
}

Settings (extend) {
  ...existing fields
  chronotypeRampEnabled: boolean   // default false
  chronotypeRampStep: number       // minutes per adjustment, default 15
  chronotypeRampIntervalDays: number  // default 6
}
```

Upsert `NightPlan` by date — one row per calendar day, keyed so re-opening the app twice in one evening updates the same row rather than creating duplicates (see §4.6).

## 4. Error cases — go through every one of these explicitly, this is the point of the exercise

1. **Date rollover.** "Tomorrow" must be computed from the device's local calendar date at the moment the screen renders, not UTC and not a value cached from when the app was first opened that evening. If Den opens the app at 11:58 PM and the screen is still showing when midnight passes, don't let a stale "tomorrow" silently become "today" — recompute on render, and re-check if the session has been open a long time.
2. **DST transitions — test both directions explicitly.** Spring-forward: the "missing hour" means naive minute-arithmetic on a Date object can produce a wall-clock time that doesn't exist or is off by 60 minutes; use the platform's timezone-aware date library (`Intl.DateTimeFormat` / a proper date library, not manual UTC offset math) to compute "5:00 AM local time tomorrow," not "current time + 24h." Fall-back: the "duplicate hour" can cause the reverse error. Add explicit test cases for the actual DST transition nights, not just an arbitrary date.
3. **Travel / timezone changes.** Suggested time must reflect the device's *current* resolved timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) at the moment of the evening prompt, not a timezone cached from onboarding. Store `timezoneAtConfirmation` on the `NightPlan` row specifically so a later bug report ("the app suggested the wrong time") can be diagnosed against what timezone the device actually reported that night.
4. **Settings changed mid-day.** If Den edits `Settings.targetTime` in the afternoon, that evening's suggestion must reflect the new value — read live, never from a cached copy computed earlier in the session.
5. **App reopened after partial completion.** If Den filled the if-then plan but backgrounded the app before confirming the alarm, reopening before midnight must resume the same screen with the plan already saved (don't make him re-type it) and only the alarm step outstanding.
6. **Duplicate entries.** Upsert `NightPlan` by date key — reopening the flow twice in one evening edits the same row, never creates a second one. This matters for the recovery-override and stats logic downstream, which assume one row per day.
7. **Notification permission denied or push silently failing (known iOS PWA limitation from Phase 1).** The lock screen itself — not the push notification — is the source of truth, exactly as the existing if-then plan lock already works. If push never fires, the in-app screen still appears and still blocks correctly the next time the app is opened that evening. Don't make the new alarm step depend on push having fired.
8. **Android intent deep link fails or is unsupported.** Never gate the manual-instructions fallback on detecting deep-link failure — show both simultaneously, always. A failed or unsupported deep link should degrade silently into "well, the instructions were right there already," not produce an error state or a dead button.
9. **Time-zone ambiguity in the display.** Always label the suggested/confirmed time with the resolved timezone abbreviation or name so there's zero ambiguity, especially relevant if Den is traveling.
10. **Malformed or missing `Settings.targetTime`** (shouldn't happen given Phase 1 onboarding, but defend anyway) — fall back to the hard default of 05:00 rather than crashing the night-lock screen, since that screen being unreachable would lock Den out of the whole app.

## 5. Copy voice (coach hat)

Same disciplined-mentor register as the rest of the app — no exclamation points, no cheerleading. Suggested framing for the new step: *"Tomorrow's target: 5:00 AM. Set your alarm now — the decision happens tonight, not at 4:59 tomorrow."* The checkbox label should feel like a promise, not a checkbox: *"Alarm's set for 5:00 AM."*

## 6. Testing requirements

Extend the existing Playwright date-faking regression suite (used for Phase 1/2 verification) with cases specifically for:
- A run through the standard flow confirming both the plan and the alarm unlock correctly
- A faked date crossing a real DST transition (both directions) to confirm the suggested time stays correct
- A faked timezone change mid-flow to confirm the suggestion and stored `timezoneAtConfirmation` update correctly
- Reopening the flow twice in one evening to confirm no duplicate `NightPlan` rows
- `Settings.targetTime` changed after the first open, confirming the second open reflects the new value
- Ramp mode explicitly disabled by default — confirm a fresh install never shows a shifting suggestion unless the toggle is manually enabled in a test

## 7. Explicitly out of scope for this patch

- Any change to how readiness (Green/Amber/Red) or ACWR influence the run/rest decision — untouched, this patch only touches the alarm-time suggestion and confirmation step.
- A second, separate push notification channel for this feature — it lives inside the existing night wind-down screen and push, not a new one.
- Any attempt to programmatically verify the phone's native alarm was actually set (not possible from a PWA) — the checkbox is an honest, honor-system confirmation, same trust model as the rest of the app.
