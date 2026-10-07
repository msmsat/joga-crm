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
import type { BookedClient, Lesson } from '../../../../../../api/schedule/schedule.types';
import { getUserRoleFromToken } from '../../../../../../utils/auth';
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
  onCreated: (date?: string) => void;
  onDateChange?: (date: string) => void;
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
 *
 * «Индивидуальное» (кнопка в разделе «Услуга») — та же групповая услуга, но
 * занятие на одно место. Раздел «Клиент» у записи из журнала появляется, но
 * НЕОБЯЗАТЕЛЕН: человека можно назвать сразу, добавить потом из карточки
 * занятия, как в группу, — или он запишется онлайн сам. Навигация раздел
 * пропускает, подтверждать можно и без клиента. В стоящую группу клиент не
 * подсаживается — у мастера в это время занятие, значит, время занято. На
 * индивидуальную услугу кнопка не влияет: та и так на одного.
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
  /** Повторили прошлое занятие клиента («Записать так же»): запись затеяна
      ради этого человека — как из его карточки, клиент у неё обязателен. */
  const [repeated, setRepeated] = useState(false);
  const personal = o.clientId != null || repeated;
  const [service, setServiceState] = useState<ServiceRead | null>(null);
  /** «Индивидуальное»: групповая услуга занятием на одного клиента. */
  const [solo, setSolo] = useState(false);
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
  const [branchPicked, setBranchPicked] = useState(false);
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
  /** «Индивидуальное» есть смысл предлагать, только если в каталоге есть групповые. */
  const canSolo = serviceList.some(s => s.booking_mode !== 'resource');
  const soloLesson = solo && !!service && !isResource;

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
  const { data: dayLessons = NO_LESSONS, isFetched: lessonsReady, isFetching: lessonsLoading, isError: lessonsError, refetch: refreshLessons } = useQuery({
    queryKey: ['booking-wizard-lessons', date],
    queryFn: () => scheduleApi.getLessons({ date_from: date, date_to: date }),
    enabled: !!date,
  });

  const isToday = date === toDateStr(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const availability = useWizardAvailability({
    services: serviceList, trainers, date, time, lessons: dayLessons, lessonsReady: lessonsReady && !lessonsLoading,
    // Индивидуальное в стоящую группу не встаёт: её время для него занято.
    joinable: personal && !solo,
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
  /** Без клиента записать нельзя: индивидуальная услуга, карточка клиента
      или повтор его прошлого занятия. */
  const requiresClientFor = (s: ServiceRead | null) =>
    personal || (s ? s.booking_mode === 'resource' : !noResource);
  /** Раздел «Клиент» есть: обязательный — или необязательный у «Индивидуального». */
  const needsClientFor = (s: ServiceRead | null) => requiresClientFor(s) || solo;
  const stepsFor = (v: Snapshot) => needsClientFor(v.service) ? ALL_STEPS : ALL_STEPS.filter(s => s !== CLIENT_STEP);
  const needsClient = needsClientFor(service);
  const clientOptional = needsClient && !requiresClientFor(service);
  const steps = stepsFor(current);
  // Необязательный клиент разделу «сделано» и без выбора: навигация его
  // пропускает, а «Продолжить» на нём ведёт дальше без клиента. Галочку на
  // кнопке раздела ставит только выбранный человек (WizardTabs).
  const done = (s: number, v: Snapshot = current) =>
    s === TIME_STEP ? isTime(v.time)
    : s === CLIENT_STEP ? v.client != null || !requiresClientFor(v.service)
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
    setBranchPicked(false);
    if (!isResource || !service) return;
    const branch = availability.branchFor(service.id, masterChosen ? id : null, at);
    if (branch != null && branch !== resource.branchId) resource.setBranchId(branch);
  };
  const setWhen = (day: string, at: string) => {
    if (at && isTime(at) && isPastSlot(day, at)) {
      setPastAsk(nextSameTime(at));
      return;
    }
    autoPicked.current = null;
    setBranchPicked(false);
    if (day !== date) { setDateState(day); resource.setDate(day); }
    setTimeState(at);
    o.onDateChange?.(day);
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
    if (isPastSlot(date, at)) {
      setPastAsk(nextSameTime(at));
      return;
    }
    autoPicked.current = null;
    setTimeState(at);
    o.onDateChange?.(date);
    syncBranch(at);
    goTo(nextAfter(TIME_STEP, { ...current, time: at }));
  };
  const pickClient = (id: number, name: string) => {
    autoPicked.current = null;
    setClientState({ id, name });
    resource.setClient(id);
    goTo(nextAfter(CLIENT_STEP, { ...current, client: id }));
  };
  /** Необязательного клиента снимают повторным касанием — занятие останется без него. */
  const clearClient = () => {
    if (clientOptional) setClientState(null);
  };
  /** Клиент заведён в мастере: встаёт первым и выбранным, дальше — «Продолжить». */
  const addFreshClient = (id: number, name: string, hint?: string) => {
    autoPicked.current = null;
    setFresh({ id, name, hint });
    setClientState({ id, name });
    resource.setClient(id);
  };
  const pickService = (s: ServiceRead) => {
    setBranchPicked(false);
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
    setBranchPicked(false);
    autoPicked.current = null;
    setTeacherState(id);
    resource.setTeacherId(id);
    if (isResource && service) {
      const branch = availability.branchFor(service.id, id, at ?? time);
      if (branch != null) resource.setBranchId(branch);
    }
    if (at) { setTimeState(at); o.onDateChange?.(date); }
    setMasterChosen(true);
    goTo(nextAfter(MASTER_STEP, { ...current, time: at ?? time, masterChosen: true }));
  };

  /** Услугу прошлого занятия можно повторить, если её записывает этот мастер. */
  const canRepeat = (serviceId: number) => serviceList.some(s => s.id === serviceId);
  /**
   * «Записать так же» из истории клиента: этот клиент, услуга того занятия и
   * его мастер (если он её всё ещё ведёт). Время не переносится — его выбирает
   * человек: не названо — открывается раздел «Время», названо (тап по клетке)
   * — остаётся. Дальше итог, а если мастера не хватает — его раздел. Групповое
   * занятие ведёт себя как запись из карточки клиента: человек встаёт в уже
   * стоящую группу в это время, иначе для него ставится новое занятие.
   */
  const repeat = (who: { id: number; name: string }, past: { serviceId: number; teacherId: number | null }) => {
    const s = serviceList.find(item => item.id === past.serviceId);
    if (!s) return;
    const keep = past.teacherId != null && (s.booking_mode === 'resource'
      ? !!resourceStaff?.staff.some(m => m.teacher_id === past.teacherId && m.service_ids.includes(s.id))
      : trainers.some(tr => tr.id === past.teacherId)
        && (s.masters.length === 0 || s.masters.some(m => m.user_id === past.teacherId)));
    const master = keep ? past.teacherId : null;
    autoPicked.current = null;
    setBranchPicked(false);
    setRepeated(true);
    setClientState(who);
    resource.setClient(who.id);
    setServiceState(s);
    if (s.booking_mode === 'resource') resource.setServiceId(s.id);
    setTeacherState(master);
    setMasterChosen(keep);
    resource.setTeacherId(master);
    if (s.booking_mode === 'resource') {
      const branch = availability.branchFor(s.id, master, time);
      if (branch != null) resource.setBranchId(branch);
    }
    goTo(!isTime(time) ? TIME_STEP : !keep ? MASTER_STEP : SUMMARY_STEP);
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
  // Индивидуальное — тоже: в чужую группу его не подсаживаем.
  const joined = service && !isResource && needsClient && !solo
    ? lessonToJoin(dayLessons, service.id, teacherId, time) : undefined;
  const slotAtTime = resource.slots.find(s => s.local_start.slice(11, 16) === time);
  // Выбор мог завершиться раньше запроса дня. Подставляем подходящий филиал
  // после ответа, но явно выбранный на итоге адрес сохраняем.
  const suggestedBranch = isResource && service && masterChosen && isTime(time) && !availability.loading && !conflict
    ? availability.branchFor(service.id, teacherId, time) : undefined;
  const setResourceBranch = resource.setBranchId;
  const resourceBranch = resource.branchId;
  useEffect(() => {
    if (!branchPicked && suggestedBranch != null && suggestedBranch !== resourceBranch) setResourceBranch(suggestedBranch);
  }, [branchPicked, suggestedBranch, resourceBranch, setResourceBranch]);
  /** Выбранный мастер в это время занят — итог это показывает и не записывает. */
  const busy = isTime(time) && masterChosen && !!service && (isResource
    ? !resource.loadingChoice && !resource.slotsLoading && !resource.slotsError && !slotAtTime
    : lessonsReady && !lessonsLoading && !lessonsError && !joined && !eventFree?.isFree(time));

  // Индивидуальная: всё выбрано и время свободно — условия берутся сами,
  // один раз на набор выбора (отказ сервера не должен повторяться на каждый рендер).
  const autoKey = `${client?.id}|${resource.serviceId}|${resource.branchId}|${resource.teacherId}|${date}|${time}`;

  const quotedStart = resource.quote?.terms.domain.local_start.slice(0, 16);
  const selectedStart = `${date}T${time}`;
  const branchPending = !branchPicked && suggestedBranch != null && suggestedBranch !== resource.branchId;
  const { pick, quoting } = resource;
  useEffect(() => {
    if (!isResource || !masterChosen || conflict || availability.loading || resource.loadingChoice || resource.loadError
      || resource.slotsLoading || resource.slotsError || branchPending || step !== SUMMARY_STEP || client == null || quoting || quotedStart === selectedStart
      || autoPicked.current === autoKey || !slotAtTime) return;
    autoPicked.current = autoKey;
    void pick(slotAtTime);
  }, [isResource, masterChosen, conflict, availability.loading, resource.loadingChoice, resource.loadError, resource.slotsLoading,
    resource.slotsError, branchPending, step, client, quoting, quotedStart, selectedStart, autoKey, slotAtTime, pick]);

  const retryAvailability = () => {
    autoPicked.current = null;
    if (isResource) {
      if (resource.loadError) void resource.refreshChoice();
      void availability.refresh();
      void resource.refreshSlots();
    } else void refreshLessons();
  };
  const retryQuote = () => {
    if (!slotAtTime || availability.loading || resource.slotsLoading || resource.slotsError || branchPending) {
      retryAvailability();
      return;
    }
    autoPicked.current = autoKey;
    void pick(slotAtTime);
  };

  // Место не участвует в расписании (барбершоп) — зал не выбирается.
  const noHall = spaceIsAxis === false || halls.length === 0;
  const branch = branchId ?? branches[0]?.id ?? null;
  const pastTime = isTime(time) && isPastSlot(date, time, now);
  const ready = !conflict && !busy && !availability.loading && isTime(time) && !pastTime
    && masterChosen && (isResource
    ? !!resource.quote && quotedStart === selectedStart && !quoting && !branchPending && !resource.slotsLoading && !resource.slotsError && !resource.loadError
    : !lessonsError && (!needsClient || clientOptional || client != null) && service != null && masterChosen && teacherId != null && isTime(time) && !busy);

  const note = { notes: notes.trim(), photos: notePhotos.photos };
  const hasNote = note.notes !== '' || note.photos.length > 0;
  /** Снимок ещё летит на сервер — записывать рано: он бы потерялся. */
  const notePending = notePhotos.pending.length > 0;

  // «Оплата» на итоге «Индивидуального» с клиентом — по желанию. Отмечена —
  // после записи открывается то же окно оплаты, что у записанного в карточке
  // занятия (ReservationPayModal): над долгом новой брони, его считает
  // сервер. До записи брони нет, и чек посчитать не над чем — поэтому окно
  // после, а не на итоге, как у индивидуальной услуги. Деньги берут владелец
  // и администратор (тренеру касса закрыта). Отметка — под клиента: сменили
  // человека — решать заново.
  const canPayNow = soloLesson && client != null && getUserRoleFromToken() !== 'trainer';
  const [payFor, setPayFor] = useState<number | null>(null);
  const payNow = canPayNow && payFor === client!.id;
  const togglePay = () => { if (canPayNow) setPayFor(payNow ? null : client!.id); };
  /** Записанный, чей долг сейчас оплачивают; null — окна оплаты нет. */
  const [paying, setPaying] = useState<BookedClient | null>(null);
  /** Открыть окно оплаты новой брони. false — открывать нечего, мастер закрывается. */
  const openPayment = async (lessonId: number, reservationId: number) => {
    try {
      const detail = await scheduleApi.getLesson(lessonId);
      const booked = detail.booked_clients.find(b => b.reservation_id === reservationId);
      if (booked && booked.debt > 0) { setPaying(booked); return true; }
      // Долга нет — платить нечего: занятие ушло с абонемента или бесплатно.
      toast.info(t(booked?.by_subscription ? 'journal:payment.coveredBy.subscription' : 'journal:payment.coveredBy.free'));
    } catch {
      // Запись уже есть — оплату примут в карточке занятия.
      toast.error(t('journal:payment.loadFailed'));
    }
    return false;
  };

  const submit = async () => {
    if (!ready || saving || notePending || paying) return;
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
          total_spots: solo ? 1 : service!.max_clients ?? undefined,
          ...(hasNote ? note : {}),
        });
        target = lesson.id;
      }
      // Без клиента — только занятие: в индивидуальное его добавят потом
      // из карточки занятия или он запишется онлайн сам.
      if (!needsClient || client == null) {
        toast.info(t('journal:toasts.lessonAdded'));
        o.onCreated(date);
        o.onClose();
        return;
      }
      const reservation = await scheduleApi.createReservation(client!.id, target);
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
      o.onCreated(date);
      // Окно оплаты открылось — мастер ждёт его и закроется вместе с ним (finishPay).
      if (payNow && await openPayment(target, reservation.id)) return;
      o.onClose();
    } catch (err) {
      toast.error(errorMessage(err, t));
      // Занятие могло создаться, а запись — нет: сетка должна его показать.
      o.onCreated(date);
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
    solo, toggleSolo: () => setSolo(v => !v), canSolo, soloLesson, clientOptional,
    canPayNow, payNow, togglePay, paying,
    /** Долг новой брони оплачен: журнал перечитает её отметку «Оплата». */
    paid: () => { toast.info(t('journal:toasts.paymentAccepted')); o.onCreated(date); },
    /** Окно оплаты закрылось (оплатили или отказались) — запись уже есть, мастер закрывается. */
    finishPay: () => { setPaying(null); o.onClose(); },
    payLabel: [service?.name, time].filter(Boolean).join(' · '),
    clientName, priceText, durationMin, joined, busy, needsClient, client, fresh, service, teacherId, masterChosen, date, time,
    hallId, setHallId, branches, branch, setBranchId, noHall, isResource, serviceList, services, masters,
    serviceStates, masterStates, trainers, halls, resource, ready, pastTime, lessonsError, retryQuote, retryAvailability,
    pickResourceBranch: (id: number) => { setBranchPicked(true); autoPicked.current = null; resource.setBranchId(id); },
    saving: saving || resource.saving,
    dayLessons, lessonsReady: lessonsReady && !lessonsLoading, notBefore: isToday ? nowMin : null,
    pickClient, clearClient, addFreshClient, pickService, pickMaster, setWhen, pickTime, submit, pastAsk, acceptPast, choosePastOwn,
    canRepeat, repeat,
    notes, setNotes, notePhotos, notePending, settle,
  };
}

export type BookingWizardState = ReturnType<typeof useBookingWizard>;
