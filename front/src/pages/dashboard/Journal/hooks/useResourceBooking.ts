import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '../../../../components/ui/index';
import { hybridApi } from '../../../../api/booking/hybrid.api';
import { scheduleApi } from '../../../../api/schedule';
import { servicesApi } from '../../../../api/studio/services.api';
import { studioApi } from '../../../../api/studio/studio.api';
import { errorMessage } from '../../../../api/errorMessage';
import { queryKeys } from '../../../../api/queryKeys';
import { usePriceLabel } from '../../../../hooks/usePriceLabel';
import { useDurationLabel } from '../../../../hooks/useDurationLabel';
import { useStudioCurrency } from '../../../../hooks/useStudioCurrency';
import { formatMoney } from '../../../../lib/money';
import type { AvailabilitySlot, QuoteRead } from '../../../../api/booking/hybrid.types';
import type { ServiceRead } from '../../../../api/studio/services.api';
import { useResourceBookingChoice } from './useResourceBookingChoice';

export type ResourceBookingOptions = {
  onClose: () => void;
  onCreated: () => void;
  clientId?: number | null;
  defaultDate?: string;
  defaultServiceId?: number;
  teacherId?: number | null;
};

const EMPTY_LINKS: never[] = [];

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Индивидуальная запись без разметки: выбор, свободное время, quote/confirm.
 *
 * Одна логика на два вида формы — шит (телефон, карточка клиента, тулбар) и
 * клавиатурное окно у клетки сетки на десктопе. Две копии разошлись бы на
 * первой же правке правил записи.
 *
 * Запись идёт теми же quote/confirm, что и в Mini-app (§6.3). Прямого INSERT
 * из журнала нет и не будет: иначе правила покрытия, буферов и занятости
 * пришлось бы держать во второй реализации.
 */
export function useResourceBooking({
  onClose, onCreated, clientId = null, defaultDate, defaultServiceId, teacherId: initialTeacherId = null,
}: ResourceBookingOptions) {
  const { t } = useTranslation(['journal', 'common']);
  const toast = useToast();

  const [chosenServiceId, setServiceId] = useState<number | null>(defaultServiceId ?? null);
  const [chosenBranchId, setBranchId] = useState<number | null>(null);
  const [chosenTeacherId, setTeacherId] = useState<number | null>(initialTeacherId);
  const [client, setClient] = useState<number | null>(clientId);
  const [date, setDate] = useState(defaultDate ?? iso(new Date()));
  const [quote, setQuote] = useState<QuoteRead | null>(null);
  const [saving, setSaving] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const quoteVersion = useRef(0);
  const resetQuote = () => { quoteVersion.current += 1; setQuote(null); setQuoting(false); };

  const { data: services = [], error: servicesError, isPending: servicesLoading } = useQuery({ queryKey: queryKeys.services, queryFn: () => servicesApi.list() });
  const { data: branches = [] } = useQuery({ queryKey: queryKeys.branches, queryFn: () => studioApi.getBranches() });
  // Кто какие услуги ведёт и где принимает. staleTime 0: мастеров услуге
  // назначают и в Каталоге, а тот ключ staff не инвалидирует.
  const { data: links, error: linksError, isPending: linksLoading } = useQuery({
    queryKey: queryKeys.resourceStaff, queryFn: () => hybridApi.resourceStaff(), staleTime: 0,
  });

  // Только услуги с механикой resource: событие создаётся другой формой.
  const bookable = useMemo(() => {
    return services.filter(s => s.booking_mode === 'resource' && s.is_bookable);
  }, [services]);
  const choice = useResourceBookingChoice({
    services: bookable, branches, links: links?.staff ?? EMPTY_LINKS,
    serviceId: chosenServiceId, branchId: chosenBranchId, teacherId: chosenTeacherId,
  });
  const { service: serviceId, branch: branchId, teacher: teacherId } = choice;
  const loadingChoice = servicesLoading || linksLoading;

  // Цена по правилу всего продукта: пока мастер не выбран — «от–до» по
  // мастерам услуги, у выбранного мастера — его сумма. Узнавать её только
  // после выбора времени, из итоговой карточки, — поздно: человек выбирает
  // мастера в том числе по цене.
  // Рядом с ценой — время, по тому же правилу: у мастера оно своё.
  const priceLabel = usePriceLabel();
  const durationLabel = useDurationLabel();
  const currency = useStudioCurrency();
  const chosenService = choice.serviceOptions.find(s => s.id === serviceId);
  const rangeOf = (s: ServiceRead) => `${priceLabel(s.price_min ?? s.price, s.price_max ?? s.price, true)} · ${
    durationLabel(s.duration_from ?? s.duration_min, s.duration_to ?? s.duration_min)}`;
  /** Минуты услуги у мастера; мастер не выбран или не ведёт её — undefined. */
  const durationAt = (teacher: number | null, service: number | null) => {
    const own = links?.staff.find(m => m.teacher_id === teacher)?.service_durations;
    return service != null ? own?.[service] : undefined;
  };
  const priceAt = (teacher: number | null, service: number | null) => {
    const own = links?.staff.find(m => m.teacher_id === teacher)?.service_prices;
    if (service == null || own?.[service] == null) return undefined;
    const minutes = durationAt(teacher, service);
    return minutes != null
      ? `${formatMoney(own[service], currency)} · ${durationLabel(minutes)}`
      : formatMoney(own[service], currency);
  };
  /** Цена услуги в списке: у выбранного мастера — его, у «любого» — диапазон. */
  const serviceHint = (s: ServiceRead) => priceAt(teacherId, s.id) ?? rangeOf(s);

  // Доступность — обычный запрос react-query: ключ содержит весь выбор, и
  // устаревший ответ прошлой услуги/даты не перезаписывает текущий список.
  const { data: availability, isFetching: slotsLoading, error: slotsError, refetch: refreshSlots } = useQuery({
    queryKey: ['resource-availability', serviceId, branchId, date, teacherId],
    queryFn: () => hybridApi.availability({
      service_id: serviceId!, branch_id: branchId!, date_from: date, date_to: date,
      teacher_id: teacherId ?? undefined,
    }),
    enabled: serviceId != null && branchId != null && !!date,
  });
  const slots: AvailabilitySlot[] = availability?.slots ?? [];
  const reason = availability && availability.slots.length === 0 ? availability.reason ?? 'empty' : null;

  const pick = async (slot: AvailabilitySlot) => {
    if (serviceId == null || branchId == null || client == null || saving) return;
    const version = ++quoteVersion.current;
    setQuoting(true);
    try {
      const request = {
        booking_mode: 'resource' as const, client_id: client, service_id: serviceId,
        branch_id: branchId, teacher_id: slot.teacher_ids[0] ?? null, starts_at: slot.starts_at,
      };
      const result = await hybridApi.quote(request);
      if (version === quoteVersion.current) setQuote(result);
    } catch (err) {
      if (version === quoteVersion.current) toast.error(errorMessage(err, t));
    } finally {
      if (version === quoteVersion.current) setQuoting(false);
    }
  };

  /** Подтвердить запись. Заметка (если есть) ложится в занятие, которое
   *  создала запись: отдельного поля у quote/confirm нет, а заметка — свойство
   *  занятия, как и у события (PATCH её пускает всегда, даже у прошедшего). */
  const confirm = async (note?: { notes: string; photos: string[] }) => {
    if (!quote || saving) return;
    setSaving(true);
    try {
      const booked = await hybridApi.confirm(quote.quote_id);
      if (note && (note.notes || note.photos.length > 0)) {
        try {
          await scheduleApi.updateLesson(booked.lesson_id, { notes: note.notes, photos: note.photos });
        } catch (err) {
          // Запись уже состоялась — откатывать её из-за заметки нельзя.
          // Говорим, что заметка не сохранилась: её можно дописать в карточке.
          toast.error(errorMessage(err, t));
        }
      }
      onCreated();
      onClose();
    } catch (err) {
      // Слот мог уйти между показом и подтверждением — форма остаётся
      // открытой, время перечитывается.
      setQuote(null);
      void refreshSlots();
      toast.error(errorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  // Любая смена выбора обнуляет уже взятые условия: они были посчитаны под прошлый.
  return {
    client, setClient: (id: number) => { setClient(id); resetQuote(); },
    setServiceId: (id: number) => { setServiceId(id); resetQuote(); },
    setBranchId: (id: number) => { setBranchId(id); resetQuote(); },
    setTeacherId: (id: number | null) => { setTeacherId(id); resetQuote(); },
    date, setDate: (value: string) => { setDate(value); resetQuote(); },
    choice, serviceId, branchId, teacherId, chosenService, loadingChoice,
    loadError: servicesError ?? linksError,
    rangeOf, priceAt, durationAt, serviceHint,
    slots, reason, slotsLoading, slotsError, refreshSlots,
    quote, quoting, saving, pick, confirm,
  };
}

export type ResourceBooking = ReturnType<typeof useResourceBooking>;
