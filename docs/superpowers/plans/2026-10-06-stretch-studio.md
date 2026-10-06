# Stretch Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current session. Do not delegate implementation unless the user selects delegation. Review through superpowers:requesting-code-review after checks.

**Goal:** Configure test studio 17 using its ordinary CRM entities and implement the agreed recurring timetable and subscription rules.

**Architecture:** Extend existing SQLAlchemy models and domain services with opt-in settings. Durable weekly templates and occurrence identities generate ordinary Lesson rows; existing booking, checkout and financial paths remain the source of truth. A preview-first CLI creates the catalogue and binds the owner without fabricating clients or money.

**Tech Stack:** Python, FastAPI, SQLAlchemy async, PostgreSQL, Alembic; React/TypeScript only where existing subscription controls must expose the new state. No new runtime dependencies.

**Spec:** ../specs/2026-10-06-stretch-studio-design.md

## Global Constraints

- Target owner sadomat31@gmail.com, studio_id=17, owner_user_id=6; source studio 16 is read-only.
- Europe/Prague, CZK, uk. All services 60 minutes; group capacity 10, individual capacity 1.
- Public online window 30 days; no fabricated past lessons, clients, payments or attendance.
- Preserve manual cancellations/moves/deletions and protect concurrent generators.
- Trial group price 250 Kč, standard group price 450 Kč, individual price 1000 Kč.
- No copying Stripe credentials or automatic card debits. No Git commit/push without user instruction.
- Preserve unrelated billing/frontend edits currently in the checkout.

## Review Focus

1. A cancelled, moved or deleted occurrence remains consumed by its template, even if the Lesson row is removed.
2. Studio timezone transitions preserve the published wall-clock time; unknown timezone fails before generation.
3. Wrong owner/studio, ambiguous branch and foreign one-name services stop setup without modifying them.
4. Trial discounts and renewal offers cannot leak to individual services or ordinary service sales.
5. Retries, restarts and concurrent generation/freezing/checkout cannot duplicate a lesson, bonus or renewal benefit.

## Task 1: Durable timetable and safe generation

**Files:** Create back/models/recurring_schedule.py, back/services/recurring_schedule.py, back/tests/test_recurring_schedule.py. Modify back/models/__init__.py, back/main.py. Create one additive migration under back/migrations/versions/ using the actual current Alembic head at execution time.

**Interfaces:** `generate_for_studio(db, studio_id: int, *, now: datetime) -> dict` and `run_due_schedules(session_maker, *, now: datetime | None = None) -> list[dict]`. `now` is an aware UTC instant. Ordinary Lesson rows keep studio wall-clock start_time plus tz_iana.

- [ ] Write isolated DB tests for 17 weekly slots, 30-day horizon, two runs, parallel sessions, Prague autumn DST, unknown zone, cancelled/moved/deleted instances, manual conflicts and staff busy blocks. Pin expected recurring identity:

```python
assert occurrence.lesson_id == original_id
assert occurrence.local_date == scheduled_date
assert second_run['created'] == 0
assert moved_lesson.start_time == moved_time
```

- [ ] Run the test module against isolated SQLite fixtures (in-memory) before implementation; module/function-not-found must fail. Never import production .env or use application DATABASE_URL.
- [ ] Add `RecurringLessonTemplate` with studio/teacher/hall/service, weekday, start-minute, duration, capacity, price, start/end dates, enabled flag and stable setup key. Add `RecurringLessonOccurrence` with unique (template_id, local_date), nullable lesson_id with SET NULL, explicit result state. A removed lesson retains the occurrence tombstone.
- [ ] Generate only under `schedule_guard.lock_studio`; reread active templates and existing occurrences after the lock. Check active team membership, service/hall ownership, `assert_within_working_hours` and common interval guards before insertion. A conflict is recorded/reported without changing existing bookings; retryable conflicts can be retried after resolution, tombstones cannot.
- [ ] Build ordinary Lesson rows using template service, trainer and hall; commit per studio. Add a cancellable hourly loop in FastAPI lifespan, using current recurring templates and booking horizon; first startup replenishes without waiting for a new day. No network work under studio lock.
- [ ] Rerun the new tests plus existing lesson time, booking rules and schedule guard tests. Verify migration upgrade/downgrade on a disposable schema and report exact current/new head.

## Task 2: Trial discount restricted to selected services

**Files:** Modify back/models/settings.py, back/services/booking_rules.py, back/services/booking_access.py, back/services/booking_quotes.py, back/routers/booking/miniapp_lessons.py, back/routers/schedule/lessons.py. Extend the additive migration. Create back/tests/test_trial_service_scope.py.

**Interfaces:** `BookingRules.trial_service_ids: tuple[int, ...] | None`; `trial_service_allowed(rules, service_id) -> bool`; preserve existing `trial_applies` eligibility and reservation discount snapshots. Existing settings default None = prior studio-wide behavior.

- [ ] Write tests for scoped service IDs, unrestricted old studios, quote/miniapp/journal consistency, first group 250 Kč, individual 1000 Kč, existing client ineligible, cancelled first booking restoration and subscription priority.

```python
assert trial_service_allowed(scoped_rules, group_id)
assert not trial_service_allowed(scoped_rules, individual_id)
assert quote.final_price == 250
assert individual_quote.final_price == 1000
```

- [ ] Run tests and observe the missing scope check fail.
- [ ] Persist nullable selected service IDs in StudioBookingSettings. Load into BookingRules, keeping None unrestricted and empty list disabled. Apply the same check before offering/applying a trial in coverage, quotes, eligible clients and miniapp per-lesson display; do not globally compute one trial price for both service formats.
- [ ] Rerun trial, booking quote, debt and payment snapshot tests. Verify restricted offer is enforced on the server even when a caller forces first_lesson=true.

## Task 3: Subscription freeze with a bounded extension

**Files:** Modify back/models/loyalty.py, back/models/client.py, back/schemas/loyalty/loyalty.py, back/routers/clients/profiles.py, back/schemas/clients/subscriptions.py, back/main.py. Create back/services/subscription_freeze.py, back/tests/test_subscription_freeze_limits.py. Extend the additive migration. Update front/src/api clients types and the existing freeze control after locating their current paths through rg.

**Interfaces:** `freeze_for_client(db, studio_id, client_id, *, now) -> dict`, `unfreeze_for_client(db, studio_id, client_id, *, now) -> dict`, `resume_due_freezes(session_maker, *, now=None)`. All clock calculations use the confirmed studio timezone and aware UTC instants.

- [ ] Write tests: 14-day maximum per subscription, early resume, second freeze consumes remaining allowance, retry does not extend twice, pending subscription has no artificial active expiry, elapsed automatic resume, disabled/archived client remains disabled, other studios preserve legacy freeze behavior.

```python
assert subscription.freeze_used_days <= 14
assert repeated_resume.expires_at == first_resume.expires_at
assert pending_subscription.starts_at is None
```

- [ ] Run new tests to a meaningful failure.
- [ ] Add opt-in `max_freeze_days` to subscription program config (None = legacy), durable cumulative freeze state per subscription and preserved client state for safe resumption. Route current freeze/unfreeze actions through the helper only when configured; expose freeze deadline/allowance in native subscription responses and controls.
- [ ] Resume elapsed freezes in a cancellable background loop. Under studio/client/subscription locks, extend active expiry once by actual consumed studio-calendar days; no second extension on a retried tick. Never reactivate manually disabled clients. Existing future reservations require an explicit policy check rather than silently deleting paid bookings.
- [ ] Rerun existing freeze gate, subscription charge/queue and wallet tests plus frontend checks if freeze controls changed.

## Task 4: One-day renewal benefit through the common checkout price

**Files:** Create back/services/subscription_renewal.py, back/tests/test_subscription_renewal_day.py. Modify back/models/loyalty.py, back/services/pricing.py, back/routers/clients/subscriptions.py, back/routers/checkout/router.py and the actual Stripe success path using the shared checkout helper. Extend the additive migration.

**Interfaces:** `renewal_candidate(db, studio_id, client_id, package_id, *, now) -> RenewalCandidate | None`. Candidate records the previous subscription ID, local eligible date, percent and target package. `consume_renewal(db, candidate, payment_id)` is part of the successful checkout transaction, not quote creation.

- [ ] Write tests for Prague midnight boundaries, day-before/day-after exclusion, one use per previous package, group/individual package isolation, ordinary service price unchanged, cash/Stripe equal amount, failed/pending payment not consumed, retry webhook and concurrent purchases.

```python
assert same_day_quote.final_price == 1440  # 1600 minus 10%
assert next_day_quote.final_price == 1600
assert ordinary_group_visit.final_price == 450
assert receipt_count_for_previous_subscription == 1
```

- [ ] Run tests and observe unsupported one-day eligibility fail.
- [ ] Add opt-in renewal policy to subscription program config (off for existing studios). Store a unique redemption identity per previous subscription and successful native payment. Reuse existing discount arithmetic and best-discount behavior; apply only when buying a matching subscription product. Do not create a permanent StudioDiscountConfig or a 30-day scenario offer.
- [ ] Preserve previous legacy offer behavior for studios without the new policy. Both cash and Stripe request the same eligible price; only successful payment consumes the benefit. A Stripe checkout created near midnight carries its reviewed price snapshot, while a fresh checkout after midnight has no expired benefit.
- [ ] Rerun subscription sale, checkout pricing, Stripe idempotency and existing loyalty scenario tests.

## Task 5: Preview-first studio setup CLI

**Files:** Create back/scripts/setup_stretch_studio.py, back/services/stretch_setup.py, back/services/stretch_preset.py, back/tests/test_stretch_studio_setup.py. Document commands in docs/STRETCH_STUDIO_SETUP.md. Read approved values from the design; ship the preset in the repository without personal client data or credentials.

**Interfaces:** CLI `python -m scripts.setup_stretch_studio --owner-email sadomat31@gmail.com --studio-id 17 --report /app/uploads/stretch/preview.json` (preview); same command plus `--apply` (writes). The target active owner's identity must match expected owner 6 for this test preset. `plan_setup(db, target, preset) -> dict` and `apply_setup(db, target, preset) -> dict` use stable keys for created entities and return created/reused IDs.

- [ ] Write tests for an empty studio, complete catalogue and timetable, duplicate invocation, wrong owner, wrong studio, ambiguous branches, manual one-name services, packages restricted to service IDs, correct gift totals, no mutation of studio 16, no new clients/payments/attendance, dry-run rollback.

```python
assert result['services'] == 4
assert result['weekly_templates'] == 17
assert group_package.class_count == 9  # 8 paid plus 1 gift
assert all(p.duration_days == 30 for p in individual_packages)
assert len(created_clients) == len(created_payments) == 0
```

- [ ] Run tests to meaningful missing-function failures.
- [ ] Create/reuse a single branch, hall, four services, active owner-to-service associations, service schedule display slots, scoped subscription packages and booking settings. For an ambiguous existing branch or same-name manual object stop with explicit report. Bind templates to trainer 6 and preserve existing row IDs on repetition.
- [ ] Configure CZK/uk/Europe-Prague, 30-day online window, cash allowed on-site through existing payment methods, subscriptions enabled without auto-renewal, trial discount -200 Kč on group service IDs, 14-day freeze policy, one-day renewal 10%. Do not create Stripe credentials or fake a connected gateway. Existing studio/staff hours must be shown in preview before any expansion needed for the agreed 09:00–18:00 timetable.
- [ ] Call the common generation service to create upcoming lessons and include clashes in the report. Apply must revalidate under studio lock, not trust an old preview. Keep unknown address and equipment empty rather than invent them.
- [ ] Verify CLI --help and preview/apply on an isolated database; compare second apply IDs/counts and reference studio snapshot.

## Task 6: Verification and SSH handoff

**Files:** Update docs/STRETCH_STUDIO_SETUP.md and docs/TZ/STATUS.md only in sections owned by this change. No unrelated billing fixes.

- [ ] Run all new tests and relevant existing booking, subscription, pricing, schedule and worker tests using a test-only database. Record command outputs; no claims based on unrun tests.
- [ ] Run backend compile/import validation; run frontend build/lint if controls or types changed. Run git diff --check and review only owned files.
- [ ] Perform read-only code review per requesting-code-review skill. Correct blocking findings before handoff.
- [ ] Write Bash-only SSH instructions: backup first; update code through Git after the user publishes it; rebuild api/worker/web only as needed; inspect Alembic head; preview test studio 17; check owner 6, four services, 17 templates and prices; apply; validate report; inspect journal and online group/individual prices.
- [ ] State explicitly which Stripe steps still require the studio owner's own onboarding and that real studio 16 remains untouched. Do not supply a command that silently applies to the real account.
- [ ] Keep commit/push and actual server apply under the user's control; return exact modified files and verified results.
