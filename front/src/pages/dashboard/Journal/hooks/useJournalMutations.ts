// Все пути записи Журнала (создать/перенести/растянуть/изменить/отменить
// занятие; записать/снять/отметить клиента) — на useMutation: мгновенный
// оптимистичный патч кэша ['journal-lessons', from, to] в onMutate → запрос →
// на ошибке откат к снапшоту в onError → invalidate в onSettled (подтягивает
// реальные поля с сервера, напр. id нового занятия).
// Каждая мутация возвращает { prev, next } — фундамент для Undo/Redo (V4-3).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { scheduleApi } from '../../../../api/schedule';
import type { LessonCreate } from '../../../../api/schedule/schedule.types';
import { queryKeys } from '../../../../api/queryKeys';
import type { Booking } from '../types';

export interface MutationResult {
  prev: Booking | null;
  next: Booking | null;
}

export interface ReservationMutationResult extends MutationResult {
  reservationId: number; // id резервации на сервере — нужен undo (V4-3, задача 6)
}

export interface Snapshot {
  snapshot: Booking[];
}

// Ключ занятий — диапазон видимых дат, меняется при листании; передаём извне
// (useSchedule), а не пересчитываем здесь, чтобы не разъехаться с тем, что
// реально показывает сетка.
export function useJournalMutations(lessonsKey: readonly unknown[]) {
  const qc = useQueryClient();

  const patchCache = async (fn: (prev: Booking[]) => Booking[]): Promise<Snapshot> => {
    // Сначала отменяем GET занятий в полёте (refetchInterval, refetchOnWindowFocus
    // при переключении окон): иначе его ответ со СТАРЫМИ данными приедет после
    // оптимистичного патча и перетрёт его — карточка «дёргается назад».
    await qc.cancelQueries({ queryKey: queryKeys.journalLessonsAll });
    const snapshot = qc.getQueryData<Booking[]>(lessonsKey) ?? [];
    qc.setQueryData<Booking[]>(lessonsKey, fn(snapshot));
    return { snapshot };
  };

  const rollback = (ctx: Snapshot | undefined) => {
    if (ctx) qc.setQueryData(lessonsKey, ctx.snapshot);
  };

  // Все диапазоны журнала, не только видимый: занятие одновременно живёт в
  // ключе дня, недели и в префетчнутых соседях — иначе после правки листание
  // на свежепрефетчнутый (< staleTime) диапазон покажет устаревшие данные.
  // journalDays — точки мини-календаря: создание/отмена занятия могут зажечь
  // или погасить точку дня (задача 5 V4-5).
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.journalLessonsAll });
    qc.invalidateQueries({ queryKey: queryKeys.journalDaysAll });
  };

  // ── Перенос / растяжение / правка из попапа: один PATCH-путь ──
  const updateMut = useMutation({
    mutationFn: ({ next, payload }: { prev: Booking; next: Booking; payload: Partial<LessonCreate> }) =>
      scheduleApi.updateLesson(next.id, payload),
    onMutate: ({ prev, next }) => patchCache(list => list.map(b => (b.id === prev.id ? next : b))),
    onError: (_err, _vars, ctx) => rollback(ctx),
    onSettled: () => invalidate(),
  });
  const updateLesson = async (prev: Booking, next: Booking, payload: Partial<LessonCreate>): Promise<MutationResult> => {
    await updateMut.mutateAsync({ prev, next, payload });
    return { prev, next };
  };

  // ── Отменить занятие: статус → cancelled, места обнуляются ──
  const cancelMut = useMutation({
    mutationFn: (booking: Booking) => scheduleApi.cancelLesson(booking.id),
    onMutate: (booking: Booking) =>
      patchCache(list => list.map(b => (b.id === booking.id ? { ...b, status: 'cancelled' as const, clients: 0 } : b))),
    onError: (_err, _vars, ctx) => rollback(ctx),
    onSettled: () => invalidate(),
  });
  const cancelLesson = async (booking: Booking): Promise<MutationResult> => {
    const next: Booking = { ...booking, status: 'cancelled', clients: 0 };
    await cancelMut.mutateAsync(booking);
    return { prev: booking, next };
  };

  // ── Отмена занятия отложенным коммитом (V4-3, задача 5): единственная
  // необратимая операция (каскад по клиентам + уведомления) не уходит на
  // сервер сразу. Патчим кэш локально и возвращаем снапшот для отката +
  // коммит-функцию, которую вызывающий стреляет по истечении undo-тоста.
  const patchLocalCancelled = async (booking: Booking): Promise<Snapshot> =>
    patchCache(list => list.map(b => (b.id === booking.id ? { ...b, status: 'cancelled' as const, clients: 0 } : b)));
  const commitDeferredCancel = (lessonId: number) => scheduleApi.cancelLesson(lessonId);

  // ── Создать занятие: оптимистичная карточка (временный id) → invalidate заменяет реальной ──
  const createMut = useMutation({
    mutationFn: ({ payload }: { payload: LessonCreate; optimisticBooking: Booking }) =>
      scheduleApi.createLesson(payload),
    onMutate: ({ optimisticBooking }) => patchCache(list => [...list, optimisticBooking]),
    onError: (_err, _vars, ctx) => rollback(ctx),
    onSettled: () => invalidate(),
  });
  const createLesson = async (payload: LessonCreate, optimisticBooking: Booking): Promise<MutationResult> => {
    await createMut.mutateAsync({ payload, optimisticBooking });
    return { prev: null, next: optimisticBooking };
  };

  // ── Записать одного клиента: +1 к счётчику мест (пачка — по одному вызову на клиента) ──
  const addReservationMut = useMutation({
    mutationFn: ({ clientId, booking }: { clientId: number; booking: Booking }) =>
      scheduleApi.createReservation(clientId, booking.id),
    onMutate: ({ booking }) => patchCache(list => list.map(b => (b.id === booking.id ? { ...b, clients: b.clients + 1 } : b))),
    onError: (_err, _vars, ctx) => rollback(ctx),
    onSettled: () => invalidate(),
  });
  const addReservation = async (clientId: number, booking: Booking): Promise<ReservationMutationResult> => {
    const next: Booking = { ...booking, clients: booking.clients + 1 };
    const reservation = await addReservationMut.mutateAsync({ clientId, booking });
    return { prev: booking, next, reservationId: reservation.id };
  };

  // ── Снять клиента с занятия: -1 к счётчику мест ──
  const cancelReservationMut = useMutation({
    mutationFn: ({ reservationId }: { reservationId: number; booking: Booking }) =>
      scheduleApi.cancelReservation(reservationId),
    onMutate: ({ booking }) =>
      patchCache(list => list.map(b => (b.id === booking.id ? { ...b, clients: Math.max(0, b.clients - 1) } : b))),
    onError: (_err, _vars, ctx) => rollback(ctx),
    onSettled: () => invalidate(),
  });
  const cancelReservation = async (reservationId: number, booking: Booking): Promise<MutationResult> => {
    const next: Booking = { ...booking, clients: Math.max(0, booking.clients - 1) };
    await cancelReservationMut.mutateAsync({ reservationId, booking });
    return { prev: booking, next };
  };

  // ── Отметить посещение: не меняет счётчик мест сетки — список записанных
  // клиентов живёт отдельным локальным стейтом попапа (BookingPopup), кэш
  // занятий здесь не трогаем, только сам запрос.
  const attendMut = useMutation({
    mutationFn: (reservationId: number) => scheduleApi.attendReservation(reservationId),
  });
  const attendReservation = (reservationId: number) => attendMut.mutateAsync(reservationId);

  return {
    updateLesson,
    cancelLesson,
    createLesson,
    addReservation,
    cancelReservation,
    attendReservation,
    patchLocalCancelled,
    commitDeferredCancel,
    rollback,
  };
}
