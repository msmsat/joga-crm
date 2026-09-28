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
import { eventFreeTimes } from './freeTimes';
import { lessonToJoin, type WizardMaster } from './masterAvailability';
import { useWizardAvailability } from './useWizardAvailability';
import { hybridApi } from '../../../../../../api/booking/hybrid.api';
import { useNotePhotos } from '../../../../../../hooks/useNotePhotos';
import { isPastSlot, nextSameTime } from './pastSlot';
import { useWizardSettle } from './useWizardSettle';

export type { WizardMaster } from './masterAvailability';

const NO_HALLS: Hall[] = [];
const NO_LESSONS: Lesson[] = [];

export type WizardOptions = {
  /** Мастер колонки, по которой тапнули; null — неделя, кнопка, карточка клиента. */
  defaultTeacherId: number | null;
  defaultDate: string;
  defaultTime?: string;
  /** Карточка клиента открывает запись с уже выбранным человеком — его можно сменить. */
  clientId?: number | null;
  onClose: () => void;
  onCreated: () => void;
};

/** Разделы по порядку — в этом же порядке их листает свайп. Порядок только
    подсказка: открыть можно любой раздел в любой момент (кнопки в шапке). */
export const TIME_STEP = 0;
export const CLIENT_STEP = 1;
export const SERVICE_STEP = 2;
export const MASTER_STEP = 3;
/** Итог — всё выбранное перед записью. */
export const SUMMARY_STEP = 4;
const ALL_STEPS = [TIME_STEP, CLIENT_STEP, SERVICE_STEP, MASTER_STEP, SUMMARY_STEP];

/** Шаг сетки свободного времени запоминается — удобство одного устройства,
    как выбранные мастера журнала. Первый раз — 15 минут. */
const TIME_STEP_KEY = 'journal:wizardTimeStep';
export const TIME_STEPS = [1, 2, 5, 15];
function readTimeStep() {
  try {
    const saved = Number(localStorage.getItem(TIME_STEP_KEY));
    return TIME_STEPS.includes(saved) ? saved : 15;
  } catch {
    return 15;
  }
}

export const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/**
 * Запись по разделам: время, клиент, услуга, мастер, итог — в любом порядке.
 * Мастер всегда открывается на итоге — откуда бы его ни открыли (ячейка
 * журнала, «+» в каркасе, карточка клиента). Подставлено только то, что
 * человек уже назвал: тап по ячейке — её время и мастера колонки, карточка
 * клиента — клиента. Всё подставленное меняется так же, как выбранное руками.
 * Пока время не названо, услуги и мастера не фильтруются.
 * «Продолжить» и выбор строки ведут на ПЕРВЫЙ незаполненный раздел после
 * текущего (по кругу), а когда всё выбрано — на итог: поменяли клиента на
 * итоге — вернулись к итогу, поменяли услугу — мастера придётся выбрать заново.
 *
 * Два пути под одной формой. Индивидуальная услуга идёт теми же quote/confirm,
 * что и остальной продукт (useResourceBooking), и только в свободное начало
 * сервера. Групповая ставит новое занятие в названное время — без клиента:
 * людей в группу записывают потом, раздела «Клиент» у неё нет. Исключение —
 * запись из карточки клиента: её затеяли ради этого человека, и он
 * записывается в уже стоящее занятие этой услуги у мастера либо в новое.
 */
export function useBookingWizard(o: WizardOptions) {
  const { t } = useTranslation(['journal', 'common']);
  const toast = useToast();
  const now = new Date();
  const today = toDateStr(now);
  // Прошедший день без названного часа — просто сегодня: спрашивать не о чем.
  const startDate = o.defaultDate < today && !o.defaultTime ? today : o.defaultDate;
  const resource = useResourceBooking({
    onClose: o.onClose, onCreated: o.onCreated, clientId: o.clientId ?? null, defaultDate: startDate,
    teacherId: o.defaultTeacherId, checkout: false,
  });
  const { data: services = [], isFetched: servicesReady } = useQuery({ queryKey: queryKeys.services, queryFn: () => servicesApi.list() });
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
  // Всегда с итога: подставленное видно сразу, пустое — «Выбрать».
  const [step, setStep] = useState(SUMMARY_STEP);
  /** Куда листнули: 1 — вперёд, -1 — назад (от этого зависит, откуда въезжает раздел). */
  const [dir, setDir] = useState<1 | -1>(1);
  const [client, setClientState] = useState<{ id: number; name: string } | null>(
    o.clientId != null ? { id: o.clientId, name: '' } : null);
  // Итог индивидуальной записи: своя скидка, «Оплата» и «Посещение».
  const settle = useWizardSettle(resource, client?.id ?? null);
  /** Клиент, заведённый прямо в мастере: стоит первым в списке, пока открыт мастер. */
  const [fresh, setFresh] = useState<{ id: number; name: string; hint?: string } | null>(null);
  const [service, setServiceState] = useState<ServiceRead | null>(null);
  const [teacherId, setTeacherState] = useState<number | null>(o.defaultTeacherId);
  /** Мастер выбран на своём шаге (у индивидуальной «любой» — тоже выбор, id null)
      или пришёл с колонки журнала, по которой тапнули. */
  const [masterChosen, setMasterChosen] = useState(o.defaultTeacherId != null);
  const [date, setDateState] = useState(startDate);
  const [time, setTimeState] = useState(o.defaultTime ?? '');
  /** Тапнули по прошедшей клетке: задним числом не записываем — предлагаем
      тот же час впереди (pastSlot.ts). null — спрашивать не о чем. */
  const [pastAsk, setPastAsk] = useState(() => o.defaultTime && isTime(o.defaultTime)
    && isPastSlot(o.defaultDate, o.defaultTime, now) ? nextSameTime(o.defaultTime, now) : null);
  const [timeStep, setTimeStepState] = useState(readTimeStep);
  const setTimeStep = (value: number) => {
    setTimeStepState(value);
    try { localStorage.setItem(TIME_STEP_KEY, String(value)); } catch { /* приватный режим — просто не запомнится */ }
  };
  const [pickedHall, setHallId] = useState<number | null>(null);
  const hallId = pickedHall ?? halls[0]?.id ?? null;
  const [branchId, setBranchId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  /** Заметка к записи (итог): текст и снимки. Ложится в занятие записи. */
  const [notes, setNotes] = useState('');
  const notePhotos = useNotePhotos();
  const autoPicked = useRef<string | null>(null);
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
  const { data: resourceStaff, isFetched: staffReady } = useQuery({ queryKey: queryKeys.resourceStaff, queryFn: hybridApi.resourceStaff });
  const serviceList = useMemo(() => services.filter(s => s.booking_mode === 'resource'
    ? resourceStaff?.staff.some(m => m.service_ids.includes(s.id)) : true), [services, resourceStaff]);

  const masters: WizardMaster[] = useMemo(() => {
    if (!service) return trainers.map(tr => ({ id: tr.id, name: tr.full }));
    if (isResource) {
      return [
        { id: null, name: t('journal:resourceBooking.anyStaff') },
        ...(resourceStaff?.staff.filter(m => m.service_ids.includes(service.id)) ?? []).map(m => ({ id: m.teacher_id, name: `${m.name} ${m.last_name ?? ''}`.trim() })),
      ];
    }
    const own = service.masters.map(m => m.user_id);
    return trainers.filter(tr => own.length === 0 || own.includes(tr.id)).map(tr => ({ id: tr.id, name: tr.full }));
  }, [service, isResource, resourceStaff, trainers, t]);

  // Занятия дня: по ним считается, свободны ли групповая услуга и её мастер
  // в названное время, и есть ли занятие, куда можно просто записать.
  const { data: dayLessons = NO_LESSONS, isFetched: lessonsReady, isFetching: lessonsLoading } = useQuery({
    queryKey: ['booking-wizard-lessons', date],
    queryFn: () => scheduleApi.getLessons({ date_from: date, date_to: date }),
    enabled: !!date,
  });

  const isToday = date === toDateStr(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const availability = useWizardAvailability({
    services: serviceList, trainers, date, time, lessons: dayLessons, lessonsReady: lessonsReady && !lessonsLoading,
    joinable: o.clientId != null,
    notBefore: date < toDateStr(now) ? 1440 : isToday ? nowMin : null,
    serviceId: service?.id ?? null, teacherId: masterChosen ? teacherId : null, step: timeStep,
  });
  const { serviceStates, masterStates } = availability;
  const conflict = isTime(time) && availability.conflict;

  // ── Переходы ───────────────────────────────────────────────────────────────
  type Snapshot = { time: string; client: unknown; service: ServiceRead | null; masterChosen: boolean };
  const current: Snapshot = { time, client, service, masterChosen };
  /** Групповому занятию из журнала клиент не нужен — раздел пропадает, как
      только выбрана такая услуга. Пока услуги нет, решает каталог: где
      индивидуальных нет вовсе (студия пилатеса), клиента нет с самого начала;
      пока каталог грузится — раздел на месте, чтобы не мигал. */
  const noResource = servicesReady && staffReady && !serviceList.some(s => s.booking_mode === 'resource');
  const needsClientFor = (s: ServiceRead | null) =>
    o.clientId != null || (s ? s.booking_mode === 'resource' : !noResource);
  const stepsFor = (v: Snapshot) => needsClientFor(v.service) ? ALL_STEPS : ALL_STEPS.filter(s => s !== CLIENT_STEP);
  const needsClient = needsClientFor(service);
  const steps = stepsFor(current);
  const done = (s: number, v: Snapshot = current) =>
    s === TIME_STEP ? isTime(v.time)
    : s === CLIENT_STEP ? v.client != null
    : s === SERVICE_STEP ? v.service != null
    : s === MASTER_STEP ? v.masterChosen
    : false;
  /** Первый незаполненный раздел после from — по кругу; всё заполнено — итог. */
  const nextAfter = (from: number, v: Snapshot = current) => {
    const list = stepsFor(v);
    const at = list.indexOf(from);
    const order = [...list.slice(at + 1), ...list.slice(0, at)];
    return order.find(s => s !== SUMMARY_STEP && !done(s, v)) ?? SUMMARY_STEP;
  };

  const goTo = (next: number) => {
    if (next === step) return;
    setDir(steps.indexOf(next) > steps.indexOf(step) ? 1 : -1);
    setStep(next);
  };
  const advance = () => goTo(nextAfter(step));
  /** Свайп: соседний раздел; с крайнего дальше не листается. */
  const swipe = (d: 1 | -1) => {
    const next = steps[steps.indexOf(step) + d];
    if (next != null) goTo(next);
  };

  /** Раздел «Время»: день и час; at пустой — час ещё не назван. */
  const syncBranch = (at: string, id = teacherId) => {
    if (!isResource || !service) return;
    const branch = availability.branchFor(service.id, masterChosen ? id : null, at);
    if (branch != null && branch !== resource.branchId) resource.setBranchId(branch);
  };
  const setWhen = (day: string, at: string) => {
    autoPicked.current = null;
    if (day !== date) { setDateState(day); resource.setDate(day); }
    setTimeState(at);
    if (day === date) syncBranch(at);
  };
  /** Ответ на «Это время уже прошло»: взять предложенный час или выбрать свой. */
  const acceptPast = () => {
    if (!pastAsk) return;
    setPastAsk(null);
    setWhen(pastAsk.date, pastAsk.time);
  };
  const choosePastOwn = () => {
    setPastAsk(null);
    setWhen(today, '');
    goTo(TIME_STEP);
  };
  /** Время из списка свободного — как выбор строки: сразу к следующему разделу. */
  const pickTime = (at: string) => {
    autoPicked.current = null;
    setTimeState(at);
    syncBranch(at);
    goTo(nextAfter(TIME_STEP, { ...current, time: at }));
  };
  const pickClient = (id: number, name: string) => {
    autoPicked.current = null;
    setClientState({ id, name });
    resource.setClient(id);
    goTo(nextAfter(CLIENT_STEP, { ...current, client: id }));
  };
  /** Клиент заведён в мастере: встаёт первым и выбранным, дальше — «Продолжить». */
  const addFreshClient = (id: number, name: string, hint?: string) => {
    autoPicked.current = null;
    setFresh({ id, name, hint });
    setClientState({ id, name });
    resource.setClient(id);
  };
  const pickService = (s: ServiceRead) => {
    autoPicked.current = null;
    const compatible = teacherId == null || (s.booking_mode === 'resource'
      ? resourceStaff?.staff.some(m => m.teacher_id === teacherId && m.service_ids.includes(s.id))
      : s.masters.length === 0 || s.masters.some(m => m.user_id === teacherId));
    const keepMaster = masterChosen && !!compatible;
    setServiceState(s);
    setMasterChosen(keepMaster);
    if (!keepMaster) setTeacherState(null);
    resource.setTeacherId(keepMaster ? teacherId : null);
    if (s.booking_mode === 'resource') {
      resource.setServiceId(s.id);
      const branch = availability.branchFor(s.id, keepMaster ? teacherId : null, time);
      if (branch != null) resource.setBranchId(branch);
    }
    goTo(nextAfter(SERVICE_STEP, { ...current, service: s, masterChosen: keepMaster }));
  };
  /** at — ближайшее свободное время, которое предложили у занятого мастера. */
  const pickMaster = (id: number | null, at?: string) => {
    autoPicked.current = null;
    setTeacherState(id);
    resource.setTeacherId(id);
    if (isResource && service) {
      const branch = availability.branchFor(service.id, id, at ?? time);
      if (branch != null) resource.setBranchId(branch);
    }
    if (at) setTimeState(at);
    setMasterChosen(true);
    goTo(nextAfter(MASTER_STEP, { ...current, time: at ?? time, masterChosen: true }));
  };

  // ── Выбранный мастер в названное время ────────────────────────────────────
  const own = service?.masters.find(m => m.user_id === teacherId)?.duration_min;
  const eventFree = useMemo(() => (!service || isResource || teacherId == null) ? null : eventFreeTimes({
    lessons: dayLessons, teacherId, services,
    duration: own ?? service.duration_min,
    bufferBefore: service.buffer_before_min, bufferAfter: service.buffer_after_min,
    notBefore: isToday ? nowMin : null,
  }), [service, isResource, teacherId, dayLessons, services, own, isToday, nowMin]);
  // Записаться в стоящее занятие можно только клиентом. Без клиента занятие в
  // это время у мастера — просто занятое время: второе поверх не ставится.
  const joined = service && !isResource && needsClient ? lessonToJoin(dayLessons, service.id, teacherId, time) : undefined;
  const slotAtTime = resource.slots.find(s => s.local_start.slice(11, 16) === time);
  /** Выбранный мастер в это время занят — итог это показывает и не записывает. */
  const busy = isTime(time) && masterChosen && !!service && (isResource
    ? !resource.slotsLoading && !slotAtTime
    : lessonsReady && !joined && !eventFree?.isFree(time));

  // Индивидуальная: всё выбрано и время свободно — условия берутся сами,
  // один раз на набор выбора (отказ сервера не должен повторяться на каждый рендер).
  const autoKey = `${client?.id}|${resource.serviceId}|${resource.branchId}|${resource.teacherId}|${date}|${time}`;

  const quotedTime = resource.quote?.terms.domain.local_start.slice(11, 16);
  const { pick, quoting } = resource;
  useEffect(() => {
    if (!isResource || !masterChosen || conflict || availability.loading || step !== SUMMARY_STEP || client == null || quoting || quotedTime === time
      || autoPicked.current === autoKey || !slotAtTime) return;
    autoPicked.current = autoKey;
    void pick(slotAtTime);
  }, [isResource, masterChosen, conflict, availability.loading, step, client, quoting, quotedTime, time, autoKey, slotAtTime, pick]);

  // Место не участвует в расписании (барбершоп) — зал не выбирается.
  const noHall = spaceIsAxis === false || halls.length === 0;
  const branch = branchId ?? branches[0]?.id ?? null;
  const ready = !conflict && !busy && !availability.loading && isTime(time) && !isPastSlot(date, time, now)
    && masterChosen && (isResource
    ? !!resource.quote && quotedTime === time && !quoting
    : (!needsClient || client != null) && service != null && masterChosen && teacherId != null && isTime(time) && !busy);

  const note = { notes: notes.trim(), photos: notePhotos.photos };
  const hasNote = note.notes !== '' || note.photos.length > 0;
  /** Снимок ещё летит на сервер — записывать рано: он бы потерялся. */
  const notePending = notePhotos.pending.length > 0;

  const submit = async () => {
    if (!ready || saving || notePending) return;
    if (isResource) { await resource.confirm(note, settle.settle()); return; }
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
          ...(hasNote ? note : {}),
        });
        target = lesson.id;
      }
      if (!needsClient) {
        toast.info(t('journal:toasts.lessonAdded'));
        o.onCreated();
        o.onClose();
        return;
      }
      await scheduleApi.createReservation(client!.id, target);
      // Запись в уже стоящее занятие: у него своя заметка, общая на всех, —
      // дописываем к ней с именем клиента, а не затираем.
      if (joined && hasNote) {
        const line = note.notes && `${clientName}: ${note.notes}`;
        try {
          await scheduleApi.updateLesson(joined.id, {
            notes: [joined.notes, line].filter(Boolean).join('\n\n'),
            photos: [...(joined.photos ?? []), ...note.photos],
          });
        } catch (err) {
          // Запись уже состоялась — из-за заметки её не откатываем.
          toast.error(errorMessage(err, t));
        }
      }
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
    steps, step, dir, goTo, advance, swipe, done, conflict, availability, timeStep, setTimeStep,
    clientName, priceText, durationMin, joined, busy, needsClient, client, fresh, service, teacherId, masterChosen, date, time,
    hallId, setHallId, branches, branch, setBranchId, noHall, isResource, serviceList, services, masters,
    serviceStates, masterStates, trainers, halls, resource, ready, saving: saving || resource.saving,
    dayLessons, lessonsReady: lessonsReady && !lessonsLoading, notBefore: isToday ? nowMin : null,
    pickClient, addFreshClient, pickService, pickMaster, setWhen, pickTime, submit, pastAsk, acceptPast, choosePastOwn,
    notes, setNotes, notePhotos, notePending, settle,
  };
}

export type BookingWizardState = ReturnType<typeof useBookingWizard>;
