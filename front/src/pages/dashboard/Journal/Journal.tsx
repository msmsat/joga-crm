import React, { useState, useRef, useEffect } from 'react';
import './Journal.css';
import type { Booking } from './types';
import type { LessonCreate } from '../../../api/schedule/schedule.types';
import { scheduleApi } from '../../../api/schedule';
import { indexToDateTime, toDateStr, lessonToBooking } from './utils';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useSchedule } from './hooks/useSchedule';
import { usePopupPosition } from './hooks/usePopupPosition';
import { Toolbar } from './components/Toolbar';
import { DaySummary } from './components/DaySummary';
import { RightPanel } from './components/RightPanel';
import { Grid } from './components/ScheduleGrid/Grid';
import { BookingPopup } from './components/BookingPopup';
import { NewBookingModal } from './components/modals/NewBookingModal';
import { AddClientModal } from './components/modals/AddClientModal';
import * as Icons from '../../../components/Icons';

  // ─── ГЛАВНЫЙ КОМПОНЕНТ ────────────────────────────────────────────────────────
export default function Journal() {
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const today = new Date();

  // 1. СНАЧАЛА ОБЪЯВЛЯЕМ ВСЕ СТЕЙТЫ (Чтобы TypeScript их видел)
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [activeTrainers, setActiveTrainers] = useState<number[]>([]);
  const [activeHalls, setActiveHalls] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'trainers' | 'halls'>('trainers');
  const [popupBooking, setPopupBooking] = useState<Booking | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalBooking, setAddModalBooking] = useState<Booking | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [newBookingSlot, setNewBookingSlot] = useState<{ trainer: number; timeStart: number; timeEnd: number; columnIndex?: number } | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [timeStep, setTimeStep] = useState<number>(15); // 🔥 Шаг времени в минутах (по умолчанию 15)
  // 🔥 СТЕЙТЫ ДЛЯ УМНОГО ВВОДА ВРЕМЕНИ
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month'>('day');
  const [isDraftMode, setIsDraftMode] = useState(false); // Режим черновика

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionReason, setTransitionReason] = useState<'date' | 'mode' | 'view' | null>(null);

  const [isEditingDate, setIsEditingDate] = useState(false);
  const [dateInputVal, setDateInputVal] = useState("");
  // Компактная шапка колонок при скролле расписания (гистерезис против дребезга)
  const [compactHeaders, setCompactHeaders] = useState(false);


  // 2. ДАЛЕЕ ИДУТ УТИЛИТЫ И ФУНКЦИИ

  // Реальные данные: тренеры (Сотрудники), залы, занятия за видимый диапазон
  const { trainers, halls, bookings, setBookings } = useSchedule(calYear, calMonth, selectedDay, calendarView);
  const hallNames = halls.map(h => h.name);

  // При загрузке данных включаем все колонки/залы в фильтрах
  useEffect(() => { setActiveTrainers(trainers.map(t => t.id)); }, [trainers]);
  useEffect(() => { setActiveHalls(halls.map(h => h.name)); }, [halls]);

  const { previewRef, modalRef, gridWrapperRef, popupRef, newFormPos, popupPos } = usePopupPosition({
    popupBooking,
    isEditingBooking: false, // Заглушка
    editFormTimeStart: 0,    // Заглушка
    editFormTimeEnd: 0,      // Заглушка
    editFormHall: '',        // Заглушка
    showNewForm,
    newBookingSlot
  });

  const withAnimation = (reason: 'date' | 'mode' | 'view', action: () => void) => {
    setTransitionReason(reason);
    setIsTransitioning(true);
    setTimeout(() => {
      action();
      setIsTransitioning(false);
    }, 250);
  };

  // 🔥 Генерируем 7 дней текущей недели
  const getWeekDays = () => {
    const date = new Date(calYear, calMonth, selectedDay);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Смещение к понедельнику
    const monday = new Date(date.setDate(diff));
    
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  };

  // ── Колонки по режиму (Если неделя - отдаем даты, иначе тренеров/залы) ──
  const columns = calendarView === 'week' 
    ? getWeekDays()
    : (viewMode === 'trainers'
      ? trainers.filter(t => activeTrainers.includes(t.id))
      : hallNames.filter(h => activeHalls.includes(h)));
  
  const activeBookings = bookings;

  // ── Фильтрованные записи ──
  const filteredBookings = activeBookings.filter(b => {
    if (viewMode === 'trainers') return activeTrainers.includes(b.trainer);
    return activeHalls.includes(b.hall);
  });

  const closeNewForm = () => {
    setShowNewForm(false);
    setNewBookingSlot(null);
  };

  // ── Открыть форму нового слота (Всегда 1 час или заполнить остаток) ──
  const openNewSlot = (
    trainerIdx: number,
    timeIdx: number,
    columnIndex: number // 🔥 ДОБАВИЛИ ЭТОТ ПАРАМЕТР
  ) => {
    const blockStart = timeIdx;
    const blockEnd   = timeIdx + 1;

    // 🔥 Сохраняем индекс колонки в стейт
    setNewBookingSlot({ trainer: trainerIdx, timeStart: blockStart, timeEnd: blockEnd, columnIndex });
    setShowNewForm(true);
  };

  // Закрытие popup при клике вне
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      
      // 🔥 ФИКС: Если мы кликнули по элементу (например, времени), и он тут же исчез из DOM — игнорируем!
      if (!document.contains(target)) return;

      // 1. Если кликнули внутри попапа (по кнопке) — не закрываем, пусть кнопка отработает
      if (popupRef.current && popupRef.current.contains(target)) return;

      // 2. Если кликнули по любой карточке занятия — игнорируем! 
      if (target.closest('.booking-card')) return;

      // 3. В остальных случаях (клик по фону, пустой сетке, тулбару) — закрываем окно
      setPopupBooking(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Тост
  const showToast = React.useCallback((msg: string) => {
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current as any);
    }

    // 🔥 Сбрасываем стейт на 10 миллисекунд, чтобы React "пересоздал" тост 
    // и заново проиграл красивую анимацию появления
    setToast(null);
    setTimeout(() => {
      setToast(msg);
    }, 10);

    toastTimer.current = window.setTimeout(() => {
      setToast(null);
    }, 4000) as any;
  }, []);
  

  // ── Мини-календарь ──
  const changeMonth = (dir: number) => {
    let m = calMonth + dir;
    let y = calYear;
    if (m > 11) { m = 0; y++; }
    if (m < 0) { m = 11; y--; }
    setCalMonth(m);
    setCalYear(y);
  };

  const changeDay = (dir: number) => {
    // 🔥 Если режим недели, то шагаем по 7 дней, иначе по 1
    const step = calendarView === 'week' ? dir * 7 : dir; 
    const targetDate = new Date(calYear, calMonth, selectedDay + step);
    
    setCalYear(targetDate.getFullYear());
    setCalMonth(targetDate.getMonth());
    setSelectedDay(targetDate.getDate());
  };

  // ── Прямое сохранение переноса/растягивания: diff → PATCH, при ошибке откат ──
  const commitBookingChange = React.useCallback((prev: Booking, next: Booking) => {
    const payload: Partial<LessonCreate> = {};
    if (next.date && (next.timeStart !== prev.timeStart || next.date !== prev.date)) {
      payload.start_time = indexToDateTime(next.date, next.timeStart);
    }
    if (next.timeEnd - next.timeStart !== prev.timeEnd - prev.timeStart) {
      payload.duration_min = Math.round((next.timeEnd - next.timeStart) * 60);
    }
    if (next.trainer !== prev.trainer) payload.teacher_id = next.trainer;
    if (next.hall !== prev.hall) {
      const hall = halls.find(h => h.name === next.hall);
      if (hall) payload.hall_id = hall.id;
    }
    if (Object.keys(payload).length === 0) return;

    scheduleApi.updateLesson(next.id, payload).catch(() => {
      setBookings(bs => bs.map(b => (b.id === prev.id ? prev : b)));
      showToast('Не удалось сохранить — изменение отменено');
    });
  }, [halls, setBookings, showToast]);

  const { drag, wasDragging, initDrag } = useDragAndDrop({
    bookings,
    setBookings,
    viewMode,
    calendarView,
    columns,
    timeStep,
    showToast,
    onCommit: commitBookingChange
  });

  const handleDateInputSubmit = () => {
    setIsEditingDate(false);
    const clean = dateInputVal.trim();
    if (!clean) return;

    // Разделяем ввод по точкам, слэшам, тире или пробелам
    const parts = clean.split(/[\.\/\-\s]+/);
    if (parts.length === 0) return;

    let day = parseInt(parts[0], 10);
    // Если месяц не ввели, берем текущий открытый месяц
    let month = parts[1] ? parseInt(parts[1], 10) - 1 : calMonth;
    // Если год не ввели, берем текущий открытый год
    let year = parts[2] ? parseInt(parts[2], 10) : calYear;

    // Если ввели короткий год (например, 26 вместо 2026), превращаем его в 2026
    if (parts[2] && parts[2].length === 2) {
      year = 2000 + year;
    }

    const parsedDate = new Date(year, month, day);

    // Проверяем, что дата реальная (чтобы не пропустить какой-нибудь 32-й мартобря)
    if (!isNaN(parsedDate.getTime()) && parsedDate.getDate() === day && parsedDate.getMonth() === month) {
      setCalYear(parsedDate.getFullYear());
      setCalMonth(parsedDate.getMonth());
      setSelectedDay(parsedDate.getDate());
    } else {
      showToast("Неверный формат даты");
    }
  };

  // ── Тоггл тренера ──
  const toggleTrainer = (id: number) => {
    setActiveTrainers(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(t => t !== id) : prev) : [...prev, id]
    );
  };

  // ── Тоггл зала ──
  const toggleHall = (h: string) => {
    setActiveHalls(prev =>
      prev.includes(h) ? (prev.length > 1 ? prev.filter(x => x !== h) : prev) : [...prev, h]
    );
  };
  
  // ── Открыть popup записи ──
  const openBookingPopup = (e: React.MouseEvent, booking: Booking) => {
    e.stopPropagation();
    setPopupBooking(booking);
  };

  // ── Отменить занятие (сервер помечает cancelled + снимает записи каскадом) ──
  const deleteBooking = (id: number) => {
    setPopupBooking(null);
    scheduleApi.cancelLesson(id)
      .then(() => {
        setBookings(prev => prev.map(b => (b.id === id ? { ...b, status: 'cancelled' as const, clients: 0 } : b)));
        showToast('Занятие отменено');
      })
      .catch((e: Error) => showToast(e.message || 'Не удалось отменить занятие'));
  };

  // ── Создать занятие на сервере (данные формы приходят из модалки) ──
  const createLessonFromModal = (form: { title: string; hall: string; maxClients: number }) => {
    if (!newBookingSlot) return;
    if (!trainers.some(t => t.id === newBookingSlot.trainer)) {
      showToast('Выберите тренера');
      return;
    }
    // В недельном виде колонка слота — дата, в дневном — выбранный день
    const col = newBookingSlot.columnIndex != null ? columns[newBookingSlot.columnIndex] : null;
    const dateStr = col instanceof Date ? toDateStr(col) : toDateStr(new Date(calYear, calMonth, selectedDay));

    scheduleApi.createLesson({
      name: form.title,
      teacher_id: newBookingSlot.trainer,
      hall_id: halls.find(h => h.name === form.hall)?.id ?? null,
      start_time: indexToDateTime(dateStr, newBookingSlot.timeStart),
      duration_min: Math.round((newBookingSlot.timeEnd - newBookingSlot.timeStart) * 60),
      total_spots: form.maxClients,
    })
      .then(lesson => {
        const colorByTeacher = new Map(trainers.map(t => [t.id, t.color]));
        setBookings(prev => [...prev, lessonToBooking(lesson, halls, colorByTeacher)]);
        showToast('Занятие добавлено');
      })
      .catch((e: Error) => showToast(e.message || 'Не удалось создать занятие'));
  };

  // ── Добавить клиента ──
  const openAddClient = (booking: Booking) => {
    setAddModalBooking(booking);
    setPopupBooking(null);
    setShowAddModal(true);
  };

  const confirmAddClients = async (clientIds: number[]) => {
    if (!addModalBooking) return;
    setShowAddModal(false);

    const results = await Promise.allSettled(
      clientIds.map(id => scheduleApi.createReservation(id, addModalBooking.id))
    );
    const ok = results.filter(r => r.status === 'fulfilled').length;

    if (ok > 0) {
      setBookings(prev => prev.map(b =>
        b.id === addModalBooking.id ? { ...b, clients: b.clients + ok } : b
      ));
    }

    if (ok === clientIds.length) {
      showToast(`Записано: ${ok} клиент(а)`);
    } else {
      const firstError = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
      showToast(`Записано ${ok} из ${clientIds.length}: ${firstError.reason?.message ?? 'ошибка'}`);
    }
  };

  // ── Статистика дня ──
  const totalClasses = filteredBookings.length;
  const totalClients = filteredBookings.reduce((s, b) => s + b.clients, 0);
  const avgLoad = filteredBookings.length > 0
    ? Math.round(filteredBookings.reduce((s, b) => s + (b.maxClients > 0 ? b.clients / b.maxClients : 0), 0) / filteredBookings.length * 100)
    : 0;
  const pending = filteredBookings.filter(b => b.status === 'pending').length;

  return (
    <>

      {/* Стало: */}
      <div className={`j-root ${drag ? 'is-dragging-global' : ''}`}>
        <div className="j-main">

          {/* ── ТУЛБАР ── */}
          <Toolbar
            trainers={trainers}
            halls={hallNames}
            selectedDay={selectedDay}
            calMonth={calMonth}
            calYear={calYear}
            viewMode={viewMode}
            activeTrainers={activeTrainers}
            activeHalls={activeHalls}
            calendarView={calendarView}
            isEditingDate={isEditingDate}
            dateInputVal={dateInputVal}
            changeDay={(dir) => withAnimation('date', () => changeDay(dir))}
            setViewMode={(m) => withAnimation('mode', () => setViewMode(m))}
            setCalendarView={(v) => withAnimation('view', () => setCalendarView(v))}
            onGoToToday={() => withAnimation('date', () => {
              setSelectedDay(today.getDate());
              setCalMonth(today.getMonth());
              setCalYear(today.getFullYear());
            })}
            toggleTrainer={toggleTrainer}
            toggleHall={toggleHall}
            handleDateInputSubmit={handleDateInputSubmit}
            setIsEditingDate={setIsEditingDate}
            setDateInputVal={setDateInputVal}
          />

          {/* ── СВОДКА ДНЯ ── */}
          <DaySummary
            totalClasses={totalClasses}
            totalClients={totalClients}
            avgLoad={avgLoad}
            pending={pending}
            activeTrainersCount={trainers.filter(t => activeTrainers.includes(t.id)).length}
            timeStep={timeStep}
            setTimeStep={setTimeStep}
            isDraftMode={isDraftMode}
            setIsDraftMode={setIsDraftMode}
            showToast={showToast}
          />

          {/* ── СЕТКА ── */}
          <div className="j-layout">
            <div
              className={`j-grid-wrapper${compactHeaders ? ' j-hdr-compact' : ''}`}
              ref={gridWrapperRef}
              onScroll={e => {
                const st = e.currentTarget.scrollTop;
                setCompactHeaders(prev => (prev ? st > 8 : st > 56));
              }}
            >
              <Grid
                isTransitioning={isTransitioning}
                transitionReason={transitionReason} // 🔥 Передаем причину в Сетку
                calendarView={calendarView}
                columns={columns}
                viewMode={viewMode}
                filteredBookings={filteredBookings}
                hoveredSlot={hoveredSlot}
                setHoveredSlot={setHoveredSlot}
                isDraftMode={isDraftMode}
                showNewForm={showNewForm}
                popupBooking={popupBooking}
                drag={drag}
                wasDragging={wasDragging}
                openNewSlot={openNewSlot}
                newBookingSlot={newBookingSlot}
                newForm={{ title: '', hall: hallNames[0] ?? '', maxClients: '8' }}
                previewRef={previewRef}
                initDrag={initDrag}
                setPopupBooking={setPopupBooking}
                openBookingPopup={openBookingPopup}
                showToast={showToast}
              />
            </div>

            {/* ── ПРАВАЯ ПАНЕЛЬ ── */}
            <div className="j-right">
              <RightPanel
                trainers={trainers}
                halls={halls}
                calMonth={calMonth}
                calYear={calYear}
                selectedDay={selectedDay}
                today={today}
                activeHalls={activeHalls}
                activeBookings={activeBookings}
                filteredBookings={filteredBookings}
                changeMonth={changeMonth}
                setSelectedDay={setSelectedDay}
                toggleHall={toggleHall}
                calendarView={calendarView}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── ПРЕМИАЛЬНЫЙ POPUP КАРТОЧКИ ЗАПИСИ ── */}
      {popupBooking && (
        <BookingPopup
          trainers={trainers}
          halls={hallNames}
          popupBooking={popupBooking}
          popupRef={popupRef}
          popupPos={popupPos}
          isDraftMode={isDraftMode}
          timeStep={timeStep}
          setPopupBooking={setPopupBooking}
          setBookings={setBookings}
          deleteBooking={deleteBooking}
          openAddClient={openAddClient}
          showToast={showToast}
        />
      )}

      {/* ── ФОРМА НОВОГО ЗАНЯТИЯ (PREMIUM KEYPAD) ── */}
      {showNewForm && newBookingSlot && (
        <NewBookingModal
          trainers={trainers}
          halls={hallNames}
          newBookingSlot={newBookingSlot}
          setNewBookingSlot={setNewBookingSlot}
          newFormPos={newFormPos}
          modalRef={modalRef}
          timeStep={timeStep}
          closeNewForm={closeNewForm}
          onCreate={createLessonFromModal}
        />
      )}

      {showAddModal && addModalBooking && (
        <AddClientModal
          booking={addModalBooking}
          onClose={() => setShowAddModal(false)}
          onAdd={confirmAddClients}
        />
      )}

      {/* ── ТОСТ ── */}
      {toast && (
        <div className="toast">
          <span style={{ color: 'var(--peach)' }}><Icons.Check /></span>
          {toast}
        </div>
      )}
    </>
  );
}