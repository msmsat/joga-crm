// Валюта студии по стране визита — подсказка в селекте на онбординге, а не факт
// о бизнесе: человек волен её сменить, и в студию уедет то, что он видел, а не
// то, что подставил IP.
//
// Карта перечисляет только НЕ-евровые страны. Так короче и так честнее: выбрать
// на онбординге можно лишь из CURRENCY_OPTIONS (components/UI.tsx), а еврозона —
// это два десятка стран из них одной строкой. Страна не в карте, страна
// неизвестна (локальный адрес, выход Tor, нет базы GeoIP на сервере) — евро:
// в нём платформа и так выставляет счета студиям.
//
// Расширять ВМЕСТЕ с PICKABLE в components/UI.tsx: валюта, которой нет в
// выборе, подставится в селект пустой строкой — человек не увидит, что выбрано.
//
// Self-check:  node src/utils/geo.check.ts

/** Чем платят, когда страна ничего не подсказала. */
export const FALLBACK_CURRENCY = "EUR";

const COUNTRY_CURRENCY: Record<string, string> = {
  CZ: "CZK",
  US: "USD",
  GB: "GBP",
  CH: "CHF",
  LI: "CHF",
  UA: "UAH",
  RU: "RUB",
};

export function currencyForCountry(country: string | null | undefined): string {
  return COUNTRY_CURRENCY[(country || "").toUpperCase()] ?? FALLBACK_CURRENCY;
}
