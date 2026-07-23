import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { scheduleApi } from '../../../../api/schedule';
import { staffApi } from '../../../../api/staff';
import { queryKeys } from '../../../../api/queryKeys';
import { colorForStaffId, lessonToBooking, staffToTrainer, toDateStr } from '../utils';
import type { StaffListItem } from '../../../../api/staff/staff.types';
import type { Hall } from '../types';

// Диапазон видимых дат: день / неделя (Пн–Вс)
export function visibleRange(
  view: 'day' | 'week',
  year: number,
  month: number,
  day: number,
): [string, string] {
  if (view === 'week') {
    const dow = new Date(year, month, day).getDay();
    const monday = new Date(year, month, day - dow + (dow === 0 ? -6 : 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return [toDateStr(monday), toDateStr(sunday)];
  }
  const d = toDateStr(new Date(year, month, day));
  return [d, d];
}

// Соседний диапазон (день −1/+1, или неделя −1/+1 в недельном виде) — для
// префетча: к моменту клика «вперёд»/«назад» листание почти всегда без сети.
function neighborRange(
  view: 'day' | 'week',
  year: number,
  month: number,
  day: number,
  dir: -1 | 1,
): [string, string] {
  const step = view === 'week' ? dir * 7 : dir;
  const d = new Date(year, month, day + step);
  return visibleRange(view, d.getFullYear(), d.getMonth(), d.getDate());
}

// Экспортирован для hover-префетча меню (Sidebar) — кэш ключа journalLessons
// хранит уже готовые Booking[] (см. комментарий у useQuery ниже), любой код,
// кладущий туда данные, обязан маппить их тем же способом.
export async function fetchBookings(
  dateFrom: string,
  dateTo: string,
  staff: StaffListItem[],
  halls: Hall[],
) {
  const lessons = await scheduleApi.getLessons({ date_from: dateFrom, date_to: dateTo });
  const colorByTeacher = new Map(staff.map(s => [s.id, colorForStaffId(s.id)]));
  return lessons.map(l => lessonToBooking(l, halls, colorByTeacher));
}

// Реальные данные журнала: тренеры (Сотрудники), залы, занятия за видимый диапазон.
export function useSchedule(
  calYear: number,
  calMonth: number,
  selectedDay: number,
  calendarView: 'day' | 'week',
) {
  const qc = useQueryClient();

  const {
    data: staff = [],
    isSuccess: staffLoaded,
    error: staffError,
    refetch: refetchStaff,
  } = useQuery({
    queryKey: queryKeys.staff,
    queryFn: () => staffApi.getList().then(res => res.staff.items),
  });
  const {
    data: halls = [],
    isSuccess: hallsLoaded,
    error: hallsError,
    refetch: refetchHalls,
  } = useQuery({
    queryKey: queryKeys.halls,
    queryFn: () => scheduleApi.getHalls(),
  });

  const [dateFrom, dateTo] = visibleRange(calendarView, calYear, calMonth, selectedDay);
  const lessonsKey = queryKeys.journalLessons(dateFrom, dateTo);

  // Маппинг — в queryFn, а не в select: кэш этого ключа хранит уже готовые
  // Booking[], потому что мутации (useJournalMutations) пишут в этот же кэш
  // напрямую через setQueryData и должны видеть тот же тип.
  const {
    data: bookings = [],
    isPending: bookingsPending,
    error: bookingsError,
    refetch: refetchBookings,
  } = useQuery({
    queryKey: lessonsKey,
    queryFn: () => fetchBookings(dateFrom, dateTo, staff, halls),
    enabled: staffLoaded && hallsLoaded,
    // Листание дней/недель держит старую сетку на экране, пока едут новые
    // данные — без этого сетка на миг пустеет при каждой смене ключа.
    placeholderData: keepPreviousData,
    // Чужие правки (второй админ создал/перенёс занятие) подтягиваются сами,
    // без действий пользователя — раз в минуту; вебсокет не заводим (YAGNI).
    refetchInterval: 60_000,
  });

  // Первая загрузка «с нуля»: кэш этого ключа пуст, данных ни своих, ни
  // предыдущих ещё нет — именно в этот момент показываем скелетон.
  // keepPreviousData гарантирует, что при листании (ключ уже видел данные
  // раньше) isPending не взводится повторно.
  const isFirstLoad = !staffLoaded || !hallsLoaded || bookingsPending;

  // Ошибка первой загрузки (сетки ещё нет — показываем плашку вместо неё) vs
  // фоновая (данные в кэше уже есть, просто не удалось обновить — только тост).
  const loadError = staffError ?? hallsError ?? bookingsError ?? null;
  const isFirstLoadError = isFirstLoad && loadError != null;
  const refetchAll = () => { refetchStaff(); refetchHalls(); refetchBookings(); };

  // Префетч соседних дней/недель: после успешной загрузки текущего диапазона
  // тянем −1 и +1 заранее — листание вперёд-назад почти всегда без сети.
  useEffect(() => {
    if (!staffLoaded || !hallsLoaded) return;
    for (const dir of [-1, 1] as const) {
      const [from, to] = neighborRange(calendarView, calYear, calMonth, selectedDay, dir);
      qc.prefetchQuery({
        queryKey: queryKeys.journalLessons(from, to),
        queryFn: () => fetchBookings(from, to, staff, halls),
      });
    }
  }, [qc, calendarView, calYear, calMonth, selectedDay, staff, halls, staffLoaded, hallsLoaded]);

  // Колонки — тренеры, плюс любой сотрудник (включая владельца), ведущий занятие
  // в загруженном диапазоне: занятие не должно остаться без колонки.
  const trainers = useMemo(() => {
    const teacherIdsWithLessons = new Set(bookings.map(b => b.trainer));
    return staff
      .filter(s => s.role === 'trainer' || teacherIdsWithLessons.has(s.id))
      .map(staffToTrainer);
  }, [staff, bookings]);

  return {
    trainers,
    halls,
    bookings,
    isFirstLoad,
    lessonsKey,
    loadError,
    isFirstLoadError,
    refetchAll,
  };
}

// Точки мини-календаря (задача 5 V4-5): даты месяца с реальными занятиями,
// без загрузки полного списка занятий месяца. staleTime подлиннее — точки не
// обязаны быть секунда-в-секунду свежими, invalidate от мутаций (задача 5)
// покрывает создание/отмену занятия немедленно.
export function useJournalDays(calYear: number, calMonth: number) {
  const month = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
  const { data } = useQuery({
    queryKey: queryKeys.journalDays(month),
    queryFn: () => scheduleApi.getLessonDays(month).then(res => res.days),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  return data ?? [];
}
