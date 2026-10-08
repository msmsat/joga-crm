import { useQuery } from '@tanstack/react-query';
import { scheduleApi } from '../../../../api/schedule';
import { queryKeys } from '../../../../api/queryKeys';
import { toDateStr } from '../../Journal/utils';

/**
 * Занятия сегодняшнего дня без отменённых — общий источник для «Расписания на
 * сегодня» (большой экран, админ и тренер) и ленты «Сегодня» телефонной главной.
 * Своего эндпоинта нет: GET /schedule/lessons уже сужен ролью на сервере
 * (тренер видит только свои).
 */
export function useTodayLessons() {
  const day = toDateStr(new Date());

  const { data, isPending } = useQuery({
    queryKey: queryKeys.overviewToday(day),
    queryFn: () => scheduleApi.getLessons({ date_from: day, date_to: day }),
    refetchInterval: 60_000,   // записываются в течение дня — как сетка Журнала
  });

  const lessons = (data ?? [])
    .filter(l => l.status !== 'cancelled')
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const spots = lessons.reduce((sum, l) => sum + l.total_spots, 0);
  const booked = lessons.reduce((sum, l) => sum + l.booked_count, 0);

  return { lessons, spots, booked, isPending };
}
