/** Максимум ковриков в одном ряду — дальше зал становится шире экрана. */
export const MAX_PER_ROW = 6;

/**
 * Раскладка ковриков по рядам: бэкенд отдаёт только общее число мест.
 *
 * Рядов берём минимально возможное количество, а места делим между ними
 * поровну; остаток достаётся передним рядам — они ближе к тренеру, туда встают
 * первыми. Так зал не заканчивается рядом-одиночкой: 11 → 6+5, а не 5+5+1;
 * 17 → 6+6+5, а не 5+5+5+2.
 *
 * Возвращает номера мест по рядам, сплошной нумерацией от первого ряда.
 */
export function layoutRows(total: number): number[][] {
  const rowCount = Math.ceil(total / MAX_PER_ROW);
  const rows: number[][] = [];
  let spot = 1;

  for (let i = 0; i < rowCount; i++) {
    const size = Math.floor(total / rowCount) + (i < total % rowCount ? 1 : 0);
    rows.push(Array.from({ length: size }, (_, j) => spot + j));
    spot += size;
  }

  return rows;
}
