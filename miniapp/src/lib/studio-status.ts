export type StudioState = 'open' | 'closing_soon' | 'closed' | 'opening_soon';

/** «08:00» → 480 минут от полуночи. */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** За сколько минут до события статус становится «скоро». */
const SOON = 60;

/**
 * Живой статус студии: открыто / скоро закроется / закрыто / скоро откроется.
 *
 * «Скоро» важнее самого факта «открыто»: клиент, который видит «зачиняється за
 * 40 хв», не поедет через весь город. Поэтому окно в час проверяется до того,
 * как вернуть спокойное «відчинено».
 *
 * Смена через полночь (22:00 → 06:00) поддержана: в этом случае рабочий отрезок
 * разорван, и «внутри» означает «после открытия ИЛИ до закрытия».
 */
export function studioState(opens: string, closes: string, now = new Date()): StudioState {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const from = toMinutes(opens);
  const to = toMinutes(closes);

  const overnight = to <= from;
  const isOpen = overnight ? minutes >= from || minutes < to : minutes >= from && minutes < to;

  if (isOpen) {
    // Сколько осталось до закрытия — через полночь считаем по кругу суток.
    const untilClose = (to - minutes + 1440) % 1440;
    return untilClose <= SOON ? 'closing_soon' : 'open';
  }

  const untilOpen = (from - minutes + 1440) % 1440;
  return untilOpen <= SOON ? 'opening_soon' : 'closed';
}

/** Цвет точки статуса: фисташка — работаем, пыльная роза — нет. */
export const STATE_COLOR: Record<StudioState, string> = {
  open: 'var(--v-success)',
  closing_soon: 'var(--v-brand)',
  closed: 'var(--v-danger)',
  opening_soon: 'var(--v-brand)',
};
