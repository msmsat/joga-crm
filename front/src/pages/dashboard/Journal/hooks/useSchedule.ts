import { useEffect, useMemo, useState } from 'react';
import { scheduleApi } from '../../../../api/schedule';
import { staffApi } from '../../../../api/staff';
import type { StaffListItem } from '../../../../api/staff/staff.types';
import type { Booking, Hall } from '../types';
import { colorForStaffId, lessonToBooking, staffToTrainer, toDateStr } from '../utils';

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

// Реальные данные журнала: тренеры (Сотрудники), залы, занятия за видимый диапазон.
export function useSchedule(
  calYear: number,
  calMonth: number,
  selectedDay: number,
  calendarView: 'day' | 'week',
) {
  const [staff, setStaff] = useState<StaffListItem[]>([]); // весь штат — источник колонок
  const [halls, setHalls] = useState<Hall[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loaded, setLoaded] = useState(false); // тренеры и залы загружены

  useEffect(() => {
    Promise.all([staffApi.getList(), scheduleApi.getHalls()])
      .then(([staffRes, hallsRes]) => {
        setStaff(staffRes.staff.items);
        setHalls(hallsRes);
        setLoaded(true);
      })
      .catch(err => console.error('Журнал: не удалось загрузить тренеров/залы', err));
  }, []);

  // Колонки — тренеры, плюс любой сотрудник (включая владельца), ведущий занятие
  // в загруженном диапазоне: занятие не должно остаться без колонки.
  const trainers = useMemo(() => {
    const teacherIdsWithLessons = new Set(bookings.map(b => b.trainer));
    return staff
      .filter(s => s.role === 'trainer' || teacherIdsWithLessons.has(s.id))
      .map(staffToTrainer);
  }, [staff, bookings]);

  const [dateFrom, dateTo] = visibleRange(calendarView, calYear, calMonth, selectedDay);

  useEffect(() => {
    if (!loaded) return;
    let stale = false; // защита от гонки при быстром листании дней
    const colorByTeacher = new Map(staff.map(s => [s.id, colorForStaffId(s.id)]));
    scheduleApi.getLessons({ date_from: dateFrom, date_to: dateTo })
      .then(lessons => {
        if (!stale) setBookings(lessons.map(l => lessonToBooking(l, halls, colorByTeacher)));
      })
      .catch(err => console.error('Журнал: не удалось загрузить занятия', err));
    return () => { stale = true; };
  }, [loaded, dateFrom, dateTo, staff, halls]);

  return { trainers, halls, bookings, setBookings };
}
