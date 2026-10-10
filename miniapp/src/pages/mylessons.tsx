import { useBusinessTerms } from '../hooks/useBusinessTerms';
import { useResourceBooking } from '../hooks/useResourceBooking';
import ResourceBookingSheet from '../components/booking/ResourceBookingSheet';
import type { StudioCatalog } from '../api/studio';
import { useState, useEffect, useMemo, useRef, useSyncExternalStore, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import UpcomingCard from '../components/mylessons/UpcomingCard';
import CoffeeStrip from '../components/mylessons/CoffeeStrip';
import PastCard from '../components/mylessons/PastCard';
import PeriodBar, { type PeriodMode } from '../components/mylessons/PeriodBar';
import MyLessonModal from '../components/modals/MyLessonModal';
import SupportModal from '../components/modals/SupportModal';
import { canPay } from '../components/mylessons/lesson/paymentState';
import { useLessonPay } from '../hooks/useLessonPay';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SectionLabel } from '../components/ui/SectionLabel';
import { ListSkeleton } from '../components/ui/ListSkeleton';
import { EmptyState } from '../components/ui/EmptyState';
import {
  getMyLessons,
  type CoffeeState,
  type UpcomingLessonResponse,
  type PastLessonResponse,
} from '../api/lessons';
import { cancelReservation } from '../api/user';
import { haptic, useTelegram } from '../hooks/useTelegram';
import { seedReviews } from '../components/mylessons/review/store';
import { notify } from '../lib/notify';
import { bumpLessons, useLessonsVersion } from '../lib/revision';
import { getPaymentSnapshot, subscribePayments, syncCheckouts } from '../lib/paymentSync';
import PaidBadge from '../components/payment/PaidBadge';

type MyLesson = UpcomingLessonResponse | PastLessonResponse;

/** Брони, чья оплата ещё сверяется, — строкой: снимок `useSyncExternalStore`
 *  обязан быть сравним по значению, иначе каждый вызов давал бы «изменение». */
const awaitingPaymentsKey = () => {
  const snapshot = getPaymentSnapshot();
  if (!snapshot.awaiting) return '';
  return snapshot.payments
    .filter((payment) => payment.status === 'pending' && payment.reservation_id != null)
    .map((payment) => payment.reservation_id)
    .join(',');
};

export default function MyLessons({ catalog = null }: { catalog?: StudioCatalog | null }) {
  const { t, i18n } = useTranslation();
  const business = useBusinessTerms();
  // Перенос идёт тем же выбором времени, что и новая запись, — другая пара
  // серверных команд внутри (quote переноса + expected_version).
  // Каталог — ради пояса студии и горизонта записи: лента дней переноса
  // обязана начинаться с «сегодня» студии и не уходить за её окно.
  const resource = useResourceBooking({ catalog });
  const { tg, vibrateLight, vibrateMedium } = useTelegram();

  const [upcoming, setUpcoming] = useState<UpcomingLessonResponse[]>([]);
  const [cancelled, setCancelled] = useState<PastLessonResponse[]>([]);
  const [past, setPast] = useState<PastLessonResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);
  // Последний применённый ответ — чтобы возврат в приложение с тем же списком
  // ничего не перерисовывал (см. fetchLessons).
  const lastPayload = useRef('');
  const [checkingPayment, setCheckingPayment] = useState(false);

  // Открытое занятие. Держим объектом, а не id: после отмены оно исчезает из
  // списков, и лист домигивал бы пустой шапкой, пока уезжает.
  const [activeLesson, setActiveLesson] = useState<MyLesson | null>(null);
  const [isPastLesson, setIsPastLesson] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  // «Оплатить» — из карточки и из листа; один запрос за раз на весь раздел.
  const lessonPay = useLessonPay();
  const [supportOpen, setSupportOpen] = useState(false);

  const [mode, setMode] = useState<PeriodMode>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  // Раздел остаётся смонтированным при переключении вкладок: о записи, сделанной
  // на главной или в расписании, он узнаёт из общей версии (lib/revision.ts).
  const lessonsVersion = useLessonsVersion();
  // Из сверки оплат разделу нужно одно — какие брони ждут подтверждения
  // оплаты. Подписка — на эту строку, а не на весь снимок: снимок
  // публикуется дважды за каждый опрос (флаг `busy` туда и обратно), раз в
  // 5 с первую минуту, и раздел — собранный заранее и живущий в DOM всегда —
  // перерисовывался бы целиком на каждый из них.
  const awaitingKey = useSyncExternalStore(subscribePayments, awaitingPaymentsKey);
  const awaitingIds = useMemo(() => new Set(awaitingKey ? awaitingKey.split(',').map(Number) : []), [awaitingKey]);
  const awaitingStripe = (lesson: MyLesson) => !lesson.paid_online && !lesson.payment_review && awaitingIds.has(lesson.reservation_id);

  const [countdowns, setCountdowns] = useState<{ [key: number]: string }>({});

  useEffect(() => {
    let disposed = false;
    let running = false;
    const fetchLessons = async () => {
      if (disposed || running) return;
      running = true;
      try {
        const data = await getMyLessons();
        if (disposed) return;
        // Раздел собран заранее и живёт в DOM всё время (App), а список
        // перечитывается на каждый возврат в приложение. Чаще всего приходит
        // тот же самый — новые массивы перерисовали бы весь раздел впустую.
        const payload = JSON.stringify(data);
        if (payload === lastPayload.current) return;
        lastPayload.current = payload;
        setUpcoming(data.upcoming);
        setPast(data.past);
        setCancelled(data.cancelled);
        setError(null);
        loaded.current = true;
        setActiveLesson(current => current
          ? [...data.upcoming, ...data.past, ...data.cancelled].find(item => item.reservation_id === current.reservation_id) ?? current
          : null);

        // Оценки и отзывы — в своё хранилище: на него подписан только блок
        // отзыва своей брони, и тап по сердцу не перерисовывает раздел.
        seedReviews(data.past);
      } catch (err) {
        if (!disposed && !loaded.current) setError(err instanceof Error ? err.message : t('mylessons.load_error'));
      } finally {
        running = false;
        if (!disposed) setIsLoading(false);
      }
    };
    const onReturn = () => { if (document.visibilityState !== 'hidden') void fetchLessons(); };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    void fetchLessons();
    return () => {
      disposed = true;
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [t, lessonsVersion]);

  const checkPayment = async () => {
    if (!activeLesson || checkingPayment) return;
    setCheckingPayment(true);
    try {
      const result = await syncCheckouts({ reservation_id: activeLesson.reservation_id });
      bumpLessons();
      if (result?.verification_unavailable) notify(t('payment.sync.unavailable'));
       else if (result?.payments.some(payment => payment.status === 'failed')) notify(t('lessonSheet.pay.review_hint'));
       else if (!result?.payments.some(payment => payment.status === 'paid')) notify(t('payment.sync.pending'));
    } catch {
      notify(t('payment.sync.unavailable'));
    } finally { setCheckingPayment(false); }
  };

  useEffect(() => {
    if (upcoming.length === 0) return;

    const updateCountdowns = () => {
      const now = Date.now();
      const next: { [key: number]: string } = {};

      upcoming.forEach((lesson) => {
        const diff = new Date(lesson.starts_at ?? lesson.start_time).getTime() - now;
        next[lesson.id] =
          diff > 0
            ? t('mylessons.remaining', {
                hours: Math.floor(diff / 3600000),
                minutes: Math.floor((diff % 3600000) / 60000),
              })
            : t('mylessons.lesson_started');
      });
      setCountdowns(next);
    };

    updateCountdowns();
    const interval = setInterval(updateCountdowns, 60000);
    return () => clearInterval(interval);
  }, [upcoming, t]);

  // Период считается на клиенте: /lessons/my отдаёт всю историю разом и
  // диапазона не принимает. Появится — фильтр переедет в запрос.
  const inPeriod = useMemo(() => {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();

    return (iso: string) => {
      const date = new Date(iso);
      if (date.getFullYear() !== year) return false;
      return mode === 'year' || date.getMonth() === month;
    };
  }, [anchor, mode]);

  const periodCancelled = useMemo(() => cancelled.filter((lesson) => inPeriod(lesson.start_time)), [cancelled, inPeriod]);
  const periodPast = useMemo(
    () => past.filter((lesson) => inPeriod(lesson.start_time)),
    [past, inPeriod],
  );
  const periodUpcoming = useMemo(
    () => upcoming.filter((lesson) => inPeriod(lesson.start_time)),
    [upcoming, inPeriod],
  );

  // Любимое направление периода — то, на которое клиент ходил чаще всего.
  const favourite = useMemo(() => {
    const counts = new Map<string, number>();
    periodPast.forEach((lesson) => counts.set(lesson.name, (counts.get(lesson.name) ?? 0) + 1));

    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return ranked.length > 0 ? ranked[0][0] : null;
  }, [periodPast]);

  const shiftPeriod = (direction: number) => {
    const next = new Date(anchor);
    if (mode === 'month') next.setMonth(next.getMonth() + direction);
    else next.setFullYear(next.getFullYear() + direction);
    setAnchor(next);
    vibrateLight();
  };

  const openLesson = (lesson: MyLesson, past: boolean) => {
    setActiveLesson(lesson);
    setIsPastLesson(past);
    setIsModalOpen(true);
    vibrateMedium();
  };

  /** Постоянная — для карточек прошедших под memo: страница перерисовывается
   *  от обратного отсчёта и оплат, карточки при этом стоят. */
  const openPast = useCallback((lesson: PastLessonResponse) => {
    setActiveLesson(lesson);
    setIsPastLesson(true);
    setIsModalOpen(true);
    haptic.medium();
  }, []);

  /** Ответ сервера про кофе — сразу в оба места, где он виден: карточка списка
   *  и открытый лист. Иначе одно из них показывало бы состояние до нажатия. */
  const applyCoffee = (lessonId: number, state: CoffeeState) => {
    setUpcoming((list) =>
      list.map((item) => (item.id === lessonId ? { ...item, coffee: state } : item)),
    );
    setActiveLesson((current) =>
      current && current.id === lessonId ? { ...current, coffee: state } : current,
    );
  };

  /** Отмена выбранной брони; соседняя запись на то же занятие сохраняется. */
  const cancelBooking = async () => {
    if (!activeLesson) return;

    setIsProcessing(true);
    try {
      await cancelReservation(activeLesson.reservation_id);
      // Освободившееся место видно и в расписании — объявляем изменение всем.
      bumpLessons();
      setIsModalOpen(false);
      notify(t('schedule.cancel_success'));
      if (tg) tg.HapticFeedback.notificationOccurred('success');
    } catch (err) {
      // Правила отмены (за сколько часов ещё можно) живут на сервере — его
      // текстом и объясняем отказ, вместо своей догадки.
      notify(err instanceof Error ? err.message : t('schedule.cancel_error'));
      if (tg) tg.HapticFeedback.notificationOccurred('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' });

  const translateName = (name?: string) =>
    name ? t(`lesson.name.${name}`, { defaultValue: name }) : '';

  const stats = [
    { label: t('mylessons.stat_visited'), value: String(periodPast.length) },
    { label: t('mylessons.stat_ahead'), value: String(periodUpcoming.length) },
    { label: t('mylessons.stat_total'), value: String(past.length) },
  ];

  return (
    <>
      <ScreenHeader title={business.message('my_bookings')} />

      {/* Полоса управления периодом и сводка — друг под другом на всех
          ширинах: один столбец сверху вниз читается без переучивания. */}
      <>
        <div className="pt-6 dt:pt-10">
          <PeriodBar mode={mode} onModeChange={setMode} anchor={anchor} onShift={shiftPeriod} />
        </div>

        {/* Сводка периода: три числа в ряд — сколько прожито, сколько впереди и
            сколько всего. Ради «всего» клиент и возвращается на этот экран. */}
        <div className="grid grid-cols-3 gap-2 px-5 pt-4 dt:gap-3">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-[18px] bg-card px-3 py-3.5 text-center shadow-soft dt:rounded-[20px] dt:px-4 dt:py-5"
            >
              <div className="text-[22px] font-extrabold leading-none tabular-nums tracking-[-0.04em] text-foreground dt:text-[30px]">
                {stat.value}
              </div>
              <div className="mt-1.5 text-[9.5px] font-bold uppercase leading-tight tracking-[0.1em] text-muted-foreground dt:mt-2.5 dt:text-[10px] dt:tracking-[0.16em]">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </>

      {favourite && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="mx-5 mt-2 flex items-center gap-2.5 rounded-[18px] bg-brand/10 px-4 py-3 dt:mt-5 dt:w-fit"
        >
          <svg viewBox="0 0 24 24" fill="var(--v-brand)" className="h-3.5 w-3.5 shrink-0">
            <path d="M12 21c-4-2.5-8-5.6-8-11a5 5 0 018-3.5A5 5 0 0120 10c0 5.4-4 8.5-8 11z" />
          </svg>
          <span className="text-[12.5px] font-bold text-foreground">
            {t('mylessons.favourite', { name: translateName(favourite) })}
          </span>
        </motion.div>
      )}

      {isLoading ? (
        <div className="pt-8">
          <ListSkeleton rows={3} />
        </div>
      ) : error ? (
        <EmptyState
          title={t('mylessons.load_error')}
          hint={error}
          icon={
            <>
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="13" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </>
          }
        />
      ) : periodUpcoming.length === 0 && periodPast.length === 0 && periodCancelled.length === 0 ? (
        <EmptyState
          title={t('mylessons.no_lessons_period')}
          hint={t('mylessons.no_lessons_period_hint')}
          icon={
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          }
        />
      ) : (
        <>
          {periodUpcoming.length > 0 && (
            <>
              <SectionLabel trailing={`${periodUpcoming.length}`}>
                {t('mylessons.status.upcoming')}
              </SectionLabel>
              <div className="flex flex-col gap-3 px-5 dt:gap-4">
                {periodUpcoming.map((cls, i) => (
                  <UpcomingCard
                    // Коврик в ключе: при «Повторной записи» у одного занятия
                    // бывает две брони, и по одному lesson_id React увидел бы
                    // дубль ключа и склеил карточки.
                    key={cls.reservation_id}
                    index={i}
                    title={translateName(cls.name)}
                    statusLabel={
                       cls.payment_review ? t('lessonSheet.pay.review_title') : awaitingStripe(cls) ? t('payment.sync.awaiting') : cls.status === 'pending'
                        ? t('mylessons.awaiting_confirmation')
                        : cls.status === 'hold' ? t('mylessons.status.hold') : t('mylessons.status.upcoming')
                    }
                    statusTone={cls.status === 'pending' || awaitingStripe(cls) ? 'brand' : 'neutral'}
                    meta={`${formatDate(cls.start_time)}, ${cls.time} · ${cls.teacher}`}
                    matLabel={cls.booking_mode === 'resource' ? '' : t('mylessons.mat_label', { spot: cls.spot_number })}
                    countdown={countdowns[cls.id] || t('mylessons.counting_time')}
                    paidOnline={cls.paid_online}
                    // Пока Stripe подтверждает оплату, второй формы не предлагаем.
                    pay={canPay(cls) && !awaitingStripe(cls) ? {
                      label: cls.status === 'hold'
                        ? t('lessonSheet.card.hold')
                        : t('lessonSheet.card.venue', { amount: cls.debt_str }),
                      action: lessonPay.payingId === cls.reservation_id
                        ? t('lessonSheet.pay.opening')
                        : t(cls.status === 'hold' ? 'lessonSheet.card.resume' : 'lessonSheet.card.pay'),
                      busy: lessonPay.payingId !== null,
                      onPay: () => void lessonPay.pay(cls.reservation_id),
                    } : undefined}
                    {...(cls.debt > 0
                      ? { paymentLabel: t('mylessons.unpaid', { amount: cls.debt_str }), paymentTone: 'debt' as const }
                      : cls.is_trial
                        ? { paymentLabel: t('mylessons.trial'), paymentTone: 'trial' as const }
                        : {})}
                    onOpen={() => openLesson(cls, false)}
                    footer={cls.booking_mode === 'event' &&
                      <CoffeeStrip
                        lessonId={cls.id}
                        coffee={cls.coffee}
                        onChange={(state) => applyCoffee(cls.id, state)}
                      />
                    }
                  />
                ))}
              </div>
            </>
          )}

          {periodCancelled.length > 0 && (
            <>
              <SectionLabel trailing={String(periodCancelled.length)}>{t('mylessons.status.cancelled')}</SectionLabel>
              <div className="flex flex-col gap-3 px-5 dt:gap-4">
                {periodCancelled.map((item) => (
                  <button key={item.reservation_id} type="button" onClick={() => openLesson(item, true)}
                    className="rounded-[22px] bg-card p-5 text-left shadow-soft">
                    <div className="font-bold text-card-foreground">{translateName(item.name)}</div>
                    <div className="mt-2 text-sm text-muted-foreground">{formatDate(item.start_time)}, {item.time} · {item.teacher}</div>
                    <div className="mt-2 text-xs text-muted-foreground">{t('mylessons.status.cancelled')}</div>
                    {item.paid_online && <div className="mt-3"><PaidBadge /></div>}
                  </button>
                ))}
              </div>
            </>
          )}

          {periodPast.length > 0 && (
            <>
              <SectionLabel trailing={`${periodPast.length}`}>
                {t('mylessons.status.past')}
              </SectionLabel>
              <div className="flex flex-col gap-3 px-5 dt:gap-4">
                {periodPast.map((cls, i) => (
                  <PastCard
                    key={cls.reservation_id}
                    index={i}
                    lesson={cls}
                    title={translateName(cls.name)}
                    meta={`${formatDate(cls.start_time)}, ${cls.time} · ${cls.teacher}`}
                    onOpen={openPast}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <ResourceBookingSheet flow={resource} layer={2} />

      <MyLessonModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        lesson={activeLesson}
        isPast={isPastLesson}
        title={translateName(activeLesson?.name)}
        dateLabel={activeLesson
          ? new Date(activeLesson.start_time).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
          : ''}
        countdown={activeLesson ? countdowns[activeLesson.id] : undefined}
        catalog={catalog}
        isProcessing={isProcessing}
        onPay={activeLesson && canPay(activeLesson) ? () => void lessonPay.pay(activeLesson.reservation_id) : undefined}
        paying={activeLesson != null && lessonPay.payingId === activeLesson.reservation_id}
        awaitingPayment={activeLesson != null && awaitingStripe(activeLesson)}
        onContact={catalog ? () => setSupportOpen(true) : undefined}
        checkingPayment={checkingPayment}
         onCheckPayment={activeLesson && (activeLesson.status === 'hold' || awaitingStripe(activeLesson)) ? checkPayment : undefined}
        onCancel={activeLesson?.allowed_actions.includes('cancel') ? cancelBooking : undefined}
        onReschedule={
          activeLesson?.allowed_actions.includes('reschedule') && activeLesson.service_id
            ? () => {
                setIsModalOpen(false);
                resource.open(
                  { id: activeLesson.service_id!, name: activeLesson.name },
                  activeLesson.branch_id,
                  { reservationId: activeLesson.reservation_id, version: activeLesson.version },
                );
              }
            : undefined
        }
        onCoffeeChange={
          activeLesson ? (state) => applyCoffee(activeLesson.id, state) : undefined
        }
      />

      {/* Контакты студии из листа занятия — поверх него, тем же листом, что в
          профиле: одно действие выглядит одинаково везде. */}
      <SupportModal
        isOpen={supportOpen}
        onClose={() => setSupportOpen(false)}
        studio={catalog?.studio ?? null}
        layer={1}
      />
    </>
  );
}
