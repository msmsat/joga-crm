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

## 2026-09-17 — clients / Spanish batch

- Built and strictly verified the 309-value Spanish `clients.json` from
  `clients-es-2026-09-17.tsv`, including all Spanish plural forms.

## 2026-09-17 — clients / Italian batch

- Built and strictly verified the 309-value Italian `clients.json` from
  `clients-it-2026-09-17.tsv`, including all Italian plural forms.

## 2026-09-17 — clients / Portuguese batch

- Built and strictly verified the 309-value Portuguese `clients.json` from
  `clients-pt-2026-09-17.tsv`, including all Portuguese plural forms.

## 2026-09-17 — clients / Danish batch

- Built and strictly verified the 309-value Danish `clients.json` from
  `clients-da-2026-09-17.tsv`, including all Danish plural forms.

## 2026-09-17 — clients / Finnish batch

- Built and strictly verified the 309-value Finnish `clients.json` from
  `clients-fi-2026-09-17.tsv`, including all Finnish plural forms.

## 2026-09-17 — clients / Norwegian batch

- Built and strictly verified the 309-value Norwegian Bokmål `clients.json`
  from `clients-no-2026-09-17.tsv`, including all Norwegian plural forms.

## 2026-09-17 — clients / Swedish batch

- Built and strictly verified the 309-value Swedish `clients.json` from
  `clients-sv-2026-09-17.tsv`, including all Swedish plural forms.

## 2026-09-17 — clients / Albanian batch

- Built and strictly verified the 309-value Albanian `clients.json` from
  `clients-sq-2026-09-17.tsv`, including all Albanian plural forms.

## 2026-09-17 — clients / Bulgarian batch

- Built and strictly verified the 309-value Bulgarian `clients.json` from
  `clients-bg-2026-09-17.tsv`, including all Bulgarian plural forms.

## 2026-09-17 — clients / Croatian batch

- Built and strictly verified the 315-value Croatian `clients.json` from
  `clients-hr-2026-09-17.tsv`, including all Croatian plural forms.

## 2026-09-17 — clients / Greek batch

- Built and strictly verified the 309-value Greek `clients.json` from
  `clients-el-2026-09-17.tsv`, including all Greek plural forms.

## 2026-09-17 — clients / Hungarian batch

- Built and strictly verified the 309-value Hungarian `clients.json` from
  `clients-hu-2026-09-17.tsv`, including all Hungarian plural forms.

## 2026-09-17 — clients / Polish batch

- Built and strictly verified the 315-value Polish `clients.json` from
  `clients-pl-2026-09-17.tsv`, including all Polish plural forms.

## 2026-09-17 — clients / Romanian batch

- Built and strictly verified the 315-value Romanian `clients.json` from
  `clients-ro-2026-09-17.tsv`, including all Romanian plural forms.

## 2026-09-17 — clients / Turkish batch

- Built and strictly verified the 309-value Turkish `clients.json` from
  `clients-tr-2026-09-17.tsv`, including all Turkish plural forms.

## 2026-09-17 — clients / Serbian batch

- Built and strictly verified the 315-value Serbian Cyrillic `clients.json`
  from `clients-sr-2026-09-17.tsv`, including all Serbian plural forms.

### Next concrete step

Run a full strict validation checkpoint, then translate the next missing
namespace (`notifications`) across the languages that do not yet contain it.

## 2026-09-17 — notifications / Albanian batch

- Built and strictly verified the 240-value Albanian `notifications.json`
  from `notifications-sq-2026-09-17.tsv`, including Albanian plural forms.

## 2026-09-17 — notifications / Bulgarian batch

- Built and strictly verified the 240-value Bulgarian `notifications.json`
  from `notifications-bg-2026-09-17.tsv`, including Bulgarian plural forms.

## 2026-09-17 — notifications / Croatian batch

- Built and strictly verified the 247-value Croatian `notifications.json`
  from `notifications-hr-2026-09-17.tsv`, including Croatian plural forms.

## 2026-09-17 — notifications / Danish batch

- Built and strictly verified the 240-value Danish `notifications.json` from
  `notifications-da-2026-09-17.tsv`, including Danish plural forms.

## 2026-09-17 — notifications / Finnish batch

- Built and strictly verified the 240-value Finnish `notifications.json`
  from `notifications-fi-2026-09-17.tsv`, including Finnish plural forms.

## 2026-09-17 — notifications / Norwegian batch

- Built and strictly verified the 240-value Norwegian Bokmål
  `notifications.json` from `notifications-no-2026-09-17.tsv`, including
  Norwegian plural forms.

## 2026-09-17 — notifications / Greek batch

- Built and strictly verified the 240-value Greek `notifications.json` from
  `notifications-el-2026-09-17.tsv`, including Greek plural forms.

## 2026-09-17 — notifications / Hungarian batch

- Built and strictly verified the 240-value Hungarian `notifications.json`
  from `notifications-hu-2026-09-17.tsv`, including Hungarian plural forms.

## 2026-09-17 — notifications / Polish batch

- Built and strictly verified the 247-value Polish `notifications.json` from
  `notifications-pl-2026-09-17.tsv`, including Polish plural forms.

## 2026-09-17 — notifications / Romanian batch

- Built and strictly verified the 247-value Romanian `notifications.json`
  from `notifications-ro-2026-09-17.tsv`, including Romanian plural forms.

## 2026-09-17 — notifications / Serbian batch

- Built and strictly verified the 247-value Serbian Cyrillic
  `notifications.json` from `notifications-sr-2026-09-17.tsv`, including
  Serbian plural forms.

## 2026-09-17 — notifications / Swedish batch

- Built and strictly verified the 240-value Swedish `notifications.json` from
  `notifications-sv-2026-09-17.tsv`, including Swedish plural forms.

## 2026-09-17 — notifications / Turkish batch

- Built and strictly verified the 240-value Turkish `notifications.json` from
  `notifications-tr-2026-09-17.tsv`, including Turkish plural forms.

### Next concrete step

Ran the full strict validation checkpoint: 102 required locale files remain
missing and there are zero non-missing validation errors. Continue the next
required missing namespace (`ai`) across incomplete UI languages, beginning
with Albanian.

## 2026-09-17 — AI / Albanian batch

- Built and strictly verified the 286-value Albanian `ai.json` from
  `ai-sq-2026-09-17.tsv`, including Albanian plural forms.

### Next concrete step

Continue the AI namespace with Bulgarian.

## 2026-09-17 — AI / Bulgarian batch

- Built and strictly verified the 286-value Bulgarian `ai.json` from
  `ai-bg-2026-09-17.tsv`, including Bulgarian plural forms.

### Next concrete step

Continue the AI namespace with Croatian.

## 2026-09-17 — AI / Croatian batch

- Built and strictly verified the 291-value Croatian `ai.json` from
  `ai-hr-2026-09-17.tsv`, including Croatian plural forms.

### Next concrete step

Continue the AI namespace with Danish.

## 2026-09-17 — AI / Danish batch

- Built and strictly verified the 286-value Danish `ai.json` from
  `ai-da-2026-09-17.tsv`, including Danish plural forms.

### Next concrete step

Continue the AI namespace with Finnish.

## 2026-09-17 — AI / Finnish batch

- Built and strictly verified the 286-value Finnish `ai.json` from
  `ai-fi-2026-09-17.tsv`, including Finnish plural forms.

### Next concrete step

Continue the AI namespace with French.

## 2026-09-17 — AI / French batch

- Built and strictly verified the 286-value French `ai.json` from
  `ai-fr-2026-09-17.tsv`, including French plural forms.

### Next concrete step

Continue the AI namespace with Greek.

## 2026-09-17 — AI / Greek batch

- Built and strictly verified the 286-value Greek `ai.json` from
  `ai-el-2026-09-17.tsv`, including Greek plural forms.

### Next concrete step

Continue the AI namespace with Hungarian.

## 2026-09-17 — AI / Hungarian batch

- Built and strictly verified the 286-value Hungarian `ai.json` from
  `ai-hu-2026-09-17.tsv`, including Hungarian plural forms.

### Next concrete step

Continue the AI namespace with Italian.

## 2026-09-17 — AI / Italian batch

- Built and strictly verified the 286-value Italian `ai.json` from
  `ai-it-2026-09-17.tsv`, including Italian plural forms.

### Next concrete step

Continue the AI namespace with Norwegian.

## 2026-09-17 — AI / Norwegian batch

- Built and strictly verified the 286-value Norwegian `ai.json` from
  `ai-no-2026-09-17.tsv`, including Norwegian plural forms.

### Next concrete step

Continue the AI namespace with Polish.

## 2026-09-17 — AI / Polish batch

- Built and strictly verified the 291-value Polish `ai.json` from
  `ai-pl-2026-09-17.tsv`, including Polish plural forms.

### Next concrete step

Continue the AI namespace with Portuguese.

## 2026-09-17 — AI / Portuguese batch

- Built and strictly verified the 286-value Portuguese `ai.json` from
  `ai-pt-2026-09-17.tsv`, including Portuguese plural forms.

### Next concrete step

Continue the AI namespace with Romanian.

## 2026-09-17 — AI / Romanian batch

- Built and strictly verified the 291-value Romanian `ai.json` from
  `ai-ro-2026-09-17.tsv`, including Romanian plural forms.

### Next concrete step

Continue the AI namespace with Serbian.

## 2026-09-17 — AI / Serbian batch

- Built and strictly verified the 291-value Serbian Cyrillic `ai.json` from
  `ai-sr-2026-09-17.tsv`, including Serbian plural forms.

### Next concrete step

Continue the AI namespace with Spanish.

## 2026-09-17 — AI / Spanish batch

- Built and strictly verified the 286-value Spanish `ai.json` from
  `ai-es-2026-09-17.tsv`, including Spanish plural forms.

### Next concrete step

Continue the AI namespace with Swedish.

## 2026-09-17 — AI / Swedish batch

- Built and strictly verified the 286-value Swedish `ai.json` from
  `ai-sv-2026-09-17.tsv`, including Swedish plural forms.

### Next concrete step

Continue the AI namespace with Turkish.

## 2026-09-17 — AI / Turkish batch

- Built and strictly verified the 286-value Turkish `ai.json` from
  `ai-tr-2026-09-17.tsv`, including Turkish plural forms.
- The complete strict validator now reports 85 required files missing and zero
  non-missing errors. The `ai` namespace is complete for all 22 UI languages.

### Next concrete step

Continue the next incomplete namespace (`billing`) across the remaining 17
UI languages.

## 2026-09-17 — billing / Albanian batch

- Built and strictly verified the 293-value Albanian `billing.json` from
  `billing-sq-2026-09-17.tsv`, preserving all placeholders and multi-line
  payment terms.

### Next concrete step

Continue the billing namespace with Bulgarian.

## 2026-09-17 — billing / Bulgarian batch

- Built and strictly verified the 293-value Bulgarian `billing.json` from
  `billing-bg-2026-09-17.tsv`, preserving all placeholders and multi-line
  payment terms.

### Next concrete step

Continue the billing namespace with Croatian.

## 2026-09-17 — billing / Croatian batch

- Built and strictly verified the 295-value Croatian `billing.json` from
  `billing-hr-2026-09-17.tsv`, including Croatian plural forms and preserving
  all placeholders and multi-line payment terms.

### Next concrete step

Continue the billing namespace with Danish.

## 2026-09-17 — billing / Danish batch

- Built and strictly verified the 293-value Danish `billing.json` from
  `billing-da-2026-09-17.tsv`, preserving all placeholders and multi-line
  payment terms.

### Next concrete step

Continue the billing namespace with Finnish.

## 2026-09-17 — billing / Finnish batch

- Built and strictly verified the 293-value Finnish `billing.json` from
  `billing-fi-2026-09-17.tsv`, preserving all placeholders and multi-line
  payment terms.

### Next concrete step

Continue the billing namespace with French.

## 2026-09-17 — billing / French batch

- Built and strictly verified the 293-value French `billing.json` from
  `billing-fr-2026-09-17.tsv`, preserving all placeholders and multi-line
  payment terms.

### Next concrete step

Continue the billing namespace with Greek.

## 2026-09-17 — billing / Greek batch

- Built and strictly verified the 293-value Greek `billing.json` from
  `billing-el-2026-09-17.tsv`, preserving all placeholders and multi-line
  payment terms.

### Next concrete step

Continue the billing namespace with Hungarian.

## 2026-09-17 — billing / Hungarian batch

- Built and strictly verified the 293-value Hungarian `billing.json` from
  `billing-hu-2026-09-17.tsv`, preserving all placeholders and multi-line
  payment terms.

### Next concrete step

Continue the billing namespace with Italian.

## 2026-09-17 — billing / Italian batch

- Built and strictly verified the 293-value Italian `billing.json` from
  `billing-it-2026-09-17.tsv`, preserving all placeholders and multi-line
  payment terms.

### Next concrete step

Continue the billing namespace with Norwegian.

## 2026-09-17 — billing / Norwegian batch

- Built and strictly verified the 293-value Norwegian `billing.json` from
  `billing-no-2026-09-17.tsv`; all keys, placeholders, line breaks, and
  plural forms match the English source.

### Next concrete step

Continue the billing namespace with Polish.

## 2026-09-17 — billing / Polish batch

- Built and strictly verified the 295-value Polish `billing.json` from
  `billing-pl-2026-09-17.tsv`, including the `one`, `few`, and `many`
  plural forms required by Polish.

### Next concrete step

Continue the billing namespace with Portuguese.

## 2026-09-17 — billing / Portuguese batch

- Built and strictly verified the 293-value Portuguese `billing.json` from
  `billing-pt-2026-09-17.tsv`, preserving placeholders and payment terms.

### Next concrete step

Continue the billing namespace with Romanian.

## 2026-09-17 — billing / Romanian batch

- Built and strictly verified the 295-value Romanian `billing.json` from
  `billing-ro-2026-09-17.tsv`, including all Romanian plural forms.

### Next concrete step

Continue the billing namespace with Serbian.

## 2026-09-17 — billing / Serbian batch

- Built and strictly verified the 295-value Cyrillic Serbian `billing.json`
  from `billing-sr-2026-09-17.tsv`, including the required plural forms.

### Next concrete step

Continue the billing namespace with Spanish.

## 2026-09-17 — billing / Spanish batch

- Built and strictly verified the 293-value Spanish `billing.json` from
  `billing-es-2026-09-17.tsv`, including every placeholder and newline.

### Next concrete step

Continue the billing namespace with Swedish.

## 2026-09-17 — billing / Swedish batch

- Built and strictly verified the 293-value Swedish `billing.json` from
  `billing-sv-2026-09-17.tsv`, preserving every placeholder and newline.

### Next concrete step

Continue the billing namespace with Turkish.

## 2026-09-17 — billing / Turkish batch

- Built and strictly verified the 293-value Turkish `billing.json` from
  `billing-tr-2026-09-17.tsv`, preserving all placeholders and line breaks.

### Next concrete step

Begin the remaining `finances` namespace batches.

## 2026-09-17 — finances / Albanian batch

- Built and strictly verified the 376-value Albanian `finances.json` from
  `finances-sq-2026-09-17.tsv`, including every structured payment and
  reporting key.

### Next concrete step

Continue the `finances` namespace with Bulgarian.

## 2026-09-17 — finances / Bulgarian batch

- Built and strictly verified the 376-value Bulgarian `finances.json` from
  `finances-bg-2026-09-17.tsv`, including every structured payment and
  reporting key.

### Next concrete step

Continue the `finances` namespace with Croatian.

## 2026-09-17 — finances / Croatian batch

- Built and strictly verified the 376-value Croatian `finances.json` from
  `finances-hr-2026-09-17.tsv`, including every structured payment and
  reporting key.

### Next concrete step

Continue the `finances` namespace with Danish.

## 2026-09-17 — finances / Danish batch

- Built and strictly verified the 376-value Danish `finances.json` from
  `finances-da-2026-09-17.tsv`, including every structured payment and
  reporting key.

### Next concrete step

Continue the `finances` namespace with Finnish.

## 2026-09-17 — finances / Finnish batch

- Built and strictly verified the 376-value Finnish `finances.json` from
  `finances-fi-2026-09-17.tsv`, including every structured payment and
  reporting key.

### Next concrete step

Continue the `finances` namespace with French.

## 2026-09-17 — finances / French batch

- Built and strictly verified the 376-value French `finances.json` from
  `finances-fr-2026-09-17.tsv`, including every structured payment and
  reporting key.

### Next concrete step

Continue the `finances` namespace with Greek.

## 2026-09-17 — finances / Greek batch

- Built and strictly verified the 376-value Greek `finances.json` from
  `finances-el-2026-09-17.tsv`, including every structured payment and
  reporting key.

### Next concrete step

Continue the `finances` namespace with Hungarian.

## 2026-09-17 — finances / Hungarian batch

- Built and strictly verified the 376-value Hungarian `finances.json` from
  `finances-hu-2026-09-17.tsv`, including every structured payment and
  reporting key.

### Next concrete step

Continue the `finances` namespace with Italian.

## 2026-09-17 — finances / Italian batch

- Built and strictly verified the 376-value Italian `finances.json` from
  `finances-it-2026-09-17.tsv`, including every structured payment and
  reporting key.

### Next concrete step

Continue the `finances` namespace with Norwegian.

## 2026-09-17 — finances / Norwegian batch

- Built and strictly verified the 376-value Norwegian `finances.json` from
  `finances-no-2026-09-17.tsv`, including every structured payment and
  reporting key.

### Next concrete step

Continue the `finances` namespace with Polish.

## 2026-09-17 — finances / Polish batch

- Built and strictly verified the 376-value Polish `finances.json` from
  `finances-pl-2026-09-17.tsv`, including every structured payment and
  reporting key.

### Next concrete step

Continue the `finances` namespace with Portuguese.

## 2026-09-17 — finances / Portuguese batch

- Built and strictly verified the 376-value Portuguese `finances.json` from
  `finances-pt-2026-09-17.tsv`, including every structured payment and
  reporting key.

### Next concrete step

Continue the `finances` namespace with Romanian.

## 2026-09-17 — finances / Romanian batch

- Built and strictly verified the 376-value Romanian `finances.json` from
  `finances-ro-2026-09-17.tsv`, including every structured payment and
  reporting key.

### Next concrete step

Continue the `finances` namespace with Serbian.

## 2026-09-17 — finances / Serbian batch

- Built and strictly verified the 376-value Serbian `finances.json` from
  `finances-sr-2026-09-17.tsv`, including every structured payment and
  reporting key.

### Next concrete step

Continue the `finances` namespace with Spanish.

## 2026-09-17 — finances / Spanish batch

- Built and strictly verified the 376-value Spanish `finances.json` from
  `finances-es-2026-09-17.tsv`, including every structured payment and
  reporting key.

### Next concrete step

Continue the `finances` namespace with Swedish.

## 2026-09-17 — finances / Swedish batch

- Built and strictly verified the 376-value Swedish `finances.json` from
  `finances-sv-2026-09-17.tsv`, including every structured payment and
  reporting key.

### Next concrete step

Continue the `finances` namespace with Turkish.

## 2026-09-17 — finances / Turkish batch

- Built and strictly verified the 376-value Turkish `finances.json` from
  `finances-tr-2026-09-17.tsv`, including every structured payment and
  reporting key.

### Next concrete step

Start the `loyalty` namespace with Albanian.

## 2026-09-18 — loyalty / Albanian batch

- Built and strictly verified the 239-value Albanian `loyalty.json` from
  `loyalty-sq-2026-09-17.tsv`, including programs, automation scenarios,
  audience segments, and retention analytics.

### Next concrete step

Continue the `loyalty` namespace with Bulgarian.

## 2026-09-18 — loyalty / Bulgarian batch

- Built and strictly verified the 239-value Bulgarian `loyalty.json` from
  `loyalty-bg-2026-09-18.tsv`, including programs, automation scenarios,
  audience segments, and retention analytics.

### Next concrete step

Continue the `loyalty` namespace with Croatian.

## 2026-09-18 — loyalty / Croatian batch

- Built and strictly verified the 239-value Croatian `loyalty.json` from
  `loyalty-hr-2026-09-18.tsv`, including programs, automation scenarios,
  audience segments, and retention analytics.

### Next concrete step

Continue the `loyalty` namespace with Danish.

## 2026-09-18 — loyalty / Danish batch

- Built and strictly verified the 239-value Danish `loyalty.json` from
  `loyalty-da-2026-09-18.tsv`, including programs, automation scenarios,
  audience segments, and retention analytics.

### Next concrete step

Continue the `loyalty` namespace with Finnish.

## 2026-09-18 — loyalty / Finnish batch

- Built and strictly verified the 239-value Finnish `loyalty.json` from
  `loyalty-fi-2026-09-18.tsv`, including programs, automation scenarios,
  audience segments, and retention analytics.

### Next concrete step

Continue the `loyalty` namespace with French.

## 2026-09-18 — loyalty / French batch

- Built and strictly verified the 239-value French `loyalty.json` from
  `loyalty-fr-2026-09-18.tsv`, including programs, automation scenarios,
  audience segments, and retention analytics.

### Next concrete step

Continue the `loyalty` namespace with Greek.

## 2026-09-18 — loyalty / Greek batch

- Built and strictly verified the 239-value Greek `loyalty.json` from
  `loyalty-el-2026-09-18.tsv`, including programs, automation scenarios,
  audience segments, and retention analytics.

### Next concrete step

Continue the `loyalty` namespace with Hungarian.

## 2026-09-18 — loyalty / Hungarian batch

- Built and strictly verified the 239-value Hungarian `loyalty.json` from
  `loyalty-hu-2026-09-18.tsv`, including programs, automation scenarios,
  audience segments, and retention analytics.

### Next concrete step

Continue the `loyalty` namespace with Italian.

## 2026-09-18 — loyalty / Italian batch

- Built and strictly verified the 239-value Italian `loyalty.json` from
  `loyalty-it-2026-09-18.tsv`, including programs, automation scenarios,
  audience segments, and retention analytics.

### Next concrete step

Continue the `loyalty` namespace with Norwegian.

## 2026-09-18 — loyalty / Norwegian batch

- Built and strictly verified the 239-value Norwegian `loyalty.json` from
  `loyalty-no-2026-09-18.tsv`, including programs, automation scenarios,
  audience segments, and retention analytics.

### Next concrete step

Continue the `loyalty` namespace with Polish.

## 2026-09-18 — loyalty / Polish batch

- Built and strictly verified the 239-value Polish `loyalty.json` from
  `loyalty-pl-2026-09-18.tsv`, including programs, automation scenarios,
  audience segments, and retention analytics.

### Next concrete step

Continue the `loyalty` namespace with Portuguese.

## 2026-09-18 — loyalty / Portuguese batch

- Built and strictly verified the 239-value Portuguese `loyalty.json` from
  `loyalty-pt-2026-09-18.tsv`, including programs, automation scenarios,
  audience segments, and retention analytics.

### Next concrete step

Continue the `loyalty` namespace with Romanian.

## 2026-09-18 — loyalty / Romanian batch

- Built and strictly verified the 239-value Romanian `loyalty.json` from
  `loyalty-ro-2026-09-18.tsv`, including programs, automation scenarios,
  audience segments, and retention analytics.

### Next concrete step

Continue the `loyalty` namespace with Serbian.

## 2026-09-18 — loyalty / Serbian batch

- Built and strictly verified the 239-value Serbian `loyalty.json` from
  `loyalty-sr-2026-09-18.tsv`, including programs, automation scenarios,
  audience segments, and retention analytics.

### Next concrete step

Continue the `loyalty` namespace with Spanish.

## 2026-09-18 — loyalty / Spanish batch

- Built and strictly verified the 239-value Spanish `loyalty.json` from
  `loyalty-es-2026-09-18.tsv`, including programs, automation scenarios,
  audience segments, and retention analytics.

### Next concrete step

Continue the `loyalty` namespace with Swedish.

## 2026-09-18 — loyalty / Swedish batch

- Built and strictly verified the 239-value Swedish `loyalty.json` from
  `loyalty-sv-2026-09-18.tsv`, including programs, automation scenarios,
  audience segments, and retention analytics.

### Next concrete step

Continue the `loyalty` namespace with Turkish.

## 2026-09-18 — loyalty / Turkish batch

- Built and strictly verified the 239-value Turkish `loyalty.json` from
  `loyalty-tr-2026-09-18.tsv`, including programs, automation scenarios,
  audience segments, and retention analytics.

### Next concrete step

Start the `reports` namespace with Albanian.

## 2026-09-18 — reports / Albanian batch

- Built and strictly verified the 375-value Albanian `reports.json` from
  `reports-sq-2026-09-18.tsv`, including insights, sales, client and team
  analytics, schedule utilization, and metric explanations.

### Next concrete step

Continue the `reports` namespace with Bulgarian.

## 2026-09-18 — reports / Bulgarian batch

- Built and strictly verified the 375-value Bulgarian `reports.json` from
  `reports-bg-2026-09-18.tsv`, including insights, sales, client and team
  analytics, schedule utilization, and metric explanations.

### Next concrete step

Continue the `reports` namespace with Croatian.

## 2026-09-18 — reports / Croatian batch

- Built and strictly verified the 379-value Croatian `reports.json` from
  `reports-hr-2026-09-18.tsv`, including Croatian `few` plural forms for
  relative dates and schedule losses.

### Next concrete step

Continue the `reports` namespace with Danish.

## 2026-09-18 — reports / Danish batch

- Built and strictly verified the 375-value Danish `reports.json` from
  `reports-da-2026-09-18.tsv`, covering all report tabs, insight messages,
  schedule analysis, client segments, and metric explanations.

### Next concrete step

Continue the `reports` namespace with Finnish.

## 2026-09-18 — reports / Finnish batch

- Built and strictly verified the 375-value Finnish `reports.json` from
  `reports-fi-2026-09-18.tsv`, including all analytics, schedule terminology,
  and metric explanations.

### Next concrete step

Continue the `reports` namespace with French.

## 2026-09-18 — reports / French batch

- Built and strictly verified the 375-value French `reports.json` from
  `reports-fr-2026-09-18.tsv`, including all report tabs, client segments,
  schedule-loss analytics, and metric explanations.

### Next concrete step

Continue the `reports` namespace with Greek.

## 2026-09-18 — reports / Greek batch

- Built and strictly verified the 375-value Greek `reports.json` from
  `reports-el-2026-09-18.tsv`, including insights, full report analytics,
  utilization and loss metrics, and formula explanations.

### Next concrete step

Continue the `reports` namespace with Hungarian.

## 2026-09-18 — reports / Hungarian batch

- Built and strictly verified the 375-value Hungarian `reports.json` from
  `reports-hu-2026-09-18.tsv`, covering all analytics, segments, scheduling,
  cancellations, and formula explanations.

### Next concrete step

Continue the `reports` namespace with Italian.

## 2026-09-18 — reports / Italian batch

- Built and strictly verified the 375-value Italian `reports.json` from
  `reports-it-2026-09-18.tsv`, including all report tabs, scheduling analysis,
  client segmentation, and detailed metric guidance.

### Next concrete step

Continue the `reports` namespace with Norwegian.

## 2026-09-18 — reports / Norwegian batch

- Built and strictly verified the 375-value Norwegian `reports.json` from
  `reports-no-2026-09-18.tsv`, including complete reports, schedule analysis,
  client segmentation, and metric descriptions.

### Next concrete step

Continue the `reports` namespace with Polish.

## 2026-09-18 — reports / Polish batch

- Built and strictly verified the 379-value Polish `reports.json` from
  `reports-pl-2026-09-18.tsv`, including the required `one`/`few`/`many`
  plural forms for dates and schedule losses.

### Next concrete step

Continue the `reports` namespace with Portuguese.

## 2026-09-18 — reports / Portuguese batch

- Built and strictly verified the 375-value Portuguese `reports.json` from
  `reports-pt-2026-09-18.tsv`, covering all reports, schedule insights,
  client groups, and detailed metric explanations.

### Next concrete step

Continue the `reports` namespace with Romanian.
