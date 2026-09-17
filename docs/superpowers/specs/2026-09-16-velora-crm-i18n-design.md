# Velora CRM i18n design

## Goal

Complete and connect the CRM interface translations for `en`, `ru`, `sq`, `bg`,
`hr`, `cs`, `da`, `fi`, `fr`, `de`, `el`, `hu`, `it`, `no`, `pl`, `pt`, `ro`,
`sr`, `es`, `sv`, `tr`, and `uk`. English is the fallback. The CRM scope
includes all twenty frontend namespaces and server-provided business terms, but
excludes miniapp and externally sent messages.

## Current state

The English source contains 20 namespaces and 3,907 leaf values. The locale
inventory has 257 of the required 440 language/namespace files: `en`, `ru`,
`cs`, `de`, and `uk` are structurally complete; `es`, `fr`, `it`, and `pt`
have 10 files; each remaining language has 9. The existing verifier skips
missing files and returns success despite detected discrepancies.

## Architecture

`front/scripts/i18n` remains the source-to-TSV-to-JSON workflow. Its verifier
becomes strict: it inventories every required locale file, parses JSON with
duplicate-key detection, compares source and target trees, checks meaningful
strings, interpolation tokens, React-i18next tag balance, and language-specific
plural forms, and exits non-zero for any violation. Validator fixtures cover a
valid locale and the required failure modes.

Translations are completed namespace by namespace from English structure, with
Russian and consuming UI components used for meaning. `work/i18n/` contains the
coverage matrix, terminology glossary, batch TSVs, and a journal recording the
completed, verified batch and its next step. Existing correct translations are
preserved and only repaired where validation or context demonstrates a defect.

The frontend owns `LANGUAGES` and exposes only locales whose mandatory
namespaces validate. It keeps current manual-choice semantics: first paint is a
saved explicit choice or English; country detection is asynchronous; manual
choice always wins; Russian is never selected from IP.

The backend introduces a UI-only locale resolver for `/auth/locale` and
geolocation. It recognizes all 22 CRM languages without changing
`services/i18n.LANGS`, which deliberately remains the five-language set for
email, WhatsApp, Telegram, CSV, and miniapp-related text. Existing terminology
files already cover the 22 interface locales and remain the source for dynamic
business nouns.

## Verification

The final state must have exactly 440 locale files and no verification errors.
Run the frontend language/resource/i18n checks, build, lint, and applicable
UI-map/AI checks; run backend geo and i18n-coverage tests in the safe test
environment. Test IP mappings and manual-choice race behavior automatically.
Browser checks, when available, cover landing, sign-in, journal, clients,
settings, billing, and a modal in long Latin, Cyrillic, and Greek locales.

## Constraints

- Do not commit, push, deploy, change product behavior, or alter user data.
- Never represent fallback English as a finished translation.
- Preserve technical identifiers, URLs, interpolation tokens, plural grammar,
  React-i18next tags, and `$t(...)` links.
- Do not expand outgoing-message or miniapp translations beyond their existing
  five-language contract.
