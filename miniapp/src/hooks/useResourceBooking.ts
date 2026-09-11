import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hybridApi } from '../api/hybrid.api';
import type { AvailabilitySlot, BookingRead, QuoteRead } from '../api/hybrid.types';
import type { TerminologyProfile } from '../api/hybrid.types';
import { getSession } from '../lib/session';
import { bumpLessons } from '../lib/revision';
import { notify } from '../lib/notify';
import { spawnPetals } from '../lib/petals';
import { useTelegram } from './useTelegram';

/**
 * HB-20: индивидуальная запись — выбор специалиста и времени.
 *
 * СОСТОЯНИЯ: `select_time → quote → confirming → active | pending | hold`.
 * Ошибка и просроченный quote возвращают на шаг выбора времени, а не в начало:
 * человек уже выбрал услугу, и заставлять выбирать её заново — наказание за
 * нашу же гонку.
 *
 * ИСТОЧНИК ВРЕМЕНИ — ТОЛЬКО API. Ни собственного календаря, ни «рабочих часов»
 * в этом файле нет: доступность считает сервер по графикам, буферам, чужой
 * занятости и переводу часов (§6.2). Клиент передаёт обратно ТОТ ЖЕ
 * `starts_at`, который получил, — не своё локальное время.
 *
 * УСТАРЕВШИЙ ОТВЕТ НЕ ПЕРЕЗАПИСЫВАЕТ ТЕКУЩИЙ СПИСОК. Каждому запросу выдаётся
 * номер; ответ с чужим номером выбрасывается. Иначе медленный ответ прошлого
 * филиала приезжал бы поверх нового (HB-20 п.3).
 *
 * ЦЕНУ, ДЛИТЕЛЬНОСТЬ И МАСТЕРА НАЗЫВАЕТ СЕРВЕР. Здесь их нет даже в типах
 * запроса: quote возвращает канонические условия, confirm принимает только
 * `quote_id`.
 */
export type ResourceStep = 'select_time' | 'quote' | 'confirming' | 'done';

/** Минимум, который нужен листу: ID для отбора, название для подписи и
 *  необязательный пресет терминологии услуги. Полный каталог здесь не нужен —
 *  «мои записи» его не грузят. */
export type ResourceTarget = {
  id: number;
  name: string;
  terminology_profile?: TerminologyProfile | null;
};

/** Перенос существующей брони: тот же выбор времени, другая пара команд. */
export type MoveTarget = { reservationId: number; version: number };

/**
 * С чем открывать лист, когда мастер и день выбраны ДО него (экран «Записатись»).
 *
 * Отдельным аргументом, а не вызовом `setTeacherId`/`setDate` следом: `open`
 * их сбрасывает, и «открыть, потом доставить» работало бы только по удачному
 * порядку в одном батче. Здесь это одно намерение и одно состояние.
 */
export type OpenPreset = { teacherId?: number | null; date?: Date };

type Options = {
  /** Гость дошёл до quote: поднимаем существующий вход и повторяем шаг. */
  onNeedAuth?: (retry: () => void) => void;
};

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function useResourceBooking({ onNeedAuth }: Options = {}) {
  const { t } = useTranslation();
  const { tg, vibrateMedium } = useTelegram();

  const [service, setService] = useState<ResourceTarget | null>(null);
  const [move, setMove] = useState<MoveTarget | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [teacherId, setTeacherId] = useState<number | null>(null);
  const [date, setDate] = useState(() => new Date());
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<ResourceStep>('select_time');
  const [quote, setQuote] = useState<QuoteRead | null>(null);
  const [booking, setBooking] = useState<BookingRead | null>(null);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [needsSubscription, setNeedsSubscription] = useState<string | null>(null);

  const sequence = useRef(0);

  const open = (picked: ResourceTarget, branch: number | null, moving: MoveTarget | null = null,
                preset: OpenPreset = {}) => {
    setService(picked);
    setMove(moving);
    setBranchId(branch);
    setTeacherId(preset.teacherId ?? null);
    setSlots([]);
    setReason(null);
    setQuote(null);
    setBooking(null);
    setStep('select_time');
    setDate(preset.date ?? new Date());
    vibrateMedium();
  };

  const close = () => setService(null);

  // Перезагрузка — это счётчик, а не вызов функции: setState живёт внутри
  // промис-колбэков эффекта, как на странице расписания. Прямой вызов
  // «функции, которая делает setState» из тела эффекта запрещён правилом
  // react-hooks/set-state-in-effect и действительно даёт каскад рендеров.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    if (!service || !branchId) return;
    const request = ++sequence.current;
    // Скелет по таймеру: на быстром ответе он не появляется вовсе.
    const timer = window.setTimeout(() => setIsLoading(true), 250);

    hybridApi
      .availability({
        service_id: service.id,
        branch_id: branchId,
        date_from: iso(date),
        date_to: iso(date),
        ...(teacherId != null ? { teacher_id: teacherId } : {}),
      })
      .then((data) => {
        if (request !== sequence.current) return;  // Ответ прошлого выбора.
        setSlots(data.slots);
        setReason(data.slots.length === 0 ? data.reason ?? 'empty' : null);
      })
      .catch((error) => {
        if (request !== sequence.current) return;
        setSlots([]);
        setReason('error');
        notify(error instanceof Error ? error.message : t('resource.loadError'));
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (request === sequence.current) setIsLoading(false);
      });

    return () => window.clearTimeout(timer);
  }, [service, branchId, teacherId, date, reloadKey, t]);

  const requestQuote = async (slot: AvailabilitySlot) => {
    if (!service || !branchId) return;
    // Вход поднимается ДО quote: условия персональные (абонемент, пробное,
    // долг), и посчитать их можно только для конкретного человека.
    if (!getSession() && onNeedAuth) {
      onNeedAuth(() => void requestQuote(slot));
      return;
    }
    setStep('quote');
    const request = {
      booking_mode: 'resource' as const,
      service_id: service.id,
      branch_id: branchId,
      // Мастер именно тот, кого показали в слоте: «Любой» превращается в
      // конкретный ID здесь, а не остаётся неопределённым до confirm.
      teacher_id: teacherId ?? slot.teacher_ids[0] ?? null,
      starts_at: slot.starts_at,
    };
    try {
      const created = move
        ? await hybridApi.moveQuote(move.reservationId, request)
        : await hybridApi.quote(request);
      setQuote(created);
    } catch (error) {
      setStep('select_time');
      handleFailure(error);
    }
  };

  const confirm = async () => {
    if (!quote) return;
    setStep('confirming');
    try {
      // Перенос отправляет ожидаемую версию занятия: чужая правка между
      // показом и подтверждением обязана дать VERSION_CONFLICT, а не тихо
      // переписать уже изменённый интервал (§6.5).
      const result = move
        ? await hybridApi.move(move.reservationId, quote.quote_id, move.version)
        : await hybridApi.confirm(quote.quote_id);
      setBooking(result);
      setStep('done');
      bumpLessons();
      spawnPetals();
      if (tg) tg.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      // Конфликт оставляет форму открытой и обновляет время: слот мог уйти
      // между показом и подтверждением, и это нормальный исход, а не сбой.
      setStep('select_time');
      setQuote(null);
      reload();
      handleFailure(error);
    }
  };

  function handleFailure(error: unknown) {
    const status = (error as { status?: number }).status;
    if (status === 428) { setNeedsPhone(true); return; }
    if (status === 402) {
      setNeedsSubscription(error instanceof Error ? error.message : t('subscriptionSheet.hint'));
      return;
    }
    notify(error instanceof Error ? error.message : t('resource.bookError'));
    if (tg) tg.HapticFeedback.notificationOccurred('error');
  }

  return {
    service, move, branchId, teacherId, setTeacherId, date, setDate,
    slots, reason, isLoading, step, quote, booking,
    open, close, requestQuote, confirm, reload,
    back: () => { setQuote(null); setStep('select_time'); },
    needsPhone,
    closePhone: () => setNeedsPhone(false),
    retryAfterPhone: () => { setNeedsPhone(false); reload(); },
    needsSubscription,
    closeSubscription: () => setNeedsSubscription(null),
  };
}
