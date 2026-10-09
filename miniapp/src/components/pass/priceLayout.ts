/**
 * Сумма, разобранная на места разрядов, — для барабанов цены (PriceRoll).
 *
 * Разряд держит своё место по значению (единицы, десятки, сотни…), а не по
 * номеру символа в строке: «990 Kč» → «1 290 Kč» добавляет тысячи СЛЕВА, и
 * единицы с десятками остаются теми же барабанами. При ключе по номеру
 * символа съезжало всё — и знак валюты прыгал на каждой смене длины.
 *
 * Мест столько, сколько нужно самой длинной сумме набора: лишние стоят
 * свёрнутыми и раскрываются, когда сумма до них дорастает, — DOM не
 * перестраивается на листании. Разделители тысяч — тоже места: в испанском
 * «1290 €» без разделителя, а «12.900 €» с ним (Intl решает сам).
 *
 * Модуль без React: проверяется в `node src/components/pass/priceLayout.check.ts`.
 */
export type PriceFormat = { formatToParts: (value: number) => Intl.NumberFormatPart[] };

export type PriceLayout = {
  /** Перед числом и после него — знак валюты с пробелом, как их ставит язык. */
  prefix: string;
  suffix: string;
  /** Мест целой части в наборе (у самой длинной суммы). */
  span: number;
  /** Цифры целой части текущей суммы по местам: [0] — единицы. */
  digits: number[];
  /** Места разделителей в наборе: k — разделитель, справа от которого k цифр. */
  groups: number[];
  /** Разделители текущей суммы. */
  shownGroups: number[];
  /** Знак разделителя тысяч в этом языке (обычный или неразрывный пробел, точка, запятая). */
  group: string;
  /** Десятичный знак и цифры дробной части — у набора с копейками; иначе пусто. */
  decimal: string;
  fraction: number[];
};

type Parsed = { prefix: string; suffix: string; int: string; groups: number[]; group: string; decimal: string; fraction: string };

function parse(parts: Intl.NumberFormatPart[]): Parsed {
  let prefix = '';
  let suffix = '';
  let int = '';
  let fraction = '';
  let decimal = '';
  let group = '';
  const marks: number[] = []; // длина целой части к моменту каждого разделителя
  let seenNumber = false;
  for (const part of parts) {
    if (part.type === 'integer') { int += part.value; seenNumber = true; }
    else if (part.type === 'group') { marks.push(int.length); group = part.value; }
    else if (part.type === 'decimal') decimal = part.value;
    else if (part.type === 'fraction') fraction += part.value;
    else if (!seenNumber) prefix += part.value;
    else suffix += part.value;
  }
  // Разделитель после `m` цифр слева — это `int.length - m` цифр справа.
  return { prefix, suffix, int, groups: marks.map((m) => int.length - m), group, decimal, fraction };
}

export function priceLayout(format: PriceFormat, value: number, set: number[]): PriceLayout {
  const current = parse(format.formatToParts(value));
  const all = set.map((amount) => parse(format.formatToParts(amount)));
  const span = Math.max(current.int.length, ...all.map((row) => row.int.length));
  const groups = [...new Set([...current.groups, ...all.flatMap((row) => row.groups)])].sort((a, b) => b - a);
  return {
    prefix: current.prefix,
    suffix: current.suffix,
    span,
    digits: [...current.int].reverse().map(Number),
    groups,
    shownGroups: current.groups,
    group: current.group || all.find((row) => row.group)?.group || '',
    decimal: current.decimal,
    fraction: [...current.fraction].map(Number),
  };
}
