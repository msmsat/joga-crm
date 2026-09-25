import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '../../../../../../components/ui/index';
import { scheduleApi } from '../../../../../../api/schedule';
import { servicesApi, type ServiceRead } from '../../../../../../api/studio/services.api';
import { studioApi } from '../../../../../../api/studio/studio.api';
import { errorMessage } from '../../../../../../api/errorMessage';
import { queryKeys } from '../../../../../../api/queryKeys';
import { useResourceBooking } from '../../../hooks/useResourceBooking';
import { useBusinessTerms } from '../../../../../../hooks/useBusinessTerms';
import { staffApi } from '../../../../../../api/staff';
import { clientsApi } from '../../../../../../api/clients/clients.api';
import { formatMoney } from '../../../../../../lib/money';
import { useStudioCurrency } from '../../../../../../hooks/useStudioCurrency';
import { staffToTrainer } from '../../../utils';
import type { Hall, Trainer } from '../../../types';
import { listedTimes, toDateStr } from '../../../utils';
import { eventFreeTimes, toHHMM } from './freeTimes';

const NO_HALLS: Hall[] = [];

export type WizardOptions = {
  /** Мастер колонки, по которой тапнули; null — неделя, кнопка, карточка клиента. */
  defaultTeacherId: number | null;
  defaultDate: string;
  defaultTime?: string;
  /** Карточка клиента открывает запись с уже выбранным человеком — шаг 1 пропускается. */
  clientId?: number | null;
  onClose: () => void;
  onCreated: () => void;
};

export type WizardMaster = { id: number | null; name: string };

export const WIZARD_STEPS = 5;
/** Последний шаг — проверка всего выбранного перед записью. */
export const SUMMARY_STEP = 4;

/**
 * Запись на телефоне по шагам: клиент → услуга → мастер → дата и время →
 * проверка. На проверке у каждой строки «Изменить»: смена клиента сразу
 * возвращает к проверке, смена услуги или мастера ведёт дальше по шагам —
 * от них зависят мастера и свободное время.
 *
 * Два пути под одной формой. Индивидуальная услуга идёт теми же quote/confirm,
 * что и остальной продукт (useResourceBooking): время — только из свободных
 * начал сервера. Групповая — запись в уже стоящее занятие этой услуги у этого
 * мастера либо новое занятие в названное время и сразу запись в него.
 */
export function useBookingWizard(o: WizardOptions) {
  const { t } = useTranslation(['journal', 'common']);
  const toast = useToast();
  const resource = useResourceBooking({
    onClose: o.onClose, onCreated: o.onCreated, clientId: o.clientId ?? null, defaultDate: o.defaultDate,
  });
  const { data: services = [] } = useQuery({ queryKey: queryKeys.services, queryFn: () => servicesApi.list() });
  const { data: branches = [] } = useQuery({ queryKey: queryKeys.branches, queryFn: () => studioApi.getBranches() });
  // Залы и мастера — из тех же кэшей, что у сетки журнала: мастер записи
  // открывается и из карточки клиента, где сетки нет.
  const { data: halls = NO_HALLS } = useQuery({ queryKey: queryKeys.halls, queryFn: () => scheduleApi.getHalls() });
  const { data: staff } = useQuery({
    queryKey: queryKeys.staff, queryFn: () => staffApi.getList().then(res => res.staff.items),
  });
  const trainers: Trainer[] = useMemo(
    () => (staff ?? []).filter(s => s.is_specialist).map(staffToTrainer), [staff]);

  const { spaceIsAxis } = useBusinessTerms();
  const [step, setStep] = useState(o.clientId != null ? 1 : 0);
  const [client, setClientState] = useState<{ id: number; name: string } | null>(
    o.clientId != null ? { id: o.clientId, name: '' } : null);
  const [service, setServiceState] = useState<ServiceRead | null>(null);
  const [teacherId, setTeacherState] = useState<number | null>(o.defaultTeacherId);
  const [date, setDateState] = useState(o.defaultDate);
  // То, что человек выбрал; показанное время выводится из него ниже (shownTime).
  const [time, setTimeState] = useState(o.defaultTime ?? '');
  const [lessonId, setLessonId] = useState<number | null>(null);
  const [pickedHall, setHallId] = useState<number | null>(null);
  const hallId = pickedHall ?? halls[0]?.id ?? null;
  const [branchId, setBranchId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  // Шаг открыт кнопкой «Изменить» на проверке.
  const [editing, setEditing] = useState(false);
  const currency = useStudioCurrency();
  // Из карточки клиента приходит только id — имя для проверки берём из профиля.
  const { data: profile } = useQuery({
    queryKey: queryKeys.client(o.clientId ?? 0),
    queryFn: () => clientsApi.getProfile(o.clientId!),
    enabled: o.clientId != null,
  });
  const isResource = service?.booking_mode === 'resource';

  // Индивидуальные — только те, у кого есть мастер и филиал (иначе записать
  // некуда); групповые — все: занятие под них создаётся здесь же.
  const serviceList = useMemo(() => services.filter(s => s.booking_mode === 'resource'
    ? resource.choice.serviceOptions.some(r => r.id === s.id)
    : true), [services, resource.choice.serviceOptions]);

  const masters: WizardMaster[] = useMemo(() => {
    if (!service) return [];
    if (isResource) {
      return [
        { id: null, name: t('journal:resourceBooking.anyStaff') },
        ...resource.choice.masterOptions.map(m => ({ id: m.teacher_id, name: `${m.name} ${m.last_name ?? ''}`.trim() })),
      ];
    }
    const own = service.masters.map(m => m.user_id);
    return trainers.filter(tr => own.length === 0 || own.includes(tr.id)).map(tr => ({ id: tr.id, name: tr.full }));
  }, [service, isResource, resource.choice.masterOptions, trainers, t]);

  // Групповая: занятия выбранного дня — в них можно записать, не создавая новое.
  const { data: dayLessons = [], isFetching: lessonsLoading } = useQuery({
    queryKey: ['booking-wizard-lessons', date],
    queryFn: () => scheduleApi.getLessons({ date_from: date, date_to: date }),
    enabled: step === 3 && !!service && !isResource,
  });
  const existing = dayLessons
    .filter(l => l.service_id === service?.id && l.teacher_id === teacherId
      && l.status !== 'cancelled' && l.booked_count < l.total_spots)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const goTo = (next: number) => {
    // К выбору услуги — снова все услуги: мастер, выбранный позже, их сужал бы.
    if (next === 1) resource.setTeacherId(null);
    setStep(next);
  };

  const pickClient = (id: number, name: string) => {
    setClientState({ id, name });
    resource.setClient(id);
    if (editing) setStep(SUMMARY_STEP); else goTo(1);
  };
  const edit = (target: number) => { setEditing(true); goTo(target); };
  const pickService = (s: ServiceRead) => {
    setServiceState(s);
    if (s.booking_mode === 'resource') resource.setServiceId(s.id);
    setLessonId(null);
    setStep(2);
  };
  const pickMaster = (id: number | null) => {
    setTeacherState(id);
    if (isResource) resource.setTeacherId(id);
    setLessonId(null);
    setStep(3);
  };
  const setDate = (value: string) => {
    setDateState(value);
    resource.setDate(value);
    setLessonId(null);
  };
  const setTime = (value: string, lesson: number | null = null) => {
    setTimeState(value);
    setLessonId(lesson);
  };

  const free = useMemo(() => resource.slots.map(s => s.local_start.slice(11, 16)), [resource.slots]);

  // Свободное время одним списком для обоих путей. Индивидуальная — начала
  // от сервера (шаг 5 минут плюс первая минута каждого окна); групповая —
  // считается здесь по занятиям мастера с их буферами (freeTimes.ts).
  const now = new Date();
  const isToday = date === toDateStr(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const own = service?.masters.find(m => m.user_id === teacherId)?.duration_min;
  const eventFree = useMemo(() => (!service || isResource || teacherId == null) ? null : eventFreeTimes({
    lessons: dayLessons, teacherId, services,
    duration: own ?? service.duration_min,
    bufferBefore: service.buffer_before_min, bufferAfter: service.buffer_after_min,
    notBefore: isToday ? nowMin : null,
  }), [service, isResource, teacherId, dayLessons, services, own, isToday, nowMin]);
  const times = useMemo(
    () => isResource ? listedTimes(free, 5) : eventFree?.times ?? [], [isResource, free, eventFree]);
  const isFree = (hhmm: string) => isResource ? free.includes(hhmm) : !!eventFree?.isFree(hhmm);

  // Первым выбрано то, что человек показал: время клетки, а если оно занято —
  // ближайшее свободное после него (клетка 12:00, мастер занят до 12:20 → 12:20).
  // Без клетки — ближайшее к «сейчас» сегодня и первое свободное в другой день.
  // Выводится, а не чинится эффектом: выбор человека хранится как есть.
  const startAnchor = o.defaultTime || (isToday ? toHHMM(nowMin) : '00:00');
  const snap = (from: string) => times.find(tm => tm >= from) ?? times[times.length - 1] ?? '';
  const shownTime = lessonId != null || isFree(time) ? time : snap(time || startAnchor);
  // С него же начинается список на шаге 4; более раннее — по кнопке «Раньше».
  const listFrom = times.length ? snap(startAnchor) : null;

  // Индивидуальная: показанное время свободно — условия берутся сами, один раз
  // на набор выбора (отказ сервера не должен повторяться на каждый рендер).
  const autoKey = `${client?.id}|${resource.serviceId}|${resource.branchId}|${resource.teacherId}|${date}|${shownTime}`;
  const autoPicked = useRef<string | null>(null);
  const quotedTime = resource.quote?.terms.domain.local_start.slice(11, 16);
  const { pick, quoting } = resource;
  useEffect(() => {
    if (!isResource || step !== 3 || quoting || quotedTime === shownTime || autoPicked.current === autoKey) return;
    const slot = resource.slots.find(s => s.local_start.slice(11, 16) === shownTime);
    if (!slot) return;
    autoPicked.current = autoKey;
    void pick(slot);
  }, [isResource, step, quoting, quotedTime, shownTime, autoKey, resource.slots, pick]);

  // Место не участвует в расписании (барбершоп) — зал не выбирается.
  const noHall = spaceIsAxis === false || halls.length === 0;
  const branch = branchId ?? branches[0]?.id ?? null;
  const ready = isResource
    ? !!resource.quote && quotedTime === shownTime && !quoting
    : client != null && service != null && teacherId != null && (lessonId != null || isFree(shownTime));

  const submit = async () => {
    if (!ready || saving) return;
    if (isResource) { await resource.confirm(); return; }
    setSaving(true);
    try {
      let target = lessonId;
      if (target == null) {
        const own = service!.masters.find(m => m.user_id === teacherId)?.duration_min;
        const lesson = await scheduleApi.createLesson({
          service_id: service!.id,
          teacher_id: teacherId,
          hall_id: noHall ? null : hallId,
          branch_id: noHall ? branch : null,
          start_time: `${date}T${shownTime}:00`,
          duration_min: own ?? service!.duration_min,
          total_spots: service!.max_clients ?? undefined,
        });
        target = lesson.id;
      }
      await scheduleApi.createReservation(client!.id, target);
      toast.info(t('journal:toasts.clientsBooked', { count: 1 }));
      o.onCreated();
      o.onClose();
    } catch (err) {
      toast.error(errorMessage(err, t));
      // Занятие могло создаться, а запись — нет: сетка должна его показать.
      o.onCreated();
    } finally {
      setSaving(false);
    }
  };

  const clientName = client?.name || (profile ? `${profile.name} ${profile.last_name ?? ''}`.trim() : '');
  const joined = existing.find(l => l.id === lessonId);
  const priceText = isResource
    ? (resource.quote ? formatMoney(resource.quote.terms.domain.funding.price, resource.quote.terms.domain.funding.currency) : '')
    : formatMoney(joined?.price ?? service?.masters.find(m => m.user_id === teacherId)?.price ?? service?.price ?? 0, currency);
  const durationMin = isResource ? resource.quote?.terms.duration_min : (joined?.duration_min ?? own ?? service?.duration_min);

  return {
    step, goTo, edit, clientName, priceText, durationMin, joined, client, service, teacherId, date, time: shownTime, lessonId, hallId, setHallId,
    branches, branch, setBranchId, noHall, isResource, serviceList, masters,
    trainers, halls,
    existing, lessonsLoading, free, times, isFree, listFrom, resource, ready, saving: saving || resource.saving,
    pickClient, pickService, pickMaster, setDate, setTime, submit,
  };
}

export type BookingWizardState = ReturnType<typeof useBookingWizard>;
