/** Данные пришли, но смотреть не на что: все KPI по нулям и все списки пусты. */
export function isAllZero(values: number[], lists: unknown[][]): boolean {
  return values.every(v => !v) && lists.every(l => !l.length);
}
