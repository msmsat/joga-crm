# Velora CRM i18n journal

## 2026-09-16 — baseline and strict validator

- Preserved a clean user worktree; no commit, push, deploy, schema migration,
  user-data change, miniapp translation, or outbound-message translation.
- English source inventory: 20 namespaces and 3,909 leaf values. Two source
  keys required by existing localized content/dynamic UI lookup were restored:
  `onboarding.activity.comingSoon` and `billing.period.24`.
- File inventory: 257/440 locale files exist and all 257 now pass strict
  validation. The remaining 183 errors are exclusively missing files.
- Implemented fail-closed validation and regression tests for missing files and
  language directories, malformed/duplicate JSON, scalar/object/array shape,
  empty values, placeholders, numbered tags, and language plural forms. The
  validator test suite currently passes 9/9.
- Existing `en`, `ru`, `cs`, `de`, and `uk` are structurally complete and
  strictly valid. Removed obsolete extra plan-card keys from `cs`, `de`, and
  `uk`; added current AI status copy for those locales.
- All existing 9/10-file locales already had a translated onboarding status;
  adding the missing English source key made those files valid without
  overwriting their translations.

### Next concrete step

Create the first missing namespace batch (`cookies`) for the 17 incomplete
languages through the TSV build pipeline, then validate it before proceeding.

## 2026-09-16 — cookies batch

- Built `cookies.json` for sq, bg, hr, da, fi, fr, el, hu, it, no, pl, pt, ro,
  sr, es, sv, and tr from `cookies-2026-09-16.tsv`.
- Result: 274/440 files present and verified; the remaining 166 strict errors
  are all missing namespace files, with no malformed, placeholder, tag, or
  plural-form errors in existing files.

### Next concrete step

Complete `landing` for the same 17 locales, using its consuming components to
disambiguate pricing, sign-in, and consent copy before building each batch.

## 2026-09-16 — landing / French batch

- Built and strictly verified the 230-key French `landing.json` from
  `landing-fr-2026-09-16.tsv`; source line-break markers, Markdown emphasis,
  plural keys, monetary placeholders, and dynamic link tokens are preserved.
- The Windows UTF-8 export regression is covered by the validator suite; TSV
  output now supports the source’s `×`, en dash, and non-ASCII punctuation.

### Next concrete step

Complete the Spanish and Italian `landing` locale blocks, then validate the
full namespace before proceeding to the remaining language groups.

## 2026-09-16 — landing / Spanish batch

- Built and strictly verified the 230-key Spanish `landing.json` from
  `landing-es-2026-09-16.tsv`.

### Next concrete step

Complete and validate Italian `landing`, then continue with Portuguese and the
remaining fourteen missing landing locales.

## 2026-09-16 — landing / Italian batch

- Built and strictly verified the 230-key Italian `landing.json` from
  `landing-it-2026-09-16.tsv`.

### Next concrete step

Complete and validate Portuguese `landing`, then continue with the remaining
thirteen missing landing locales.

## 2026-09-16 — landing / Portuguese batch

- Built and strictly verified the 230-key Portuguese `landing.json` from
  `landing-pt-2026-09-16.tsv`.

### Next concrete step

Complete the remaining thirteen missing landing locales in fully validated
language batches before starting the next namespace.

## 2026-09-16 — landing / Danish batch

- Built and strictly verified the 230-key Danish `landing.json` from
  `landing-da-2026-09-16.tsv`.

### Next concrete step

Complete the remaining twelve missing landing locales in fully validated
language batches before starting the next namespace.

## 2026-09-16 — landing / Finnish batch

- Built and strictly verified the 230-key Finnish `landing.json` from
  `landing-fi-2026-09-16.tsv`.

### Next concrete step

Complete the remaining eleven missing landing locales in fully validated
language batches before starting the next namespace.

## 2026-09-16 — landing / Swedish batch

- Built and strictly verified the 230-key Swedish `landing.json` from
  `landing-sv-2026-09-16.tsv`.

### Next concrete step

Complete the remaining ten missing landing locales in fully validated
language batches before starting the next namespace.

### Follow-up tracked

- The English FAQ now correctly states 22 supported interface languages. Update
  this answer naturally in every completed and future landing locale before the
  final strict validation.

## 2026-09-17 — landing / Turkish batch

- Built and strictly verified the 230-key Turkish `landing.json` from
  `landing-tr-2026-09-16.tsv`.

### Next concrete step

Complete the remaining nine missing landing locales in fully validated language
batches before starting the next namespace.

## 2026-09-17 — landing / Bulgarian batch

- Built and strictly verified the 230-key Bulgarian `landing.json` from
  `landing-bg-2026-09-17.tsv`.

### Next concrete step

Complete the remaining eight missing landing locales in fully validated language
batches before starting the next namespace.

## 2026-09-17 — landing / Greek batch

- Built and strictly verified the 230-key Greek `landing.json` from
  `landing-el-2026-09-17.tsv`.
- Whole-repository strict check after this batch: 156 required locale files
  remain absent; all existing locale files have zero non-missing validation
  errors.
- Added and tested the inactive `back/services/ui_locale.py` foundation for all
  22 CRM-interface locales. It intentionally leaves the five-language outbound
  `services.i18n` contract untouched; route and country-map integration wait
  until the required dictionaries are complete.

### Next concrete step

Complete the remaining seven missing landing locales in fully validated language
batches before starting the next namespace.

## 2026-09-17 — landing / Norwegian batch

- Built and strictly verified the 230-key Norwegian `landing.json` from
  `landing-no-2026-09-17.tsv`.
- Whole-repository strict check: 155 required locale files remain absent; zero
  non-missing validation errors exist in the current locale set.

### Next concrete step

Complete the remaining six missing landing locales in fully validated language
batches before starting the next namespace.

## 2026-09-17 — landing / Serbian batch

- Built and strictly verified the Serbian Cyrillic `landing.json` from
  `landing-sr-2026-09-17.tsv` (232 plural-aware leaf values).

### Next concrete step

Complete the remaining five missing landing locales in fully validated language
batches before starting the next namespace.

## 2026-09-17 — landing / Polish batch

- Built and strictly verified the 232-value Polish `landing.json` from
  `landing-pl-2026-09-17.tsv`, including Polish plural categories.

### Next concrete step

Complete the remaining four missing landing locales in fully validated language
batches before starting the next namespace.

## 2026-09-17 — landing / Romanian batch

- Built and strictly verified the 232-value Romanian `landing.json` from
  `landing-ro-2026-09-17.tsv`, including Romanian plural categories.

### Next concrete step

Complete the remaining three missing landing locales in fully validated language
batches before starting the next namespace.

## 2026-09-17 — landing / Croatian batch

- Built and strictly verified the 232-value Croatian `landing.json` from
  `landing-hr-2026-09-17.tsv`, including Croatian plural categories.

### Next concrete step

Complete the remaining two missing landing locales in fully validated language
batches before starting the next namespace.

## 2026-09-17 — landing / Hungarian batch

- Built and strictly verified the 230-key Hungarian `landing.json` from
  `landing-hu-2026-09-17.tsv`.

### Next concrete step

Complete the final missing Albanian landing locale in a fully validated batch.

## 2026-09-17 — landing / Albanian batch

- Built and strictly verified the 230-key Albanian `landing.json` from
  `landing-sq-2026-09-17.tsv`.
- `landing` now has all 22 required locales. Updated the prior ten legacy FAQ
  translations so they describe the actual 22-language interface rather than
  the obsolete five-language list.
- Full strict checkpoint: 149 required files remain absent; zero non-missing
  errors exist in the current locale set.

### Next concrete step

Run a full strict validation checkpoint, then continue the next required
namespace (`catalog`) across its incomplete languages.

## 2026-09-17 — catalog / French batch

- Built and strictly verified the 245-key French `catalog.json` from
  `catalog-fr-2026-09-17.tsv`.

### Next concrete step

Complete `catalog` for the remaining incomplete locales in fully validated
language batches.

## 2026-09-17 — catalog / Spanish batch

- Built and strictly verified the 245-key Spanish `catalog.json` from
  `catalog-es-2026-09-17.tsv`.

## 2026-09-17 — catalog / Italian batch

- Built and strictly verified the 245-key Italian `catalog.json` from
  `catalog-it-2026-09-17.tsv`.

## 2026-09-17 — catalog / Portuguese batch

- Built and strictly verified the 245-key Portuguese `catalog.json` from
  `catalog-pt-2026-09-17.tsv`.

## 2026-09-17 — catalog / Danish batch

- Built and strictly verified the 245-key Danish `catalog.json` from
  `catalog-da-2026-09-17.tsv`.

## 2026-09-17 — catalog / Finnish batch

- Built and strictly verified the 245-key Finnish `catalog.json` from
  `catalog-fi-2026-09-17.tsv`.

## 2026-09-17 — catalog / Norwegian batch

- Built and strictly verified the 245-key Norwegian `catalog.json` from
  `catalog-no-2026-09-17.tsv`.

## 2026-09-17 — catalog / Swedish batch

- Built and strictly verified the 245-key Swedish `catalog.json` from
  `catalog-sv-2026-09-17.tsv`.

## 2026-09-17 — catalog / Turkish batch

- Built and strictly verified the 245-key Turkish `catalog.json` from
  `catalog-tr-2026-09-17.tsv`.

## 2026-09-17 — catalog / Polish batch

- Built and strictly verified the 248-value Polish `catalog.json` from
  `catalog-pl-2026-09-17.tsv`, including Polish plural categories.

## 2026-09-17 — catalog / Romanian batch

- Built and strictly verified the 248-value Romanian `catalog.json` from
  `catalog-ro-2026-09-17.tsv`, including Romanian plural categories.

## 2026-09-17 — catalog / Croatian batch

- Built and strictly verified the 248-value Croatian `catalog.json` from
  `catalog-hr-2026-09-17.tsv`, including Croatian plural categories.

## 2026-09-17 — catalog / Hungarian batch

- Built and strictly verified the 245-key Hungarian `catalog.json` from
  `catalog-hu-2026-09-17.tsv`.

## 2026-09-17 — catalog / Greek batch

- Built and strictly verified the 245-key Greek `catalog.json` from
  `catalog-el-2026-09-17.tsv`.

## 2026-09-17 — catalog / Bulgarian batch

- Built and strictly verified the 245-key Bulgarian `catalog.json` from
  `catalog-bg-2026-09-17.tsv`.

## 2026-09-17 — catalog / Serbian batch

- Built and strictly verified the 248-value Serbian Cyrillic `catalog.json`
  from `catalog-sr-2026-09-17.tsv`, including Serbian plural categories.

## 2026-09-17 — catalog / Albanian batch

- Built and strictly verified the 245-key Albanian `catalog.json` from
  `catalog-sq-2026-09-17.tsv`.

### Next concrete step

Run a full strict validation checkpoint, then continue the next required
missing namespace (`clients`) across incomplete UI languages.

## 2026-09-17 — clients / French batch

- Built and strictly verified the 309-value French `clients.json` from
  `clients-fr-2026-09-17.tsv`, including all French plural forms.
