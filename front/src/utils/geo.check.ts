/** Самопроверка валюты по стране: `node src/utils/geo.check.ts` (из front/).
 *
 * Стережёт ровно один способ сломать онбординг: вписать в карту валюту, которой
 * нет в выборе. Селект получил бы значение, отсутствующее в options, показал бы
 * пустое поле — и человек прошёл бы шаг, не заметив, что валюта не выбрана.
 *
 * Раньше список выбора приходилось выдирать регуляркой из components/UI.tsx:
 * импортировать оттуда нельзя (React и JSX). Теперь таблица валют лежит
 * отдельным модулем (utils/currency.ts) и читается напрямую — по той же
 * причине, по которой из UI.tsx уехали LANGUAGES.
 *
 * Вторая половина проверки — переводы: у каждой валюты обязан быть ключ
 * `settings.currencies.<КОД>` в КАЖДОЙ локали. Без него список показал бы
 * человеку голый код вместо названия, и заметили бы это только в проде.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { CURRENCIES, getCurrencySymbol } from "./currency.ts";
import { FALLBACK_CURRENCY, MAPPED_CURRENCIES, currencyForCountry } from "./geo.ts";

const offered = new Set(CURRENCIES.map(c => c.value));
assert.equal(offered.size, CURRENCIES.length, "в CURRENCIES повторяется код валюты");

// Всё, что карта вообще способна вернуть, обязано быть в выборе.
for (const code of MAPPED_CURRENCIES) {
  assert.ok(offered.has(code), `страна отдаёт ${code}, которой нет в CURRENCIES`);
}
assert.ok(offered.has(FALLBACK_CURRENCY), "фолбэка нет в выборе");

// Символ — то, что встанет рядом с суммой. Пустой сломает вёрстку молча,
// длинный вылезет из плашки списка.
for (const { value, symbol } of CURRENCIES) {
  assert.ok(symbol.trim(), `${value}: пустой символ`);
  assert.ok([...symbol].length <= 4, `${value}: символ «${symbol}» длиннее четырёх знаков`);
}

// Позиционирование: страны, ради которых всё и затевалось, обязаны попадать точно.
assert.equal(currencyForCountry("CZ"), "CZK");
assert.equal(currencyForCountry("US"), "USD");
assert.equal(currencyForCountry("us"), "USD", "страну сервер может отдать в любом регистре");
assert.equal(currencyForCountry("MX"), "MXN", "испанский — это не только Испания");
assert.equal(currencyForCountry("BR"), "BRL", "португальский — это не только Португалия");
assert.equal(currencyForCountry("SN"), "XOF", "французский — это не только Франция");
assert.equal(currencyForCountry("KE"), "KES", "английский — это не только Британия");

// Еврозона и всё неизвестное — евро, а не рубль и не пустая строка.
assert.equal(currencyForCountry("DE"), FALLBACK_CURRENCY);
assert.equal(currencyForCountry("HR"), FALLBACK_CURRENCY, "Хорватия в евро с 2023-го");
assert.equal(currencyForCountry("BG"), FALLBACK_CURRENCY, "Болгария в евро с 01.01.2026");
assert.equal(currencyForCountry(null), FALLBACK_CURRENCY, "страна не определилась");
assert.equal(currencyForCountry(undefined), FALLBACK_CURRENCY);
assert.equal(currencyForCountry(""), FALLBACK_CURRENCY);
assert.equal(currencyForCountry("XX"), FALLBACK_CURRENCY);

assert.equal(getCurrencySymbol("CZK"), "Kč");
// Фолбэков два (FALLBACK_CURRENCY здесь, знак незнакомого кода в currency.ts) —
// разъехаться им нельзя: иначе цена в валюте, которой нет в таблице, подписана
// одним знаком, а селект на онбординге предлагает другую валюту.
assert.equal(
  getCurrencySymbol("ZZZ"), getCurrencySymbol(FALLBACK_CURRENCY),
  "незнакомый код обязан подписываться знаком FALLBACK_CURRENCY",
);
assert.equal(getCurrencySymbol(undefined), "€");

// Название каждой валюты — во всех локалях сразу. Ключ тот же, что читают
// StepSettings и GeneralTab: onboarding:settings.currencies.<КОД>.
const locales = fileURLToPath(new URL("../locales/", import.meta.url));
const langs = readdirSync(locales, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name);
assert.ok(langs.length >= 22, `локалей всего ${langs.length} — проверка смотрит не туда`);

for (const lang of langs) {
  const raw = readFileSync(`${locales}${lang}/onboarding.json`, "utf8");
  const names = JSON.parse(raw)?.settings?.currencies ?? {};
  const missing = CURRENCIES.map(c => c.value).filter(code => !String(names[code] ?? "").trim());
  assert.equal(missing.length, 0, `${lang}/onboarding.json: нет названий для ${missing.join(", ")}`);
  const extra = Object.keys(names).filter(code => !offered.has(code));
  assert.equal(extra.length, 0, `${lang}/onboarding.json: названия валют, которых нет в CURRENCIES: ${extra.join(", ")}`);
}

console.log(
  `geo self-check ok — валют: ${CURRENCIES.length}, стран в карте: ${MAPPED_CURRENCIES.length}, ` +
  `локалей с названиями: ${langs.length}, по умолчанию ${FALLBACK_CURRENCY}`,
);
