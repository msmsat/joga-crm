import { useEffect, useState } from 'react';
import { scheduleApi } from '../../../../api/schedule';
import { staffApi } from '../../../../api/staff';
import type { Booking, Trainer, Hall } from '../types';
import { lessonToBooking, staffToTrainer, toDateStr } from '../utils';

// Диапазон видимых дат: день / неделя (Пн–Вс) / месяц
export function visibleRange(
  view: 'day' | 'week' | 'month',
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
  if (view === 'month') {
    return [toDateStr(new Date(year, month, 1)), toDateStr(new Date(year, month + 1, 0))];
  }
  const d = toDateStr(new Date(year, month, day));
  return [d, d];
}

// Реальные данные журнала: тренеры (Сотрудники), залы, занятия за видимый диапазон.
export function useSchedule(
  calYear: number,
  calMonth: number,
  selectedDay: number,
  calendarView: 'day' | 'week' | 'month',
) {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loaded, setLoaded] = useState(false); // тренеры и залы загружены

  useEffect(() => {
    Promise.all([staffApi.getList(), scheduleApi.getHalls()])
      .then(([staffRes, hallsRes]) => {
        setTrainers(staffRes.staff.items.map(staffToTrainer));
        setHalls(hallsRes);
        setLoaded(true);
      })
      .catch(err => console.error('Журнал: не удалось загрузить тренеров/залы', err));
  }, []);

  const [dateFrom, dateTo] = visibleRange(calendarView, calYear, calMonth, selectedDay);

  useEffect(() => {
    if (!loaded) return;
    let stale = false; // защита от гонки при быстром листании дней
    const colorByTeacher = new Map(trainers.map(t => [t.id, t.color]));
    scheduleApi.getLessons({ date_from: dateFrom, date_to: dateTo })
      .then(lessons => {
        if (!stale) setBookings(lessons.map(l => lessonToBooking(l, halls, colorByTeacher)));
      })
      .catch(err => console.error('Журнал: не удалось загрузить занятия', err));
    return () => { stale = true; };
  }, [loaded, dateFrom, dateTo, trainers, halls]);

  return { trainers, halls, bookings, setBookings };
}
