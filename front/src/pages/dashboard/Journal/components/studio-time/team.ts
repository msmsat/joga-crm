import type { Trainer } from '../../types';
import type { StudioTimeDraft } from '../../studioTimeModel';

export interface TeamMember {
  id: number;
  initials: string;
  /** Короткое имя — для перечня («Оля К., Дима С.»). */
  name: string;
  /** Полное — для карточки. */
  full: string;
  color: string;
}

const NEUTRAL = '#A39E97';
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
/** «Anna Kovářová» → «Anna K.» — тем же видом, что короткие имена журнала. */
const shortOf = (name: string) => {
  const [first, last] = name.split(/\s+/).filter(Boolean);
  return last ? `${first} ${last[0]}.` : first;
};

/**
 * Кого касается блок — людьми, а не номерами. Сначала из списка команды
 * журнала (там цвета и короткие имена), а кого в нём нет — из имён, что
 * прислала сетка вместе с блоком: тренеру список всей команды не отдаётся,
 * и без них его карточка показывала бы вместо коллег голое «+2».
 */
export function teamOf(draft: StudioTimeDraft, trainers: Trainer[]): TeamMember[] {
  return draft.staffIds.flatMap(id => {
    const known = trainers.find(item => item.id === id);
    if (known) return [{ id, initials: known.initials, name: known.name, full: known.full, color: known.color }];
    const sent = draft.team?.find(item => item.id === id);
    if (!sent?.name) return [];
    return [{ id, initials: initialsOf(sent.name), name: shortOf(sent.name), full: sent.name, color: sent.color || NEUTRAL }];
  });
}
