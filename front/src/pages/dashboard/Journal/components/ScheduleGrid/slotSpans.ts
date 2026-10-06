// Недоступные отрезки часовой клетки и где в ней начать новое занятие.
// Чистые функции без React — их проверяет npm run check:studio-time.

export type Span = [number, number];

/** Склеить пересекающиеся и встык идущие отрезки [начало, конец) в минутах. */
export function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const merged: Span[] = [];
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

/** Начало занятия по нажатию в минуту `minute` часа, начинающегося в `hourStart`.
 *  null — нажали в перерыв или уборку. Иначе — начало свободного окна под
 *  пальцем: начало часа или конец блока, который в этом часе стоит раньше. */
export function slotStart(spans: Span[], hourStart: number, minute: number): number | null {
  if (spans.some(([s, e]) => s <= minute && minute < e)) return null;
  return Math.max(hourStart, ...spans.filter(([, e]) => e <= minute).map(([, e]) => e));
}
