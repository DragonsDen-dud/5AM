# 5AM Run Club with Denys — Phase 2 Specification
### High-Fidelity Physiology, Adaptive Coaching & Load Management

**Status:** Draft v1, ready for scope review
**Builds on:** Phase 1 (live on `claude/dennys-to-denys-rename-l7fcdl` — verify branch name before starting)
**Philosophy:** Phase 1 proved the habit loop works structurally. Phase 2 makes the app *know things* — about Den's body, his sleep, his injury history, and which coaching actually moves the needle for him specifically — rather than running a fixed script. Still one habit, one app. Every addition below either makes the system safer (injury/load-aware) or makes it smarter (adaptive, personalized). Nothing is added for novelty.

---

## 0. What Apple Won't Let Us Have (read first, again)

Before scoping the native-shell idea from the Phase 1 backlog: I checked Apple's actual critical-alerts entitlement history. Developers building alarm-clock and sleep-tracking apps have applied for the entitlement — the one that lets a notification sound override silent mode/Do Not Disturb — and been explicitly rejected, told "this API is not designed for the use you've identified." Apple reserves it for health-emergency and safety use cases (medication alerts, security systems), not personal wake-up alarms, however good the reason. This isn't a solvable engineering problem; it's a policy wall.

**What a Capacitor native wrap DOES legitimately buy us**, if we go that route later:
- **Android**: real `AlarmManager` exact alarms with full-screen intents — this genuinely works and is not gated the way iOS is.
- **iOS**: `.timeSensitive` interruption level (better delivery priority than default, but still respects silent mode) and a locally-scheduled notification with a custom sound — an improvement over web push, not a guarantee.

**Decision for Phase 2: do not build the native shell yet.** It's a real chunk of engineering (App Store account, TestFlight, review process, two more build targets) for an asymmetric payoff — Android gets meaningfully better, iOS barely moves. Phase 2 spends that budget on physiology and adaptive coaching instead, where the payoff is symmetric across platforms and grounded in better science, not blocked by platform policy. Revisit native shell as Phase 3 only if Android-specific reliability becomes the actual bottleneck in practice.

---

## 1. Physiological Readiness System

### 1.1 Why
Phase 1 treats every morning identically: same window, same threshold. Real bodies don't work that way — sleep debt, prior-day training load, and individual chronotype all change how "ready" 5AM actually is on a given day. A high-end version of this app should know the difference between "you're groggy, that's normal sleep inertia, go" and "you're genuinely under-recovered, and running through it is how the old thigh strain comes back."

### 1.2 Chronotype assessment (onboarding addition)
Add a short, validated-in-spirit questionnaire at onboarding — a condensed Morningness-Eveningness style set (5–7 questions: preferred bedtime with no obligations, alertness peak time, how hard mornings generally feel, etc.). Output: a chronotype score (definite morning type → definite evening type) stored in Settings. This is informational, not gatekeeping — the app doesn't refuse evening-types, but it calibrates expectations: an evening-type user gets a longer, more clearly-flagged adaptation runway in Content Engine copy (Stage 1 extended, more sleep-hygiene-heavy messaging) rather than being told they're failing at the same pace a morning-type would clear.

### 1.3 Sleep debt estimation
Two tiers, build the first, design for the second:
- **Tier A (build now): self-report.** One-tap sleep quality/duration log the night before or on wake ("how many hours, roughly" + 1-5 quality). Rolling 7-day average computed locally. Feeds the readiness score (1.5) and the Content Engine.
- **Tier B (design the integration point, build if HealthKit/Google Fit access proves smooth): device sleep data.** If the user's phone already tracks sleep (Apple Health / Google Fit / Sleep API), read it directly instead of prompting. Build the data-layer abstraction (`SleepSource` interface with a `manual` implementation now and a `healthkit`/`googlefit` implementation slotted in later) so this doesn't require a schema migration when added.

### 1.4 Readiness score (the actual new feature)
A simple, transparent (not black-box) daily readiness indicator shown on the Check-In screen, computed from:
- 7-day rolling sleep average vs. the user's own baseline (not a generic "8 hours" target — Den's own median)
- Days since last rest day (consecutive running-adjacent training days, including football)
- Self-reported effort/soreness from the last logged run (1-5 scale already in Phase 1's log entry)

Output: **Green / Amber / Red**, never a number Den has to interpret, with one line of plain-language reasoning ("Amber — 3rd day in a row, sleep's been under your average"). Green/Amber never block the check-in — this is not a permission system, it's information. Red adds one extra screen before check-in: an explicit "run anyway / easy version / rest and keep the streak" choice, because the research on ego depletion says removing willpower-dependent decisions helps, and forcing a conscious choice on a red day is the one moment worth spending that friction on.

**Critical design constraint:** the readiness score must never be allowed to become a guilt mechanism ("you're not ready enough"). Copy for Amber/Red is diagnostic and caring, matching the disciplined-coach voice — a good coach tells you when to back off, that's not weakness, it's how the ones who last a decade do it.

---

## 2. Injury-Aware Load Management

### 2.1 Why this matters specifically for Den
Memory context: old posterior thigh strain (hamstring), occasional shoulder tightness, weekly 11-a-side football plus optional midweek pickup, daily calisthenics, PPL gym split, and now daily running on top. That's a lot of concurrent load on the posterior chain in particular. A high-end app in this domain should actively manage that risk, not just track completion.

### 2.2 Acute:Chronic Workload Ratio (ACWR)
This is the best-established framework in sports science for training-related injury risk (Gabbett and others). Core idea: injury risk rises sharply when a short-term ("acute," ~7-day) training load spikes well above the longer-term ("chronic," ~28-day) average the body has adapted to — the ratio between them is the signal, not either number alone.

**Implementation:**
- Extend `RunLog` with a lightweight load proxy: duration × self-reported effort (a simple session-RPE style load, no wearable required — this is the same method used in real applied sports science when GPS/heart-rate data isn't available).
- Compute rolling acute (7-day) and chronic (28-day) load averages.
- Surface the ratio only when it moves into a flagged zone (commonly cited moderate-elevated-risk range is roughly 1.5+), as a single Content Engine-style message, not a chart Den has to interpret: "Your load's climbed fast the last week — this is the exact pattern that precedes soft-tissue strains. Consider an easy day."
- This is advisory only. Never blocks check-in. The point is surfacing a real, well-evidenced signal at the moment it's actionable, not building a compliance gate.

### 2.3 Posterior-chain-specific safeguards
- Onboarding captures the hamstring strain history (already known from memory, confirm/reconfirm it explicitly in-app so it's in the data model, not just Claude's memory).
- Content Engine gets a new message category, `injury-aware`, weighted higher when ACWR flags amber/red or when football (self-logged as a separate light-touch entry — one tap "played football today") coincides with a running day: dynamic-warmup and hamstring-specific prep reminders, framed as performance-protective, not fear-based.
- A monthly (not daily — avoid nagging) "load review" surfaced on the Stats screen: plain-language summary of the last 4 weeks' pattern, flagging if football + running + gym has been stacking without an easy day.

---

## 3. Adaptive Content Engine v2

### 3.1 Why v1 isn't enough for "high-end"
Phase 1's rotation is stage-and-category-weighted but static — every user in Stage 2 sees the same pool. A genuinely high-end version learns which categories of message actually correlate with Den completing the run, and shifts weight toward what works for him specifically, while still respecting the recovery-override and no-repeat rules as hard constraints (personalization should never override the two evidence-backed guardrails from Phase 1).

### 3.2 Lightweight contextual bandit
Not a full ML pipeline — a simple, explainable epsilon-greedy bandit is the right tool here (over-engineering this would be a bad trade):
- Track, per `category`, a rolling completion rate for the day(s) following exposure to that category.
- 85% of the time, sample weighted toward higher-performing categories within the eligible pool (stage/slot/recovery rules still apply first). 15% of the time, sample uniformly at random to keep exploring (this is the standard epsilon-greedy exploration/exploitation balance — necessary so the system doesn't lock onto a false-positive early read from a small sample).
- Recompute weights weekly, not per-message — avoid twitchy, over-fit behavior from a small sample size (Den generates ~1-2 data points a day; don't let the algorithm chase noise).
- Surface this transparently in Settings: "Messages that reference your streak seem to land best for you lately" — no hidden manipulation, this is a tool Den can see into.

### 3.3 Dynamic, LLM-generated messages (the actual high-end upgrade)
Phase 1's 20-message bank is finite and will feel repetitive within a couple of months even with the no-repeat window. Phase 2 adds a generative layer using the Anthropic API directly from the app (per the in-artifact Claude API pattern) to write *new* messages in the same voice, grounded in Den's actual recent data:

- Weekly, generate 5-10 new candidate messages per slot via a Claude API call, using a system prompt that encodes: the disciplined-coach voice rules from the Phase 1 design system, the evidence base from `docs/5am-run-club-research.md` (pass the file's key findings in-context so generated messages stay evidence-grounded, not generic-motivational), and Den's actual recent stats (current streak, readiness trend, any recent miss) so messages can reference real specifics ("Day 34, and Tuesday's readiness dip didn't take you down — that's the system working").
- New messages get tagged (slot/stage/category) by the same API call — ask Claude to self-tag using the taxonomy, then human-review isn't required but a lightweight `pendingReview: boolean` flag lets Den spot-check the first batch before they enter rotation.
- Fold approved messages into the same `Message` table and the same bandit/rotation logic from §3.2 — the generative layer feeds the pool, it doesn't replace the rotation system.
- **Guardrail:** never let generated content invent unsupported claims. System prompt must explicitly instruct: stay within the evidence summarized in the research file, flag uncertainty rather than fabricate a statistic, and never promise performance outcomes (per Phase 1's rule against overselling morning performance gains).

---

## 4. Commitment & Accountability Layer

### 4.1 Optional, not default
Everything in this section is opt-in via Settings, off by default — Phase 1's core loop (streak + verification + content) stays the primary mechanism. This section exists because Phase 1 research (Milkman et al., temptation bundling; commitment contracts) shows stakes and social accountability meaningfully extend adherence *once the habit is already partially formed* — this is a Stage-2/3 feature, not a Stage-1 one, and the app should not offer it until the user has real streak data (e.g., not until Day 21+).

### 4.2 Temptation bundling
Simple implementation: a "run-only" field in Settings where Den names one thing he only allows himself during the run (a specific podcast, an audiobook, a playlist) — the app doesn't need to control access to it, just displays it as a locked-in reminder at check-in ("Today's run-only: [X]"). Research-grounded, minimal engineering.

### 4.3 Commitment stakes (build if requested, not by default)
A simple pre-commitment mechanic: Den sets a personally meaningful consequence for a miss (a symbolic amount to a cause he doesn't like, a text sent to someone he respects, etc.) — the app's job is only to track the commitment and prompt the follow-through honestly, not to automate payment (that's a Stripe integration and a trust/liability question outside a personal habit app's scope — flag this as a manual honor-system feature, not automated).

### 4.4 Fresh-start re-engagement
If the app detects a dormant streak (3+ consecutive missed days with no check-in), the next open of the app on a temporal landmark (Monday, 1st of the month, or the user's actual next login) triggers a distinct re-engagement message pulled specifically from research on the Fresh Start Effect — different tone from the daily recovery-override message, explicitly reframing the new period as a clean start rather than a continuation of a broken streak.

---

## 5. Insight & Analytics (Stats v2)

Build a proper trends view — still restrained, not a BI dashboard:
- 90-day completion rate trend line
- Readiness score history alongside completion (does Red-day running predict a miss two days later? — surfaces real signal if it exists)
- ACWR trend (§2.2)
- Message-category performance (§3.2), shown plainly
- Correlation surfacing is descriptive only — the app states patterns it finds, never prescribes beyond what the Content Engine already handles

---

## 6. Data Architecture Additions

```
Settings (extended) {
  ...existing Phase 1 fields
  chronotypeScore: number          // from onboarding questionnaire
  hamstringHistoryConfirmed: boolean
  runOnlyReward?: string           // temptation bundling
  commitmentStake?: string         // optional, honor-system only
}

SleepEntry {
  id: auto
  date: string
  hoursSlept: number
  quality: 1-5
  source: 'manual' | 'healthkit' | 'googlefit'
}

LoadEntry {
  id: auto
  date: string
  durationMin: number
  effort: 1-5              // reuse existing RunLog effort field where possible
  footballPlayed: boolean  // one-tap separate log
  sessionLoad: number      // duration × effort
}

ReadinessScore {
  date: string
  level: 'green' | 'amber' | 'red'
  reasoning: string        // human-readable, generated at compute time
}

MessagePerformance {
  category: string
  slot: 'night' | 'morning'
  rollingCompletionRate: number
  lastRecomputed: string
}

GeneratedMessage (extends Message) {
  ...Message fields
  pendingReview: boolean
  generatedAt: string
  sourcePrompt: string      // stored for auditability
}
```

---

## 7. Design System — Phase 2 Additions

No departure from Phase 1's palette/typography/voice — extend, don't redesign:
- Readiness indicator: three small, muted dots/states (not traffic-light-bright — keep them in-palette: the existing tactical green, the amber accent already used sparingly, and the sober red-brown from the miss state), positioned quietly near the streak, never dominating it.
- Load/ACWR flags render as Content Engine-style cards, identical visual treatment to existing night/morning messages — no new UI pattern needed, reuse what exists.
- Trends view (Stats v2): simple line/area charts in the existing dark palette, amber accent for the primary series only, no more than one chart visible without scrolling — avoid dashboard overwhelm.

---

## 8. Explicitly Out of Scope for Phase 2

- Native Capacitor shell (§0 — revisit as Phase 3 only if Android reliability becomes the actual blocker)
- Automated payment/stakes processing (§4.3 — stays honor-system)
- Social features beyond the single optional accountability contact in §4.3
- Any wearable-specific integration beyond the `SleepSource` abstraction interface (§1.3) — build the interface, don't build a Garmin/Whoop integration yet
- Weather integration
- Multi-user/family features

---

## 9. Build Order

1. Extend Dexie schema per §6 — additive migration, must not break existing Phase 1 data.
2. Chronotype questionnaire — add as a post-onboarding optional screen for existing users, mandatory step for new users.
3. Sleep entry (manual tier) + rolling average calc + `SleepSource` interface (build manual implementation, stub the interface for future HealthKit/Google Fit).
4. Readiness score computation (§1.4) — surface on Check-In screen, build the Red-day extra-screen flow.
5. Load tracking (§2.2) — extend RunLog, add football one-tap log, implement ACWR calculation, wire the advisory flag into Content Engine as a new `injury-aware` category.
6. Bandit-weighted rotation (§3.2) — implement on top of existing Phase 1 rotation logic, preserving recovery-override and no-repeat as hard constraints that run before bandit weighting.
7. Generative message pipeline (§3.3) — weekly Claude API call, self-tagging, `pendingReview` flag, Settings screen to review pending messages before approval.
8. Commitment/accountability layer (§4) — build as Settings-gated, off by default, unlocked only after Day 21.
9. Stats v2 (§5) — trends view.
10. Design polish per §7 — integrate into existing visual system, no new patterns.

## 10. Guardrails for Claude Code

- This is an extension of a live, working app — do not refactor Phase 1 systems that already work (verification, streak logic, immutable history, night-lock) unless a specific Phase 2 feature requires it.
- Every new "smart" feature (readiness, ACWR, bandit, generative messages) must be advisory and transparent — nothing in Phase 2 should silently gate the check-in or hide its reasoning from Den.
- The generative message pipeline must be evidence-constrained per §3.3's guardrail — this is the one feature with real risk of drifting off-brand or overpromising if built loosely.
- Confirm scope before building anything in §8 (explicitly out of scope) even if it seems like a natural extension mid-build.
