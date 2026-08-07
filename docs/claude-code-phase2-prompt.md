# Claude Code Build Prompt — 5AM Run Club Phase 2

*Paste this into Claude Code as the first message of the Phase 2 build session, in the existing repo (working off the branch that shipped Phase 1). Assumes `docs/5am-run-club-phase2-spec.md` is committed first — commit it before starting if it isn't there yet.*

---

You're extending a live, working app — **"5AM Run Club with Denys."** Phase 1 (onboarding, four-state Home, photo check-in, honor mode, night wind-down with required if-then plan, Content Engine rotation, immutable calendar, stats, settings, service worker, icon set) is built and working. **Do not refactor anything that already works** unless a specific task below genuinely requires it.

Full Phase 2 specification: `docs/5am-run-club-phase2-spec.md`. Read it in full, along with `docs/5am-run-club-spec.md` and `docs/5am-run-club-research.md` for Phase 1 context, before writing any code.

## What Phase 2 actually is
Phase 1 proved the habit-tracking loop works. Phase 2 makes the app know things about Den's body and adapt: a physiological readiness signal, injury-aware training load monitoring (Den has a history of hamstring strain and shoulder tightness — this is not hypothetical, it's in his profile), and a Content Engine that learns which coaching actually works for him instead of running a fixed rotation forever.

## Explicitly not in this phase
- No native Capacitor shell / no chasing iOS critical alerts — Apple has a documented pattern of rejecting that entitlement specifically for alarm-clock use cases, this is a policy wall, not an engineering gap. Do not build toward it.
- No automated payment/stakes processing — commitment stakes stay honor-system.
- No wearable integrations beyond a `SleepSource` interface stub.
- No weather, no multi-user, no social features beyond one optional accountability contact.
If a build step seems to drift toward any of the above, stop and confirm before proceeding.

## Build order

1. **Schema migration** — extend the Dexie schema per spec §6 (`SleepEntry`, `LoadEntry`, `ReadinessScore`, `MessagePerformance`, `GeneratedMessage`, extended `Settings`). This must be additive and non-destructive to existing Phase 1 data — write and test the migration path against realistic existing data, not just a fresh install.
2. **Chronotype questionnaire** (spec §1.2) — condensed 5–7 question morningness-eveningness style assessment. New-user onboarding step (mandatory); existing users get it as an optional post-onboarding prompt, not forced.
3. **Sleep tracking, Tier A** (spec §1.3) — manual one-tap sleep hours/quality log, rolling 7-day average. Build the `SleepSource` interface now with only a `manual` implementation — design it so a `healthkit`/`googlefit` implementation can slot in later without touching calling code.
4. **Readiness score** (spec §1.4) — compute Green/Amber/Red from sleep average vs. personal baseline, consecutive training days, and last-logged effort/soreness. Surface on the Check-In screen with one line of plain-language reasoning, never a raw number. Red adds the extra "run anyway / easy version / rest and keep the streak" screen described in spec §1.4 — build this as a genuine three-way choice, not a soft nudge toward one option. This never blocks check-in on Green/Amber.
5. **Load tracking & ACWR** (spec §2.2–2.3) — extend `RunLog`/new `LoadEntry` with a session-RPE-style load proxy (duration × effort), one-tap football logging, rolling 7-day/28-day acute:chronic workload ratio. Surface only as an advisory Content Engine-style card when the ratio moves into the elevated range described in the spec — never a blocking gate. Add the `injury-aware` message category, weighted higher when ACWR flags or football coincides with a running day. Build the monthly (not daily) load-review summary on the Stats screen.
6. **Bandit-weighted rotation** (spec §3.2) — implement epsilon-greedy weighting (85% exploit toward higher-performing categories / 15% explore) on top of the existing Phase 1 rotation logic. The recovery-override and 10-day no-repeat rules from Phase 1 are hard constraints that run BEFORE bandit weighting — the bandit only re-weights within whatever pool those rules already produced. Recompute weights weekly, not per-message. Surface the current weighting transparently in Settings in plain language.
7. **Generative message pipeline** (spec §3.3) — weekly Anthropic API call (per the in-artifact Claude API pattern) generating 5–10 new candidate messages per slot, in the established disciplined-coach voice, grounded in the evidence summarized in `docs/5am-run-club-research.md` and Den's actual recent stats (streak, readiness trend, recent misses) passed in context. Have the same call self-tag output by the existing slot/stage/category taxonomy. New messages land in the `Message`/`GeneratedMessage` table with `pendingReview: true`; build a simple Settings screen for Den to review and approve before they enter rotation. **Guardrail to enforce in the system prompt itself:** no fabricated statistics, no promised performance outcomes, flag uncertainty rather than invent it, stay within the research file's evidence.
8. **Commitment & accountability layer** (spec §4) — build all of it Settings-gated and off by default, and don't surface the option to the user at all until Day 21+ of an active streak (per the spec's rationale that this is a Stage-2/3 mechanism, not a Stage-1 one). Temptation bundling (§4.2) is a simple display field. Commitment stakes (§4.3) are honor-system tracking only — no payment integration. Fresh-start re-engagement (§4.4) triggers on a detected 3+ day dormant streak, at the next temporal landmark or next login, with distinct copy from the daily recovery-override message.
9. **Stats v2** (spec §5) — trends view: 90-day completion rate, readiness history alongside completion, ACWR trend, message-category performance. Descriptive only — the app states patterns, doesn't prescribe beyond what the Content Engine already does. Keep it to one visible chart at a time, no dashboard overload.
10. **Design integration** (spec §7) — extend the existing dark/amber/tactical-green palette and voice; readiness indicator as three small muted dots near the streak, not traffic-light bright; ACWR/load flags reuse the existing Content Engine card pattern rather than inventing a new UI component.

## Non-negotiables
- Every new adaptive/smart feature (readiness, ACWR, bandit weighting, generative messages) is advisory and transparent. Nothing silently gates the check-in flow or hides its reasoning from Den — if you're tempted to make something a blocker, stop and surface it as information instead.
- The generative message pipeline is the highest-risk feature in this phase for going off-brand or overpromising — enforce the evidence-constraint guardrail directly in the system prompt you write for that API call, not just as a hope.
- Confirm scope with me before building anything from the "explicitly not in this phase" list, even if a build step seems to naturally lead there.
- Test the Dexie migration against existing Phase 1 data specifically — don't assume a clean install.
