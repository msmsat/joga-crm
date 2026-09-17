# Velora CRM i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver complete, strict, and connected CRM interface localization for all 22 supported languages.

**Architecture:** Keep the established JSON/TSV pipeline, but make its validation fail closed. Keep CRM language recognition separate from the five-language contract for outbound content, so account locale resolution can support all UI locales without changing emails, WhatsApp, Telegram, CSV, or miniapp behavior.

**Tech Stack:** React 19, TypeScript, i18next/react-i18next, Vite, Python 3, FastAPI, Pydantic, pytest, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-16-velora-crm-i18n-design.md`

## Global Constraints

- English (`en`) is the first and fallback language; Russian is manual-selection only, never an IP default.
- Preserve the existing explicit-selection, account-selection, IP-detection, and late-response race semantics.
- A finished CRM locale has all 20 namespaces and passes strict validation without fallback.
- Preserve every interpolation identifier, React-i18next tag/link, URL, API field, and language-appropriate plural category.
- Do not alter `back/services/i18n.LANGS`: external messages and miniapp stay on their existing five-language contract.
- Preserve unrelated changes; do not commit, push, deploy, or modify user data.

---

### Task 1: Make the locale verifier fail closed

**Files:**
- Modify: `front/scripts/i18n/lib.py`, `front/scripts/i18n/verify.py`
- Create: `front/scripts/i18n/test_verify.py`

**Interfaces:**
- Produces `lib.load(path)` with duplicate-key rejection and `lib.check(lang, ns, flat)` diagnostics.
- Produces verifier exit code `1` when any locale is missing or invalid.

- [ ] **Step 1: Add failing isolated fixtures** for a missing file, malformed JSON, duplicate key, changed placeholder, unbalanced tag, empty value, wrong node shape, and missing plural category; include one complete valid Czech locale fixture.
- [ ] **Step 2: Run `python -m unittest scripts.i18n.test_verify -v`** and record the expected failures caused by current skipped files and permissive parsing.
- [ ] **Step 3: Implement strict parsing and validation.** Use `json.load(..., object_pairs_hook=...)` to reject duplicate keys; recursively compare mapping/list/scalar shape against English; use an explicit stack for numbered tags; compare normalized interpolation token multisets; reject target empty strings when source is non-empty; require language categories from `PLURAL_FORMS` unless the bare catch-all key exists.
- [ ] **Step 4: Update `verify.py`.** Enumerate every directory language and every English namespace, report a missing path as an error, catch parse/validation errors, and `raise SystemExit(1)` when errors exist.
- [ ] **Step 5: Run the validator unit suite and `npm run check:i18n`.** The unit suite must pass; the repository check is expected to fail until translation tasks complete.

### Task 2: Create auditable i18n working records

**Files:**
- Create: `work/i18n/coverage.tsv`, `work/i18n/glossary.md`, `work/i18n/journal.md`
- Create as needed: `work/i18n/<namespace>-<batch>.tsv`

**Interfaces:**
- Consumes strict validator output and English namespace inventory.
- Produces a human-readable coverage matrix, agreed terminology, and append-only batch record.

- [ ] **Step 1: Generate `coverage.tsv`** with `language`, the 20 namespace columns, and a final count; mark `complete` only for a verifier-passing file.
- [ ] **Step 2: Write `glossary.md`** with consistent CRM meanings for studio, client, staff member, trainer, class, booking, schedule, membership, space, branch, service, invoice, payment, refund, revenue, visit, cancellation, and waitlist. Distinguish membership from CRM subscription, booking from class, payment invoice from financial account, staff from trainer, and revenue from profit.
- [ ] **Step 3: Write the initial journal entry** with baseline 257/440 coverage, validator status, known language-flow limits, and the next namespace batch.
- [ ] **Step 4: After every build batch**, update the exact file count, validator result, repaired defects, and next concrete namespace without overwriting historical batch notes.

### Task 3: Repair existing complete and partial locale files

**Files:**
- Modify: affected files under `front/src/locales/{ru,cs,de,uk}/` and existing partial locale directories
- Create: `work/i18n/repair-existing.tsv`

**Interfaces:**
- Consumes strict diagnostics and English source files.
- Produces all current files structurally valid before missing namespaces are added.

- [ ] **Step 1: Dump each namespace with current reported defects** using `python scripts/i18n/dump.py ai billing landing onboarding`.
- [ ] **Step 2: Correct the 27 baseline discrepancies** (including `activity.comingSoon`, missing AI tool statuses, billing periods/actions, and landing pricing text) in language blocks, preserving each language's native style.
- [ ] **Step 3: Build each repair TSV** with `python scripts/i18n/build.py <namespace> work/i18n/repair-existing.tsv` and inspect the changed JSON keys.
- [ ] **Step 4: Run `python scripts/i18n/verify.py`** and ensure errors are only missing files, not defects in files that exist.
- [ ] **Step 5: Update coverage and journal.**

### Task 4: Complete common interface, public, and onboarding namespaces

**Files:**
- Create/modify: `front/src/locales/<language>/{common,menu,landing,cookies,join,onboarding}.json`
- Create: `work/i18n/core-public-*.tsv`

**Interfaces:**
- Consumes English flattening order and glossary terms.
- Produces six verified namespaces for every language.

- [ ] **Step 1: Dump each English namespace** and locate ambiguous strings in the landing, join, cookie, and onboarding components before translating.
- [ ] **Step 2: Translate only missing or invalid language blocks**, keeping valid existing content; preserve consent/legal wording, rich tags, links, variables, and zero-width technical identifiers.
- [ ] **Step 3: Build and strictly validate after each namespace.** Run the local validator for every language touched before opening the next namespace.
- [ ] **Step 4: Update coverage and journal with the validated file count.**

### Task 5: Complete primary CRM workflow namespaces

**Files:**
- Create/modify: `front/src/locales/<language>/{dashboard,journal,clients,staff,catalog,booking}.json`
- Create: `work/i18n/core-crm-*.tsv`

**Interfaces:**
- Consumes the glossary and concrete UI use sites for ambiguous action labels.
- Produces translation-complete operational CRM flows.

- [ ] **Step 1: Dump source files and inspect usages** for appointment, attendance, rooms/spaces, staff/trainer, waitlist, and cancellation terms.
- [ ] **Step 2: Translate in namespace batches**, adding language-specific plural forms rather than copying English `_one`/`_other` pairs.
- [ ] **Step 3: Build with the existing TSV tool and run strict verification** after every namespace; repair all token/tag/plural errors immediately.
- [ ] **Step 4: Update coverage and journal.**

### Task 6: Complete settings, profile, notifications, finance, and specialist namespaces

**Files:**
- Create/modify: `front/src/locales/<language>/{settings,profile,notifications,billing,finances,loyalty,reports,ai}.json`
- Create: `work/i18n/secondary-crm-*.tsv`

**Interfaces:**
- Consumes finance terminology and the existing five complete locale files as context.
- Produces all 20 verified namespaces for all 22 languages.

- [ ] **Step 1: Translate settings/profile/notifications first**, retaining UI-only notification copy and excluding sent-message templates.
- [ ] **Step 2: Translate billing, finances, loyalty, reports, and AI**, checking subscription versus membership, invoice versus account, payment/refund, income/revenue/profit, and variables such as `{{price}}` and `$t(...)`.
- [ ] **Step 3: Run full strict verification.** Require 440/440 files and zero errors before exposing languages in the selector.
- [ ] **Step 4: Update final coverage and journal for translation completion.**

### Task 7: Connect all completed CRM languages without widening outbound-message scope

**Files:**
- Modify: `front/src/utils/lang.ts`, `front/src/i18n.ts`, `front/scripts/check-language.mjs`, `front/scripts/check-uimap.mjs`, `front/scripts/check-ai-intents.mjs`
- Create/modify: `back/services/ui_locale.py`, `back/routers/auth/locale.py`, `back/services/geo_locale.py`, `back/tests/test_geo_locale.py`

**Interfaces:**
- Produces `UI_LANGS` and `resolve_ui_locale(raw: str | None) -> str` for CRM locale resolution.
- Leaves `services.i18n.LANGS == ('ru', 'en', 'uk', 'cs', 'de')` unchanged.

- [ ] **Step 1: Add failing frontend and backend tests.** Cover a supported French/Polish account locale, unknown locale fallback to English, automatic German, Russian never selected from Russian IP, and a manual choice made while detection is pending.
- [ ] **Step 2: Add all 22 native-language labels to `LANGUAGES`.** English remains first; use ISO `cs` and preserve a compatibility mapping where current CRM persistence can hold legacy `cz`.
- [ ] **Step 3: Implement the UI-only backend resolver** and use it in `/auth/locale` and country lookup validation; preserve outbound `i18n.resolve` untouched.
- [ ] **Step 4: Map only unambiguous countries to finished UI locales.** Do not map Russia automatically; route unknown or ambiguous countries to English.
- [ ] **Step 5: Verify resources and UI map coverage for all 22 locales.** Ensure `import.meta.glob` finds each required namespace and no valid locale silently resolves an English fallback key.
- [ ] **Step 6: Run `npm run check:language`, backend geo tests, and frontend type/build checks.**

### Task 8: Remove remaining in-code CRM copy and perform final verification

**Files:**
- Modify only proven user-facing `front/src/**/*.ts` and `front/src/**/*.tsx` occurrences plus their namespace JSON files
- Modify: `work/i18n/coverage.tsv`, `work/i18n/journal.md`

**Interfaces:**
- Produces no untranslated static CRM copy outside the localization system.

- [ ] **Step 1: Scan TS/TSX user-facing strings.** Classify comments, test fixtures, technical IDs, dynamic user data, and actual displayed text; move only the last category to the correct namespace.
- [ ] **Step 2: Strictly validate all locales** after every move and regenerate UI map labels if UI keys change.
- [ ] **Step 3: Run final checks:** `npm run check:i18n`, `npm run check:language`, `npm run check:auth`, `npm run build`, `npm run lint`, and, when touched, `npm run check:uimap` and `npm run check:ai`; run `pytest tests/test_geo_locale.py tests/test_i18n_coverage.py` from the backend safe test environment.
- [ ] **Step 4: Measure and record build-size change** and resource loading for all 22 languages. Do not optimize loading unless the measured result requires it; retain English fallback and correct switching if optimization is justified.
- [ ] **Step 5: Conduct browser verification when available** on landing, login, journal, clients, settings, billing, and a modal in a long Latin locale, Cyrillic, and Greek; otherwise record the unavailable browser check explicitly.
- [ ] **Step 6: Write the final journal entry** with 440/440 coverage, exact command results, visual-check status, known limitations, and the next concrete action only if a real limitation remains.

## Plan self-review

- Spec coverage: Tasks 1–2 establish strict auditing and records; Tasks 3–6 complete and validate translations; Task 7 connects all languages while preserving the five-language outbound boundary; Task 8 handles source-copy scanning and all final validation.
- Placeholder scan: The plan contains no unspecified implementation or testing steps.
- Type consistency: `UI_LANGS` and `resolve_ui_locale` are introduced only in Task 7 and are not confused with outbound `LANGS`/`resolve`.
