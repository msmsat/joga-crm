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
import type { Lesson } from '../../../../../../api/schedule/schedule.types';
import { formatMoney } from '../../../../../../lib/money';
import { useStudioCurrency } from '../../../../../../hooks/useStudioCurrency';
import { staffToTrainer } from '../../../utils';
import type { Hall, Trainer } from '../../../types';
import { toDateStr } from '../../../utils';
import { eventFreeTimes, toHHMM } from './freeTimes';
import { lessonToJoin, useMasterAvailability, type WizardMaster } from './masterAvailability';

export type { WizardMaster } from './masterAvailability';

const NO_HALLS: Hall[] = [];
const NO_LESSONS: Lesson[] = [];

export type WizardOptions = {
  /** Мастер колонки, по которой тапнули; null — неделя, кнопка, карточка клиента. */
  defaultTeacherId: number | null;
  defaultDate: string;
  defaultTime?: string;
  /** Карточка клиента открывает запись с уже выбранным человеком — шаг клиента пропускается. */
  clientId?: number | null;
  onClose: () => void;
  onCreated: () => void;
};

/** Шаги по порядку. Время — первым: человек звонит и называет, КОГДА ему
    удобно, и уже под это время подбираются услуга и свободный мастер. */
export const WHEN_STEP = 0;
export const CLIENT_STEP = 1;
export const SERVICE_STEP = 2;
export const MASTER_STEP = 3;
/** Последний шаг — проверка всего выбранного перед записью. */
export const SUMMARY_STEP = 4;
export const WIZARD_STEPS = 5;

const isTime = (v: string) => /^\d\d:\d\d$/.test(v);
/** Ближайшая четверть часа после «сейчас» — время по умолчанию для кнопки. */
const nextQuarter = (now: Date) => toHHMM(Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 15) * 15);

/**
 * Запись по шагам: дата и время → клиент → услуга → мастер → проверка.
 * «Продолжить» и выбор строки ведут на ПЕРВЫЙ незаполненный шаг после
 * текущего, а когда всё выбрано — на проверку: поменяли клиента на проверке —
 * вернулись к проверке, поменяли услугу — мастера придётся выбрать заново.
 * По заполненным шагам можно прыгать полосками прогресса в шапке.
 *
 * Два пути под одной формой. Индивидуальная услуга идёт теми же quote/confirm,
 * что и остальной продукт (useResourceBooking), и только в свободное начало
 * сервера. Групповая — запись в уже стоящее в это время занятие этой услуги
 * у этого мастера либо новое занятие в названное время и сразу запись в него.
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
  const now = new Date();
  const steps = o.clientId != null
    ? [WHEN_STEP, SERVICE_STEP, MASTER_STEP, SUMMARY_STEP]
    : [WHEN_STEP, CLIENT_STEP, SERVICE_STEP, MASTER_STEP, SUMMARY_STEP];
  const [step, setStep] = useState(WHEN_STEP);
  const [client, setClientState] = useState<{ id: number; name: string } | null>(
    o.clientId != null ? { id: o.clientId, name: '' } : null);
  /** Клиент, заведённый прямо в мастере: стоит первым в списке, пока открыт мастер. */
  const [fresh, setFresh] = useState<{ id: number; name: string; hint?: string } | null>(null);
  const [service, setServiceState] = useState<ServiceRead | null>(null);
  const [teacherId, setTeacherState] = useState<number | null>(o.defaultTeacherId);
  /** Мастер выбран на своём шаге (у индивидуальной «любой» — тоже выбор, id null). */
  const [masterChosen, setMasterChosen] = useState(false);
  const [date, setDateState] = useState(o.defaultDate);
  const [time, setTimeState] = useState(() => o.defaultTime
    ?? (o.defaultDate === toDateStr(now) ? nextQuarter(now) : ''));
  const [pickedHall, setHallId] = useState<number | null>(null);
  const hallId = pickedHall ?? halls[0]?.id ?? null;
  const [branchId, setBranchId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
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

  // Занятия дня: в них можно записать сразу с первого шага, по ним же
  // считается, свободен ли мастер группового занятия.
  const { data: dayLessons = NO_LESSONS, isFetched: lessonsReady, isFetching: lessonsLoading } = useQuery({
    queryKey: ['booking-wizard-lessons', date],
    queryFn: () => scheduleApi.getLessons({ date_from: date, date_to: date }),
    enabled: !!date,
  });

  const isToday = date === toDateStr(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const masterStates = useMasterAvailability({
    service, isResource, masters, services, dayLessons, lessonsReady: lessonsReady && !lessonsLoading,
    date, time, notBefore: isToday ? nowMin : null,
    resourceServiceId: isResource ? resource.serviceId : null, resourceBranchId: resource.branchId,
  });

  // ── Переходы ───────────────────────────────────────────────────────────────
  type Snapshot = { time: string; client: unknown; service: unknown; masterChosen: boolean };
  const current: Snapshot = { time, client, service, masterChosen };
  const done = (s: number, v: Snapshot = current) =>
    s === WHEN_STEP ? isTime(v.time)
    : s === CLIENT_STEP ? v.client != null
    : s === SERVICE_STEP ? v.service != null
    : s === MASTER_STEP ? v.service != null && v.masterChosen
    : false;
  /** Первый незаполненный шаг после from; всё заполнено — проверка. */
  const nextAfter = (from: number, v: Snapshot = current) =>
    steps.find(s => s > from && s !== SUMMARY_STEP && !done(s, v)) ?? SUMMARY_STEP;
  /** Полоской можно уйти на шаг, если заполнено всё, что перед ним. */
  const canJump = (target: number) => steps.filter(s => s < target).every(s => done(s));

  const goTo = (next: number) => {
    // К выбору услуги — снова все услуги: выбранный мастер их сужал бы.
    // Ушли со списка услуг, не сменив её, — мастер записи возвращается.
    if (next === SERVICE_STEP) resource.setTeacherId(null);
    else if (step === SERVICE_STEP && masterChosen && isResource) resource.setTeacherId(teacherId);
    setStep(next);
  };
  const advance = () => goTo(nextAfter(step));

  const setTime = (value: string) => setTimeState(value);
  const setDate = (value: string) => {
    setDateState(value);
    resource.setDate(value);
  };
  const pickClient = (id: number, name: string) => {
    setClientState({ id, name });
    resource.setClient(id);
    goTo(nextAfter(CLIENT_STEP, { ...current, client: id }));
  };
  /** Клиент заведён в мастере: встаёт первым и выбранным, дальше — «Продолжить». */
  const addFreshClient = (id: number, name: string, hint?: string) => {
    setFresh({ id, name, hint });
    setClientState({ id, name });
    resource.setClient(id);
  };
  const pickService = (s: ServiceRead) => {
    const changed = s.id !== service?.id;
    if (changed) {
      setServiceState(s);
      if (s.booking_mode === 'resource') resource.setServiceId(s.id);
      setMasterChosen(false);
    }
    goTo(nextAfter(SERVICE_STEP, { ...current, service: s, masterChosen: changed ? false : masterChosen }));
  };
  /** at — ближайшее свободное время, которое предложили у занятого мастера. */
  const pickMaster = (id: number | null, at?: string) => {
    setTeacherState(id);
    if (isResource) resource.setTeacherId(id);
    if (at) setTimeState(at);
    setMasterChosen(true);
    goTo(nextAfter(MASTER_STEP, { ...current, masterChosen: true, time: at ?? time }));
  };
  /** Первый шаг: запись в уже стоящее занятие — время, услуга и мастер разом. */
  const pickLesson = (lesson: Lesson) => {
    const s = services.find(x => x.id === lesson.service_id);
    if (!s) return;
    const at = lesson.start_time.slice(11, 16);
    setServiceState(s);
    setTeacherState(lesson.teacher_id);
    setMasterChosen(true);
    setTimeState(at);
    goTo(nextAfter(WHEN_STEP, { time: at, client, service: s, masterChosen: true }));
  };

  // ── Выбранный мастер в названное время ────────────────────────────────────
  const own = service?.masters.find(m => m.user_id === teacherId)?.duration_min;
  const eventFree = useMemo(() => (!service || isResource || teacherId == null) ? null : eventFreeTimes({
    lessons: dayLessons, teacherId, services,
    duration: own ?? service.duration_min,
    bufferBefore: service.buffer_before_min, bufferAfter: service.buffer_after_min,
    notBefore: isToday ? nowMin : null,
  }), [service, isResource, teacherId, dayLessons, services, own, isToday, nowMin]);
  const joined = service && !isResource ? lessonToJoin(dayLessons, service.id, teacherId, time) : undefined;
  const slotAtTime = resource.slots.find(s => s.local_start.slice(11, 16) === time);
  /** Выбранный мастер в это время занят — проверка это показывает и не записывает. */
  const busy = masterChosen && !!service && (isResource
    ? !resource.slotsLoading && !slotAtTime
    : lessonsReady && !joined && !eventFree?.isFree(time));

  // Индивидуальная: всё выбрано и время свободно — условия берутся сами,
  // один раз на набор выбора (отказ сервера не должен повторяться на каждый рендер).
  const autoKey = `${client?.id}|${resource.serviceId}|${resource.branchId}|${resource.teacherId}|${date}|${time}`;
  const autoPicked = useRef<string | null>(null);
  const quotedTime = resource.quote?.terms.domain.local_start.slice(11, 16);
  const { pick, quoting } = resource;
  useEffect(() => {
    if (!isResource || step !== SUMMARY_STEP || client == null || quoting || quotedTime === time
      || autoPicked.current === autoKey || !slotAtTime) return;
    autoPicked.current = autoKey;
    void pick(slotAtTime);
  }, [isResource, step, client, quoting, quotedTime, time, autoKey, slotAtTime, pick]);

  // Место не участвует в расписании (барбершоп) — зал не выбирается.
  const noHall = spaceIsAxis === false || halls.length === 0;
  const branch = branchId ?? branches[0]?.id ?? null;
  const ready = isResource
    ? !!resource.quote && quotedTime === time && !quoting
    : client != null && service != null && masterChosen && teacherId != null && !busy;

  const submit = async () => {
    if (!ready || saving) return;
    if (isResource) { await resource.confirm(); return; }
    setSaving(true);
    try {
      let target = joined?.id ?? null;
      if (target == null) {
        const lesson = await scheduleApi.createLesson({
          service_id: service!.id,
          teacher_id: teacherId,
          hall_id: noHall ? null : hallId,
          branch_id: noHall ? branch : null,
          start_time: `${date}T${time}:00`,
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
  const priceText = isResource
    ? (resource.quote ? formatMoney(resource.quote.terms.domain.funding.price, resource.quote.terms.domain.funding.currency) : '')
    : formatMoney(joined?.price ?? service?.masters.find(m => m.user_id === teacherId)?.price ?? service?.price ?? 0, currency);
  const durationMin = isResource ? resource.quote?.terms.duration_min : (joined?.duration_min ?? own ?? service?.duration_min);

  return {
    steps, step, goTo, advance, done, canJump,
    clientName, priceText, durationMin, joined, busy, client, fresh, service, teacherId, masterChosen, date, time,
    isToday, nowMin, hallId, setHallId, branches, branch, setBranchId, noHall, isResource, serviceList, masters,
    masterStates, trainers, halls, services, dayLessons, lessonsLoading, resource, ready, saving: saving || resource.saving,
    pickClient, addFreshClient, pickService, pickMaster, pickLesson, setDate, setTime, submit,
  };
}

export type BookingWizardState = ReturnType<typeof useBookingWizard>;
