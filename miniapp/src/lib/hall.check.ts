/** Самопроверка раскладки зала: `node src/lib/hall.check.ts` (без зависимостей). */
import { layoutRows } from './hall.ts';

const cases: [number, number[]][] = [
  [0, []],
  [1, [1]],
  [6, [6]],
  [7, [4, 3]],
  [8, [4, 4]],
  [10, [5, 5]],
  [11, [6, 5]],
  [15, [5, 5, 5]],
  [17, [6, 6, 5]],
  [20, [5, 5, 5, 5]],
];

for (const [total, expected] of cases) {
  const rows = layoutRows(total);

  const sizes = rows.map((row) => row.length);
  if (sizes.join(',') !== expected.join(',')) {
    throw new Error(`layoutRows(${total}) дал ряды [${sizes}], ожидалось [${expected}]`);
  }

  // Номера мест обязаны идти подряд 1..total: клиент запоминает свой коврик
  // числом, дыра или дубль в нумерации сажает двоих на одно место.
  const flat = rows.flat().join(',');
  const expectedFlat = Array.from({ length: total }, (_, i) => i + 1).join(',');
  if (flat !== expectedFlat) {
    throw new Error(`layoutRows(${total}) дал номера [${flat}], ожидалось [${expectedFlat}]`);
  }
}

console.log(`hall: ok (${cases.length} случаев)`);
