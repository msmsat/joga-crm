/** Самопроверка разбора цены на разряды: `node src/components/pass/priceLayout.check.ts`.
 *
 * Защищает то, из-за чего цена в витрине абонементов «прыгала»: разряд обязан
 * держать место по значению (единицы — всегда [0]), а набор мест — покрывать
 * самую длинную сумму, чтобы новые тысячи раскрывались слева, а не сдвигали
 * знак валюты рывком.
 */
const { priceLayout } = await import('./priceLayout.ts');

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failed += 1;
    console.error(`FAIL  ${name}\n  ожидалось: ${JSON.stringify(expected)}\n  получено:  ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok    ${name}`);
  }
};

const fmt = (locale: string, currency: string, fraction = 0) => new Intl.NumberFormat(locale, {
  style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: fraction, minimumFractionDigits: fraction,
});
const set = [690, 990, 1290, 12900];

// Чешская крона: знак после числа, тысячи через неразрывный пробел.
const cz = priceLayout(fmt('cs-CZ', 'CZK'), 990, set);
check('cs: мест — по самой длинной сумме набора', cz.span, 5);
check('cs: единицы — первое место', cz.digits, [0, 9, 9]);
check('cs: знак валюты — после числа', [cz.prefix, cz.suffix.trim()], ['', 'Kč']);
check('cs: разделитель тысяч в наборе есть, у 990 — нет', [cz.groups, cz.shownGroups], [[3], []]);
const cz2 = priceLayout(fmt('cs-CZ', 'CZK'), 1290, set);
check('cs: 1 290 — тысяча на месте [3], разделитель показан', [cz2.digits, cz2.shownGroups], [[0, 9, 2, 1], [3]]);

// Английский евро: знак перед числом.
const en = priceLayout(fmt('en', 'EUR'), 1290, set);
check('en: знак перед числом', [en.prefix, en.suffix], ['€', '']);
check('en: разделитель — запятая', en.group, ',');

// Испанский: четырёхзначное без разделителя, пятизначное — с ним.
const es4 = priceLayout(fmt('es', 'EUR'), 1290, set);
const es5 = priceLayout(fmt('es', 'EUR'), 12900, set);
check('es: 1290 € без разделителя, но место под него в наборе', [es4.shownGroups, es4.groups], [[], [3]]);
check('es: 12.900 € с разделителем', es5.shownGroups, [3]);

// Копейки — когда в наборе есть дробная цена.
const frac = priceLayout(fmt('de', 'EUR', 2), 64.5, [64.5, 120]);
check('de: дробная часть и десятичный знак', [frac.decimal, frac.fraction], [',', [5, 0]]);
check('de: целая часть 64', frac.digits, [4, 6]);

// Падаем throw'ом, а не process.exit: в tsconfig приложения только браузерные
// типы, и `process` для tsc не существует (см. booking.check.ts).
if (failed > 0) throw new Error(`${failed} FAILED`);
console.log('ALL PASS — разряды держат место, знак валюты не прыгает');
