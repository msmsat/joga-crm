import type { TFunction } from 'i18next';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Значение аргумента действия человеческой строкой.
 *
 * «weekdays: 0,1» — тот же голый номер, что и id: человек его не читает и не
 * проверит. Дни показываем словами, флаги — да/нет, списки — через запятую.
 * Общий модуль на карточку истории и на окно плана: две копии разъехались бы,
 * и одно и то же действие читалось бы по-разному в ленте и в окне. */
export function formatArg(key: string, value: unknown, t: TFunction): string {
  if (key === 'weekdays' && Array.isArray(value)) {
    return value
      .map((day) => t(`common:days.short.${DAY_KEYS[Number(day)] ?? ''}`, { defaultValue: String(day) }))
      .join(', ');
  }
  if (typeof value === 'boolean') return t(`ai:actions.bool.${value ? 'yes' : 'no'}`);
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

/** Строки «поле: значение» для показа: без секретов и без id, которые уже
 *  показаны именами. Пароль уезжает в историю чата навсегда — его не выводим. */
export function visibleArgs(
  args: Record<string, unknown> | undefined,
  entities: Record<string, string> | undefined,
  refs: Record<string, number> | undefined,
): [string, unknown][] {
  return Object.entries(args ?? {}).filter(
    ([k, v]) => v !== null && v !== undefined && v !== ''
      && !k.includes('password')
      && !(entities && k in entities)
      && !(refs && k in refs));
}
