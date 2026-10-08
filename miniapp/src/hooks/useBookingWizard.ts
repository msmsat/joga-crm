import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hybridApi } from '../api/hybrid.api';
import type { ApiError } from '../api/client';
import type {
  BookingRead, ClientConfirmPayment, QuoteRead, ResourceStaffMember, ServiceDayRow,
} from '../api/hybrid.types';
import type { StudioCatalog } from '../api/studio';
import { ANY, isBookableResource, offeredServices } from '../lib/bookingPage';
import type { ResourceFocus } from '../lib/entry';
import { bumpLessons } from '../lib/revision';
import { spawnPetals } from '../lib/petals';
import { getSession } from '../lib/session';
import { availabilityQuery, dayList, lastBookableDay, studioToday, timeOf, type IsoDay } from '../lib/slots';
import {
  branchOf, emptyPick, isComplete, minutesOf, nextStep, onService, reconcileTime, shownStep, soloOf, stepsFor,
  withSoloMaster, type WizardPick, type WizardStep,
} from '../lib/wizard';
import type { MasterChoice } from '../lib/bookingPage';
import { useTelegram } from './useTelegram';
import { useBookingPaymentStatus } from './useBookingPaymentStatus';

/** Способ оплаты записи: на месте или онлайн (форма Stripe). */
export type PayMethod = 'venue' | 'card';

type Day = { rows: ServiceDayRow[] | null; error: boolean };

type Quoted = { key: string; method: PayMethod; data: QuoteRead };

/** Отказы, после которых показанное время уже неправда. */
const SLOT_GONE = new Set(['SLOT_UNAVAILABLE', 'CONFIG_INCOMPLETE', 'VERSION_CONFLICT']);

type Options = {
  catalog: StudioCatalog | null;
  /** Гость дошёл до условий: поднять вход и повторить тот же шаг. */
  onNeedAuth: (retry: () => void) => void;
};

/**
 * Мастер записи с главной: время, услуга и мастер в любом порядке, итог и оплата.
 *
 * Что совместимо с чем, решает чистая модель (`lib/wizard.ts`); здесь — данные
 * и сеть: кто какие услуги ведёт (`resource-staff`), снимок свободного времени
 * дня (`availability/services`, один запрос на день, ответы кешируются), quote
 * и подтверждение. Условия (цена, мастер «любого», основание оплаты) называет
 * сервер — итог показывает их только из quote.
 */
export function useBookingWizard({ catalog, onNeedAuth }: Options) {
  const { t } = useTranslation();
  const { tg, isInTelegram, vibrateLight, vibrateMedium } = useTelegram();
  // «Предоплата при записи»: без абонемента на месте не записывают — платят
  // онлайн, если студия это принимает. Не принимает — сервер ответит 402, и
  // клиента поведут в покупку абонемента, как и раньше.
  const prepay = Boolean(catalog?.rules.prepay_required);
  const defaultMethod: PayMethod = prepay && catalog?.can_pay_online ? 'card' : 'venue';
  const today = studioToday(catalog?.studio.tz_iana);
  const days = useMemo(
    () => dayList(today, lastBookableDay(today, catalog?.rules.booking_window_days)),
    [today, catalog?.rules.booking_window_days],
  );

  const [isOpen, setIsOpen] = useState(false);
  const [rawStep, setStep] = useState<WizardStep>('time');
  // Куда листнули: 1 — вперёд по вкладкам, -1 — назад. Раздел въезжает с этой стороны.
  const [dir, setDir] = useState(1);
  // Выбор человека. Единственный мастер в нём не хранится — подставляется
  // при чтении (`pick` ниже).
  const [chosen, setPick] = useState<WizardPick>(() => emptyPick(today));
  // Филиал, выбранный на главной до открытия листа; `null` — все. Он не
  // первый шаг, а рамка: время ищется только в нём, мастера — только его.
  const [scope, setScope] = useState<number | null>(null);
  const [staff, setStaff] = useState<ResourceStaffMember[] | null>(null);
  const [staffError, setStaffError] = useState(false);
  const [staffAttempt, setStaffAttempt] = useState(0);
  const [byDay, setByDay] = useState<Record<IsoDay, Day>>({});
  const [quoted, setQuoted] = useState<Quoted | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingRead | null>(null);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [needsSubscription, setNeedsSubscription] = useState<string | null>(null);
  // Номер попытки quote: ответ прошлого выбора не перезапишет текущий.
  const attempt = useRef(0);
  // Повтор после телефона: то, что человек нажимал, когда сервер попросил номер.
  const retry = useRef<(() => void) | null>(null);

  // Мастера — один раз за открытие студии: список не зависит ни от дня, ни от выбора.
  useEffect(() => {
    if (!isOpen || staff !== null) return;
    let cancelled = false;
    hybridApi.resourceStaff({})
      .then((data) => { if (!cancelled) { setStaff(data.staff); setStaffError(false); } })
      .catch(() => { if (!cancelled) setStaffError(true); });
    return () => { cancelled = true; };
  }, [isOpen, staff, staffAttempt]);

  // Снимок дня — по требованию, один раз на день. Ошибка остаётся в кеше до «Повторить».
  const dayState = byDay[chosen.day];
  useEffect(() => {
    if (!isOpen || dayState) return;
    const day = chosen.day;
    let cancelled = false;
    hybridApi.servicesDay(day)
      .then((data) => {
        if (cancelled) return;
        setByDay((prev) => ({ ...prev, [day]: { rows: data.services, error: false } }));
        // Время, которого в этом дне нет, снимается, когда день приехал.
        setPick((current) => (current.day === day ? reconcileTime(current, data.services) : current));
      })
      .catch(() => {
        if (!cancelled) setByDay((prev) => ({ ...prev, [day]: { rows: null, error: true } }));
      });
    return () => { cancelled = true; };
  }, [isOpen, chosen.day, dayState]);

  const rows = dayState?.rows ?? null;
  // Мастера филиала — сужением уже полученного списка, а не вторым запросом:
  // `branch_ids` в ответе есть у каждого, а смена филиала на главной не
  // должна стоить скелета в листе.
  const members = useMemo(
    () => (staff ?? []).filter((row) => scope === null || row.branch_ids.includes(scope)),
    [staff, scope],
  );
  const services = useMemo(
    () => offeredServices(members, (catalog?.services ?? []).filter(isBookableResource)),
    [members, catalog?.services],
  );
  // Мастер один — раздела «Мастер» нет, а сам он подставлен в выбор. Пока
  // список мастеров не пришёл, число вкладок подсказывает каталог студии:
  // лист открывается сразу таким, каким и останется.
  const solo = staff !== null ? soloOf(members) : null;
  const soloMaster = staff !== null ? solo !== null : catalog?.staff.length === 1;
  const steps = useMemo(() => stepsFor(soloMaster), [soloMaster]);
  const pick = useMemo(() => withSoloMaster(chosen, solo), [chosen, solo]);
  // Раздел, которого больше нет (мастеров оказалось меньше, чем обещал
  // каталог), открыт не будет — на его месте итог.
  const step = shownStep(rawStep, steps);
  const service = services.find((row) => row.id === pick.serviceId) ?? null;
  const master = typeof pick.master === 'number' ? members.find((row) => row.teacher_id === pick.master) ?? null : null;
  const branchId = rows ? branchOf(scope === null ? rows : rows.filter(row => row.branch_id === scope), pick) : null;
  const complete = isComplete(pick) && branchId !== null;
  const pickKey = `${pick.day}|${pick.time}|${pick.serviceId}|${pick.master}|${branchId}`;
  const quote = quoted && quoted.key === pickKey ? quoted : null;
  const paymentStatus = useBookingPaymentStatus(isOpen, quote?.data.quote_id ?? null, booking, setBooking);

  const invalidateQuote = () => {
    attempt.current += 1;
    setQuoted(null);
    setQuoting(false);
  };

  const goTo = (next: WizardStep) => {
    const target = shownStep(next, steps);
    setDir(steps.indexOf(target) >= steps.indexOf(step) ? 1 : -1);
    setStep(target);
    setNotice(null);
  };

  /** Выбор в разделе ведёт дальше — в ближайший невыбранный или на итог. */
  const advance = (next: WizardPick, from: WizardStep) => {
    invalidateQuote();
    setPick(next);
    vibrateLight();
    goTo(nextStep(next, from));
  };

  /** `branch` — филиал с главной: выбор открывается уже в нём (`rowsFor`
   *  отсекает окна других адресов), `null` — во всех. `preset` — услуга и
   *  мастер, уже названные QR-кодом студии (`lib/entry.wizardFocusOf`). */
  const open = (first: WizardStep, branch: number | null = null, preset: ResourceFocus = {}) => {
    invalidateQuote();
    setScope(branch);
    setPick({
      ...emptyPick(today),
      branchId: branch,
      serviceId: preset.serviceId ?? null,
      master: preset.master ?? null,
    });
    setQuoted(null);
    setBooking(null);
    setNotice(null);
    // Каждое открытие — свежее время: пока лист был закрыт, окна могли занять.
    setByDay({});
    setDir(1);
    setStep(first);
    setIsOpen(true);
    vibrateMedium();
  };

  function fail(error: ApiError) {
    if (error.status === 428) {
      setNeedsPhone(true);
      return;
    }
    if (error.status === 402) {
      setNeedsSubscription(error.code ? t('subscriptionSheet.hint') : error.message);
      return;
    }
    const code = error.code ?? 'UNKNOWN';
    setNotice(code);
    if (tg) tg.HapticFeedback.notificationOccurred('error');
    if (SLOT_GONE.has(code)) {
      // Окно ушло — перечитать день и вернуть к выбору времени.
      setByDay((prev) => {
        const next = { ...prev };
        delete next[pick.day];
        return next;
      });
      setPick((current) => ({ ...current, time: null }));
      setStep('time');
    }
  }

  /**
   * Условия записи у сервера. Конкретный момент начала берётся у `availability`
   * выбранной услуги: снимок дня знает минуты, а quote принимает только тот
   * `starts_at`, который сервер сам выдал.
   */
  const requestQuote = async (method: PayMethod = defaultMethod): Promise<Quoted | null> => {
    if (!complete || pick.time === null || pick.serviceId === null || branchId === null) return null;
    if (!getSession()) {
      onNeedAuth(() => void requestQuote(method));
      return null;
    }
    const id = ++attempt.current;
    const key = pickKey;
    const teacherId = typeof pick.master === 'number' ? pick.master : null;
    setQuoting(true);
    setNotice(current => current === 'TERMS_REFRESHED' ? current : null);
    try {
      const free = await hybridApi.availability(availabilityQuery({
        serviceId: pick.serviceId, branchId, teacherId, from: pick.day, to: pick.day,
      }));
      const slot = free.slots.find((row) => minutesOf(timeOf(row.local_start)) === pick.time);
      if (!slot) throw Object.assign(new Error('SLOT_UNAVAILABLE'), { status: 409, code: 'SLOT_UNAVAILABLE' });
      const data = await hybridApi.quote({
        booking_mode: 'resource', service_id: pick.serviceId, branch_id: branchId,
        // «Любой» становится конкретным мастером здесь — первым свободным в слоте.
        teacher_id: teacherId ?? slot.teacher_ids[0] ?? null,
        starts_at: slot.starts_at, payment_method: method,
      });
      const result = { key, method, data };
      if (id !== attempt.current) return null;
      setQuoted(result);
      return result;
    } catch (error) {
      if (id === attempt.current) fail(error as ApiError);
      return null;
    } finally {
      if (id === attempt.current) setQuoting(false);
    }
  };

  // Итог открыт и выбрано всё — условия считаются сами (у гостя — после входа).
  useEffect(() => {
    if (!isOpen || step !== 'summary' || !complete || quote || quoting || !getSession()) return;
    void requestQuote(defaultMethod);
    // `requestQuote` пересоздаётся каждым рендером; ключ выбора — в pickKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, step, complete, pickKey, Boolean(quote)]);

  /**
   * Записать. `payment` — коды клиента и итог из чека; `null` — платить нечего
   * (абонемент, пробное) или кодов нет. Способ оплаты живёт в quote: другой
   * способ — новые условия на тот же слот, и только потом подтверждение.
   */
  const submit = async (method: PayMethod, payment: ClientConfirmPayment | null) => {
    if (submitting.current) return;
    submitting.current = true;
    retry.current = () => void submit(method, payment);
    setSaving(true);
    setNotice(null);
    try {
      let current = quote;
      if (!current || current.method !== method) current = await requestQuote(method);
      if (!current) return;
      const result = await hybridApi.confirm(current.data.quote_id, payment ?? undefined);
      setBooking(result);
      bumpLessons();
      spawnPetals();
      if (tg) tg.HapticFeedback.notificationOccurred('success');
      // Telegram can open its browser after a request. In a regular browser,
      // WizardDone provides a direct link and keeps this booking tab available.
      if (result.payment_url && isInTelegram && tg?.openLink) openPayment(result.payment_url);
    } catch (error) {
      const failure = error as ApiError;
      // Условия устарели — пересчитать их на тот же слот; подтверждать заново
      // человек обязан сам: сумма могла измениться.
      if (failure.code === 'TERMS_CHANGED' || failure.code === 'QUOTE_EXPIRED') {
        setQuoted(null);
        setNotice('TERMS_REFRESHED');
        await requestQuote(method);
      } else {
        fail(failure);
      }
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  /** Browser links use native navigation; Telegram delegates to its SDK. */
  const openPayment = (url: string, event?: { preventDefault: () => void }) => {
    if (isInTelegram && tg?.openLink) {
      event?.preventDefault();
      tg.openLink(url);
    }
  };

  return {
    isOpen, open, close: () => { invalidateQuote(); setIsOpen(false); },
    step, steps, dir, goTo, today, days,
    pick, advance,
    pickDay: (day: IsoDay) => { invalidateQuote(); setPick((current) => ({ ...current, day })); setNotice(null); vibrateLight(); },
    pickTime: (time: number) => advance({ ...pick, time }, 'time'),
    pickService: (id: number) => advance(onService(pick, id, members), 'service'),
    pickMaster: (choice: MasterChoice) => advance({ ...pick, master: choice }, 'master'),
    pickBranch: (id: number) => { invalidateQuote(); setPick((current) => ({ ...current, branchId: id })); setNotice(null); },
    staff: members, staffLoading: staff === null && !staffError, staffError,
    retryStaff: () => { setStaffError(false); setStaff(null); setStaffAttempt(value => value + 1); },
    // Дня нет в кеше — значит, он грузится: запись в кеш появляется с ответом.
    rows, dayLoading: !dayState,
    dayError: Boolean(dayState?.error),
    retryDay: () => setByDay((prev) => {
      const next = { ...prev };
      delete next[pick.day];
      return next;
    }),
    services, service, master, branchId, complete,
    /** Филиал задан на главной — в итоге его уже не выбирают. */
    scope,
    quote: quote?.data ?? null, quoting, requestQuote, defaultMethod,
    /** На месте записать нельзя — только онлайн (предоплата студии). */
    venueAllowed: !prepay,
    notice, booking, saving, submit, openPayment, ...paymentStatus,
    needsPhone,
    closePhone: () => setNeedsPhone(false),
    retryAfterPhone: () => { setNeedsPhone(false); retry.current?.(); },
    needsSubscription,
    closeSubscription: () => setNeedsSubscription(null),
    isAny: pick.master === ANY,
  };
}

export type BookingWizardFlow = ReturnType<typeof useBookingWizard>;
