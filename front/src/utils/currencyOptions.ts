// Список валют, готовый к показу человеку: переведённое название, код и знак.
// Один на весь продукт — онбординг и Настройки обязаны предлагать одно и то же,
// иначе студия выбирает валюту дважды и второй раз видит другой список.
//
// Код едет отдельным полем `hint`, а не внутри названия. Он не украшение:
// валют больше сотни, и названия в них повторяются — «доллар» их два десятка,
// «франк КФА» два разных. Но приписанный к названию, он первым уходил бы под
// многоточие в узком селекте Настроек — то есть пропадал бы ровно там, где
// нужен. Селекты рисуют его отдельной колонкой справа.
//
// Порядок — по названию на языке интерфейса, через Intl.Collator: сортировка
// по коду поставила бы AED первым для всех, а по байтам разбросала бы
// кириллицу и диакритику.

import { CURRENCIES } from "./currency";

export interface CurrencyChoice {
  value: string;
  symbol: string;
  /** Название на языке интерфейса. */
  label: string;
  /** Код ISO 4217 — та же строка, что value: селекты рисуют его справа. */
  hint: string;
}

/** `translate` — t из useTranslation, `lang` — i18n.language (тег BCP-47). */
export function currencyOptionsFor(
  translate: (key: string) => string,
  lang: string,
): CurrencyChoice[] {
  const collator = new Intl.Collator(lang || "en");
  return CURRENCIES
    .map(({ value, symbol }) => ({
      value,
      symbol,
      label: translate(`onboarding:settings.currencies.${value}`),
      hint: value,
    }))
    .sort((a, b) => collator.compare(a.label, b.label));
}
