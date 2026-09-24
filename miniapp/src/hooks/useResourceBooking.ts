import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hybridApi } from '../api/hybrid.api';
import type { ApiError } from '../api/client';
import type { AvailabilitySlot, BookingRead, QuoteRead, TerminologyProfile } from '../api/hybrid.types';
import type { StudioCatalog } from '../api/studio';
import { getSession } from '../lib/session';
import { bumpLessons } from '../lib/revision';
import { spawnPetals } from '../lib/petals';
import {
  availabilityQuery, dayList, firstDayWithSlots, groupByDay, lastBookableDay, pageCount, pageRange,
  studioToday, type IsoDay,
} from '../lib/slots';
import { useTelegram } from './useTelegram';

/**
 * Индивидуальная запись: день, время, условия, подтверждение.
 *
 * СОСТОЯНИЯ: `select_time → quote → confirming → done`. Ошибка и просроченный
 * quote возвращают на выбор времени, а не в начало: услугу и мастера человек
 * уже выбрал, и заставлять выбирать их заново — наказание за нашу же гонку.
 *
 * ВРЕМЯ ГРУЗИТСЯ СТРАНИЦАМИ ДНЕЙ, А НЕ ПО ОДНОМУ ДНЮ. Один запрос на две недели
 * даёт сразу и ленту дней с отметкой «есть время», и ближайший свободный день,
 * и мгновенное переключение дня без скелета. Дальше горизонта студии
 * (`booking_window_days`) лента не идёт.
 *
 * ИСТОЧНИК ВРЕМЕНИ — ТОЛЬКО API. Доступность считает сервер; клиент возвращает
 * ТОТ ЖЕ `starts_at`, который получил, а день и час показывает срезом строки
 * `local_start` (lib/slots.ts). «Сегодня» — в поясе студии.
 *
 * УСТАРЕВШИЙ ОТВЕТ НЕ ПЕРЕЗАПИСЫВАЕТ ТЕКУЩИЙ. Страницы хранятся вместе с
 * ключом выбора (услуга, филиал, мастер, попытка): ответ прошлого мастера не
 * отрисуется под новым.
 *
 * ЦЕНУ, ДЛИТЕЛЬНОСТЬ И МАСТЕРА НАЗЫВАЕТ СЕРВЕР: quote возвращает канонические
 * условия, confirm принимает только `quote_id`.
 */
export type ResourceStep = 'select_time' | 'quote' | 'confirming' | 'done';

/** Минимум, который нужен листу. Длительность и цена — для подзаголовка:
 *  «Мои записи» каталог не грузят, и там строка просто короче. */
export type ResourceTarget = {
  bundle_parts?: string[];
  bundle_full_price_str?: string | null;
  id: number;
  name: string;
  terminology_profile?: TerminologyProfile | null;
  duration_min?: number;
  /** Готовая строка длительности: время выбранного мастера или «от–до».
   *  Есть — побеждает `duration_min`, который про услугу вообще. */
  duration_str?: string;
  price_str?: string;
};

/** Перенос существующей брони: тот же выбор времени, другая пара команд. */
export type MoveTarget = { reservationId: number; version: number };

/**
 * С чем открывать лист, когда мастер выбран ДО него (экран «Записатись»).
 * Одним аргументом с `open`, а не вызовами следом: `open` сбрасывает прошлый
 * выбор, и «открыть, потом доставить» работало бы только по удачному порядку.
 */
export type OpenPreset = { teacherId?: number | null; teacherName?: string | null };

/** Сообщение в листе: код отказа сервера или своё пояснение. Не `alert` —
 *  модальный диалог поверх листа закрывал бы именно то, что надо исправить. */
export type ResourceNotice = { code: string; tone: 'error' | 'info' };

type Options = {
  /** Гость дошёл до quote: поднимаем существующий вход и повторяем шаг. */
  onNeedAuth?: (retry: () => void) => void;
  /** Пояс студии и горизонт записи. Без каталога — день телефона и 60 дней. */
  catalog?: StudioCatalog | null;
};

type Pages = { key: string; slots: AvailabilitySlot[][]; reason: string | null; error: ApiError | null };

/** Отказы, после которых показанное время уже неправда. */
const SLOT_GONE = new Set(['SLOT_UNAVAILABLE', 'CONFIG_INCOMPLETE', 'VERSION_CONFLICT']);

export function useResourceBooking({ onNeedAuth, catalog }: Options = {}) {
  const { t } = useTranslation();
  const { tg, vibrateMedium, vibrateLight } = useTelegram();

  const [service, setService] = useState<ResourceTarget | null>(null);
  const [move, setMove] = useState<MoveTarget | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [teacher, setTeacher] = useState<{ id: number | null; name: string | null }>({ id: null, name: null });
  const [pickedDay, setPickedDay] = useState<IsoDay | null>(null);
  const [wantedPages, setWantedPages] = useState(1);
  const [pages, setPages] = useState<Pages | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState<ResourceStep>('select_time');
  const [quote, setQuote] = useState<QuoteRead | null>(null);
  const [booking, setBooking] = useState<BookingRead | null>(null);
  const [notice, setNotice] = useState<ResourceNotice | null>(null);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [needsSubscription, setNeedsSubscription] = useState<string | null>(null);
  // Слот, по которому просили quote: TERMS_CHANGED пересчитывает ЕГО же.
  const lastSlot = useRef<AvailabilitySlot | null>(null);
  // Чем был открыт лист в прошлый раз: тот же мастер и услуга — тот же день.
  const lastScope = useRef<string | null>(null);

  const today = studioToday(catalog?.studio.tz_iana);
  const lastDay = lastBookableDay(today, catalog?.rules.booking_window_days);
  const totalPages = pageCount(today, lastDay);

  const key = service && branchId ? `${service.id}|${branchId}|${teacher.id ?? 'any'}|${today}|${attempt}` : null;
  const fresh = pages && pages.key === key ? pages : null;
  const loadedPages = fresh?.slots.length ?? 0;
  const loadError = fresh?.error ?? null;

  useEffect(() => {
    if (key === null || !service || !branchId || loadError) return;
    const index = loadedPages;
    if (index >= Math.min(wantedPages, totalPages)) return;
    const range = pageRange(today, index, lastDay);
    if (!range) return;
    let cancelled = false;

    hybridApi
      .availability(availabilityQuery({ serviceId: service.id, branchId, teacherId: teacher.id, from: range.from, to: range.to }))
      .then((data) => {
        if (cancelled) return;
        setPages((prev) => {
          const same = prev && prev.key === key ? prev : null;
          const loaded = same?.slots ?? [];
          if (loaded.length !== index) return prev; // эту страницу уже дописали
          return { key, slots: [...loaded, data.slots], reason: same?.reason ?? data.reason ?? null, error: null };
        });
      })
      .catch((error: ApiError) => {
        if (cancelled) return;
        setPages((prev) => ({ key, slots: prev && prev.key === key ? prev.slots : [], reason: null, error }));
      });

    return () => {
      cancelled = true;
    };
  }, [key, loadedPages, wantedPages, totalPages, loadError, service, branchId, teacher.id, today, lastDay]);

  const slots = useMemo(() => (fresh ? fresh.slots.flat() : []), [fresh]);
  const byDay = useMemo(() => groupByDay(slots), [slots]);
  const loadedTo = loadedPages > 0 ? pageRange(today, loadedPages - 1, lastDay)?.to ?? null : null;
  const days = useMemo(() => (loadedTo ? dayList(today, loadedTo) : []), [today, loadedTo]);
  // День, выбранный человеком, — если он в загруженных; иначе ближайший со временем.
  const day = pickedDay && days.includes(pickedDay) ? pickedDay : firstDayWithSlots(days, byDay);
  const isLoading = key !== null && !loadError && loadedPages < Math.min(wantedPages, totalPages);

  const open = (picked: ResourceTarget, branch: number | null, moving: MoveTarget | null = null,
                preset: OpenPreset = {}) => {
    const scope = `${picked.id}|${branch}|${preset.teacherId ?? 'any'}|${moving?.reservationId ?? ''}`;
    setService(picked);
    setMove(moving);
    setBranchId(branch);
    setTeacher({ id: preset.teacherId ?? null, name: preset.teacherName ?? null });
    if (scope !== lastScope.current) setPickedDay(null);
    lastScope.current = scope;
    setWantedPages(1);
    // Каждое открытие — свежее время: пока лист был закрыт, окно могли занять.
    setAttempt((value) => value + 1);
    setQuote(null);
    setBooking(null);
    setNotice(null);
    setStep('select_time');
    lastSlot.current = null;
    vibrateMedium();
  };

  const close = () => setService(null);

  // Перечитать время: смена ключа сама запускает загрузку заново.
  const reload = () => setAttempt((value) => value + 1);

  function handleFailure(error: ApiError) {
    if (error.status === 428) {
      setNeedsPhone(true);
      return;
    }
    if (error.status === 402) {
      setNeedsSubscription(error.code ? t('subscriptionSheet.hint') : error.message);
      return;
    }
    setNotice({ code: error.code ?? 'UNKNOWN', tone: 'error' });
    if (tg) tg.HapticFeedback.notificationOccurred('error');
  }

  const requestQuote = async (slot: AvailabilitySlot, refreshed = false) => {
    if (!service || !branchId) return;
    // Вход поднимается ДО quote: условия персональные (абонемент, пробное,
    // долг), и посчитать их можно только для конкретного человека.
    if (!getSession() && onNeedAuth) {
      onNeedAuth(() => void requestQuote(slot));
      return;
    }
    lastSlot.current = slot;
    setNotice(refreshed ? { code: 'TERMS_REFRESHED', tone: 'info' } : null);
    setQuote(null);
    setStep('quote');
    const request = {
      booking_mode: 'resource' as const,
      service_id: service.id,
      branch_id: branchId,
      // Мастер именно тот, кого показали в слоте: «Любой» превращается в
      // конкретный ID здесь (сервер отдаёт teacher_ids по возрастанию — это и
      // есть его правило «минимальный свободный»), а не остаётся
      // неопределённым до confirm.
      teacher_id: teacher.id ?? slot.teacher_ids[0] ?? null,
      starts_at: slot.starts_at,
    };
    try {
      const created = move
        ? await hybridApi.moveQuote(move.reservationId, request)
        : await hybridApi.quote(request);
      setQuote(created);
    } catch (error) {
      const failure = error as ApiError;
      setStep('select_time');
      handleFailure(failure);
      if (failure.code && SLOT_GONE.has(failure.code)) reload();
    }
  };

  const confirm = async () => {
    if (!quote) return;
    setStep('confirming');
    try {
      // Перенос отправляет ожидаемую версию занятия: чужая правка между
      // показом и подтверждением обязана дать VERSION_CONFLICT (§6.5).
      const result = move
        ? await hybridApi.move(move.reservationId, quote.quote_id, move.version)
        : await hybridApi.confirm(quote.quote_id);
      setBooking(result);
      setNotice(null);
      setStep('done');
      bumpLessons();
      spawnPetals();
      if (tg) tg.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      const failure = error as ApiError;
      // Нужен телефон — условия те же, после сохранения номера подтверждают снова.
      if (failure.status === 428) {
        setStep('quote');
        setNeedsPhone(true);
        return;
      }
      // Условия изменились или quote истёк: тот же слот, новые условия — и
      // подтверждать их человек обязан заново (MA-06). Если слот ушёл,
      // пересчёт сам вернёт к выбору времени.
      if ((failure.code === 'TERMS_CHANGED' || failure.code === 'QUOTE_EXPIRED') && lastSlot.current) {
        await requestQuote(lastSlot.current, true);
        return;
      }
      // Слот заняли между показом и подтверждением — нормальный исход, а не
      // сбой: форма остаётся открытой, время перечитывается.
      setQuote(null);
      setStep('select_time');
      reload();
      handleFailure(failure);
    }
  };

  return {
    service, move, branchId,
    teacherId: teacher.id, teacherName: teacher.name,
    today, lastDay, days, day, byDay,
    slotsOfDay: day ? byDay.get(day) ?? [] : [],
    reason: fresh?.reason ?? null,
    loadError,
    isLoading,
    /** Ещё ничего не пришло — лента дней и время рисуются скелетом. */
    isFirstLoad: isLoading && loadedPages === 0,
    hasMore: !isLoading && !loadError && loadedPages > 0 && loadedPages < totalPages,
    loadMore: () => setWantedPages(Math.max(wantedPages, loadedPages + 1)),
    retryLoad: () => setPages((prev) => (prev ? { ...prev, error: null } : prev)),
    pickDay: (next: IsoDay) => {
      setPickedDay(next);
      vibrateLight();
    },
    step, quote, booking, notice,
    open, close, requestQuote, confirm, reload,
    back: () => {
      setQuote(null);
      setNotice(null);
      setStep('select_time');
    },
    needsPhone,
    closePhone: () => setNeedsPhone(false),
    retryAfterPhone: () => {
      setNeedsPhone(false);
      if (quote) void confirm();
      else reload();
    },
    needsSubscription,
    closeSubscription: () => setNeedsSubscription(null),
  };
}
