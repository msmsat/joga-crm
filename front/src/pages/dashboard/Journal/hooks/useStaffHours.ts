import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { scheduleApi } from '../../../../api/schedule';
import { queryKeys } from '../../../../api/queryKeys';
import { dayDate, isoDay } from '../studioTimeModel';

/** Сколько дней часов берётся одним запросом: неделя назад и месяц вперёд. */
const BEFORE = 7;
const SPAN = 45;

const shift = (day: string, days: number) => {
  const date = dayDate(day);
  date.setDate(date.getDate() + days);
  return isoDay(date);
};

/**
 * Рабочие часы сотрудников вокруг дня окна «Время студии» — выходные,
 * нерабочее время и перерывы, без занятостей (hours_only). По ним окно
 * предупреждает, что блок встаёт вне рабочего времени.
 *
 * Набором на полтора месяца, а не на день: смена времени, длительности и людей
 * пересчитывается на месте, одним кадром, а запрос уходит, только когда день
 * ушёл за край набора. Ключ — под общим ключом сетки журнала: правка графика
 * сотрудника (syncStaffSchedule) сбрасывает и его.
 */
export function useStaffHours(date: string, enabled = true) {
  const [from, setFrom] = useState(() => shift(date, -BEFORE));
  const to = shift(from, SPAN);
  // Блок до полуночи сверяется и со следующим днём — он тоже должен быть в наборе.
  if (date < from || shift(date, 1) > to) setFrom(shift(date, -BEFORE));
  const { data } = useQuery({
    queryKey: [...queryKeys.journalStaffBlocksAll, 'hours', from, to],
    queryFn: () => scheduleApi.getStaffHours(from, to),
    staleTime: 60_000,
    enabled,
  });
  return data;
}
