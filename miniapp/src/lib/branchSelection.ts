/**
 * Выбор филиалов: «все» или любые из них.
 *
 * ПУСТОЙ СПИСОК — «ВСЕ». Отдельного флага нет: «выбраны все три» и «все» — один
 * и тот же ответ сервера, и держать их разными состояниями значило бы две
 * подсвеченные кнопки на один смысл. Поэтому выбор, покрывший все филиалы, сам
 * сворачивается в «все», и снятие последнего — тоже: пустым фильтр не бывает,
 * иначе экран показывал бы пустой список без причины.
 *
 * Модуль без React: его проверяет `node src/lib/bookingPage.check.ts`.
 */
export type BranchSelection = number[];

export const ALL_BRANCHES: BranchSelection = [];

/** Выбор без филиалов, которых в каталоге уже нет, — в порядке каталога. */
export function knownBranches(selection: BranchSelection, all: number[]): BranchSelection {
  const kept = all.filter((id) => selection.includes(id));
  return kept.length === all.length ? ALL_BRANCHES : kept;
}

/** Касание чипа филиала: добавить или снять. */
export function toggleBranch(selection: BranchSelection, id: number, all: number[]): BranchSelection {
  const next = selection.includes(id) ? selection.filter((row) => row !== id) : [...selection, id];
  return knownBranches(next, all);
}

/** Ключ выбора для кэша и зависимостей эффекта: порядок касаний роли не играет. */
export const branchKey = (selection: BranchSelection): string =>
  [...selection].sort((a, b) => a - b).join(',');

/** Обратно из ключа — там, где эффекту нужен сам список. */
export const branchesOfKey = (key: string): BranchSelection =>
  key ? key.split(',').map(Number) : ALL_BRANCHES;
