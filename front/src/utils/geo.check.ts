/** Самопроверка валюты по стране: `node src/utils/geo.check.ts` (из front/).
 *
 * Стережёт ровно один способ сломать онбординг: вписать в карту валюту, которой
 * нет в выборе. Селект получил бы значение, отсутствующее в options, показал бы
 * пустое поле — и человек прошёл бы шаг, не заметив, что валюта не выбрана.
 * Поэтому PICKABLE читается из components/UI.tsx как текст: импортировать оттуда
 * нельзя (React и JSX), а держать вторую копию списка — значит завести ту самую
 * рассинхронизацию, от которой проверка и защищает.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { FALLBACK_CURRENCY, currencyForCountry } from "./geo.ts";

const ui = readFileSync(fileURLToPath(new URL("../components/UI.tsx", import.meta.url)), "utf8");
const pickable = /const PICKABLE = \[([^\]]*)\]/.exec(ui);
assert.ok(pickable, "в components/UI.tsx не найден PICKABLE — проверка ослепла, почините её");
const offered = new Set([...pickable[1].matchAll(/"([A-Z]{3})"/g)].map(m => m[1]));

// Всё, что карта вообще способна вернуть, обязано быть в выборе.
for (const country of ["CZ", "US", "GB", "CH", "LI", "UA", "RU", "DE", "XX", ""]) {
  const currency = currencyForCountry(country);
  assert.ok(offered.has(currency), `${country} → ${currency}, которой нет в CURRENCY_OPTIONS`);
}

// Позиционирование: Чехия и Штаты обязаны попадать точно, иначе вся затея зря.
assert.equal(currencyForCountry("CZ"), "CZK");
assert.equal(currencyForCountry("US"), "USD");
assert.equal(currencyForCountry("us"), "USD", "страну сервер может отдать в любом регистре");

// Еврозона и всё неизвестное — евро, а не рубль и не пустая строка.
assert.equal(currencyForCountry("DE"), FALLBACK_CURRENCY);
assert.equal(currencyForCountry("PL"), FALLBACK_CURRENCY, "злотого нет в выборе — падаем в евро");
assert.equal(currencyForCountry(null), FALLBACK_CURRENCY, "страна не определилась");
assert.equal(currencyForCountry(undefined), FALLBACK_CURRENCY);
assert.equal(currencyForCountry(""), FALLBACK_CURRENCY);

console.log(`geo self-check ok — выбор из ${offered.size} валют, по умолчанию ${FALLBACK_CURRENCY}`);
