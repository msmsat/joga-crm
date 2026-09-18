// Валюты продукта: код, символ и то, из чего студия выбирает.
//
// Список собран от ЯЗЫКОВ интерфейса (utils/lang.ts), а не от стран, где мы
// продаём: студия читает продукт на одном из них — значит её деньги обязаны
// быть здесь. Поэтому валют больше сотни, и половину принёс английский: он
// государственный от Ирландии до Вануату, и кенийский шиллинг стоит в списке
// ровно на том же основании, что чешская крона.
//
// Карта «страна визита → валюта» живёт в utils/geo.ts и возвращает ТОЛЬКО
// коды отсюда: валюта, которой нет в списке, подставилась бы в селект
// онбординга пустой строкой — человек прошёл бы шаг, не увидев, что выбрано.
// Стережёт это geo.check.ts.
//
// Символ рисуется рядом с суммой во всём продукте (lib/money.ts). Там, где
// своего знака у валюты нет, стоит её код (CHF, SSP): «SSP 39» читается,
// «39» без ничего — нет. Длиннее четырёх знаков символов здесь нет — больше
// не влезает в плашку выпадающего списка (PremiumSelect в components/UI.tsx).
//
// Названия валют переводятся: ключ `onboarding:settings.currencies.<КОД>`
// обязан существовать во всех 22 локалях, иначе список покажет голый код.
//
// Self-check:  node src/utils/geo.check.ts

export interface CurrencyOption {
  /** Код ISO 4217. */
  value: string;
  symbol: string;
}

// Порядок — по коду: так видно, что ничего не потерялось. Человеку список
// сортируется по переведённому названию там, где он его видит.
export const CURRENCIES: CurrencyOption[] = [
  { value: "AED", symbol: "د.إ" },   // ОАЭ
  { value: "ALL", symbol: "L" },     // Албания
  { value: "AMD", symbol: "֏" },     // Армения
  { value: "AOA", symbol: "Kz" },    // Ангола
  { value: "ARS", symbol: "$" },     // Аргентина
  { value: "AUD", symbol: "A$" },    // Австралия, Кирибати, Науру, Тувалу
  { value: "AZN", symbol: "₼" },     // Азербайджан
  { value: "BAM", symbol: "KM" },    // Босния и Герцеговина
  { value: "BBD", symbol: "$" },     // Барбадос
  { value: "BGN", symbol: "лв" },    // Болгария до перехода на евро (01.01.2026)
  { value: "BIF", symbol: "FBu" },   // Бурунди
  { value: "BMD", symbol: "$" },     // Бермуды
  { value: "BOB", symbol: "Bs" },    // Боливия
  { value: "BRL", symbol: "R$" },    // Бразилия
  { value: "BSD", symbol: "$" },     // Багамы
  { value: "BWP", symbol: "P" },     // Ботсвана
  { value: "BYN", symbol: "Br" },    // Беларусь
  { value: "BZD", symbol: "$" },     // Белиз
  { value: "CAD", symbol: "C$" },    // Канада
  { value: "CDF", symbol: "FC" },    // ДР Конго
  { value: "CHF", symbol: "CHF" },   // Швейцария, Лихтенштейн
  { value: "CLP", symbol: "$" },     // Чили
  { value: "COP", symbol: "$" },     // Колумбия
  { value: "CRC", symbol: "₡" },     // Коста-Рика
  { value: "CUP", symbol: "$" },     // Куба
  { value: "CVE", symbol: "$" },     // Кабо-Верде
  { value: "CZK", symbol: "Kč" },    // Чехия
  { value: "DJF", symbol: "Fdj" },   // Джибути
  { value: "DKK", symbol: "kr" },    // Дания, Гренландия, Фарерские острова
  { value: "DOP", symbol: "$" },     // Доминиканская Республика
  { value: "EUR", symbol: "€" },     // Еврозона, Косово, Черногория, Болгария
  { value: "FJD", symbol: "$" },     // Фиджи
  { value: "FKP", symbol: "£" },     // Фолклендские острова
  { value: "GBP", symbol: "£" },     // Великобритания, Джерси, Гернси, Мэн
  { value: "GEL", symbol: "₾" },     // Грузия
  { value: "GHS", symbol: "₵" },     // Гана
  { value: "GIP", symbol: "£" },     // Гибралтар
  { value: "GMD", symbol: "D" },     // Гамбия
  { value: "GNF", symbol: "FG" },    // Гвинея
  { value: "GTQ", symbol: "Q" },     // Гватемала
  { value: "GYD", symbol: "$" },     // Гайана
  { value: "HKD", symbol: "HK$" },   // Гонконг
  { value: "HNL", symbol: "L" },     // Гондурас
  { value: "HTG", symbol: "G" },     // Гаити
  { value: "HUF", symbol: "Ft" },    // Венгрия
  { value: "ILS", symbol: "₪" },     // Израиль
  { value: "INR", symbol: "₹" },     // Индия
  { value: "ISK", symbol: "kr" },    // Исландия
  { value: "JMD", symbol: "$" },     // Ямайка
  { value: "KES", symbol: "KSh" },   // Кения
  { value: "KGS", symbol: "с" },     // Киргизия
  { value: "KMF", symbol: "CF" },    // Коморы
  { value: "KYD", symbol: "$" },     // Каймановы острова
  { value: "KZT", symbol: "₸" },     // Казахстан
  { value: "LKR", symbol: "Rs" },    // Шри-Ланка
  { value: "LRD", symbol: "$" },     // Либерия
  { value: "LSL", symbol: "L" },     // Лесото
  { value: "MDL", symbol: "L" },     // Молдова
  { value: "MGA", symbol: "Ar" },    // Мадагаскар
  { value: "MKD", symbol: "ден" },   // Северная Македония
  { value: "MOP", symbol: "MOP" },   // Макао
  { value: "MUR", symbol: "₨" },     // Маврикий
  { value: "MWK", symbol: "MK" },    // Малави
  { value: "MXN", symbol: "$" },     // Мексика
  { value: "MYR", symbol: "RM" },    // Малайзия
  { value: "MZN", symbol: "MT" },    // Мозамбик
  { value: "NAD", symbol: "$" },     // Намибия
  { value: "NGN", symbol: "₦" },     // Нигерия
  { value: "NIO", symbol: "C$" },    // Никарагуа
  { value: "NOK", symbol: "kr" },    // Норвегия, Шпицберген
  { value: "NZD", symbol: "NZ$" },   // Новая Зеландия, Острова Кука, Ниуэ
  { value: "PAB", symbol: "B/." },   // Панама
  { value: "PEN", symbol: "S/" },    // Перу
  { value: "PGK", symbol: "K" },     // Папуа — Новая Гвинея
  { value: "PHP", symbol: "₱" },     // Филиппины
  { value: "PKR", symbol: "₨" },     // Пакистан
  { value: "PLN", symbol: "zł" },    // Польша
  { value: "PYG", symbol: "₲" },     // Парагвай
  { value: "RON", symbol: "lei" },   // Румыния
  { value: "RSD", symbol: "дин." },  // Сербия
  { value: "RUB", symbol: "₽" },     // Россия
  { value: "RWF", symbol: "FRw" },   // Руанда
  { value: "SBD", symbol: "$" },     // Соломоновы Острова
  { value: "SCR", symbol: "₨" },     // Сейшелы
  { value: "SDG", symbol: "SDG" },   // Судан
  { value: "SEK", symbol: "kr" },    // Швеция
  { value: "SGD", symbol: "S$" },    // Сингапур
  { value: "SLE", symbol: "Le" },    // Сьерра-Леоне
  { value: "SSP", symbol: "SSP" },   // Южный Судан
  { value: "STN", symbol: "Db" },    // Сан-Томе и Принсипи
  { value: "SZL", symbol: "L" },     // Эсватини
  { value: "TJS", symbol: "SM" },    // Таджикистан
  { value: "TMT", symbol: "m" },     // Туркменистан
  { value: "TOP", symbol: "T$" },    // Тонга
  { value: "TRY", symbol: "₺" },     // Турция, Северный Кипр
  { value: "TTD", symbol: "$" },     // Тринидад и Тобаго
  { value: "TZS", symbol: "TSh" },   // Танзания
  { value: "UAH", symbol: "₴" },     // Украина
  { value: "UGX", symbol: "USh" },   // Уганда
  { value: "USD", symbol: "$" },     // США, Эквадор, Сальвадор, Тимор-Лесте…
  { value: "UYU", symbol: "$U" },    // Уругвай
  { value: "UZS", symbol: "UZS" },   // Узбекистан
  { value: "VES", symbol: "Bs" },    // Венесуэла
  { value: "VUV", symbol: "VT" },    // Вануату
  { value: "WST", symbol: "T" },     // Самоа
  { value: "XAF", symbol: "FCFA" },  // Франк КФА BEAC: Камерун, Габон, Чад…
  { value: "XCD", symbol: "$" },     // Восточно-карибский доллар: Гренада…
  { value: "XOF", symbol: "CFA" },   // Франк КФА BCEAO: Сенегал, Мали, Того…
  { value: "XPF", symbol: "₣" },     // Франк КФП: Новая Каледония, Полинезия
  { value: "ZAR", symbol: "R" },     // ЮАР
  { value: "ZMW", symbol: "ZK" },    // Замбия
  { value: "ZWG", symbol: "ZiG" },   // Зимбабве
];

const BY_CODE = new Map(CURRENCIES.map(c => [c.value, c.symbol]));

/** Знак валюты. Незнакомый код — евро: в нём платформа выставляет счета, и он же
 *  FALLBACK_CURRENCY в utils/geo.ts. Что эти два фолбэка не разъехались,
 *  проверяет geo.check.ts — импортировать geo.ts сюда незачем. */
export function getCurrencySymbol(code: string | undefined): string {
  return (code && BY_CODE.get(code)) ?? "€";
}

/** Есть ли такой код в таблице — для проверок и защитных веток. */
export function isKnownCurrency(code: string | null | undefined): boolean {
  return !!code && BY_CODE.has(code);
}
