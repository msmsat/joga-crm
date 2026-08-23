import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import HomeGreeting from '../components/home/HomeGreeting';
import StudioRail from '../components/home/StudioRail';
import StudioStrip from '../components/home/StudioStrip';
import StudioSheet from '../components/home/StudioSheet';
import StudioPickerSheet from '../components/home/StudioPickerSheet';
import NextLessonCard from '../components/home/NextLessonCard';
import DirectionsRail from '../components/home/DirectionsRail';
import ServiceScheduleSheet from '../components/schedule/ServiceScheduleSheet';
import { SectionLabel } from '../components/ui/SectionLabel';
import { ListSkeleton } from '../components/ui/ListSkeleton';
import { Badge } from '../components/ui/Badge';
import { Press } from '../components/ui/Press';
import BookingModal from '../components/modals/BookingModal';
import PhoneSheet from '../components/modals/PhoneSheet';
import SubscriptionSheet from '../components/modals/SubscriptionSheet';
import SuccessModal from '../components/modals/SuccessModal';
import CoffeeModal from '../components/modals/CoffeeModal';
import { getLiked, toggleLiked } from '../lib/likes';
import { type UserResponse } from '../api/auth';
import {
  getMyLessons,
  getNextLesson,
  type LessonResponse,
  type UpcomingLessonResponse,
} from '../api/lessons';
import type { Studio, StudioCatalog } from '../api/studio';
import { useTelegram } from '../hooks/useTelegram';
import { useLessonBooking } from '../hooks/useLessonBooking';

interface HomeProps {
  user: UserResponse | null;
  catalog: StudioCatalog | null;
  /** Переход в другой раздел кабинета — пустая главная должна куда-то вести. */
  onNavigate: (tab: string) => void;
  /** Отказ 402 ведёт в покупку абонемента — она живёт во вкладке профиля. */
  onBuySubscription: () => void;
  /** Бронь гостя: поднять существующий вход и продолжить ту же запись. */
  onNeedAuth: (retry: () => void) => void;
}

export default function Home({ user, catalog, onNavigate, onBuySubscription, onNeedAuth }: HomeProps) {
  const branches = catalog?.branches ?? [];
  // Филиалов несколько — карточка студии становится выбором (лента с
  // примагничиванием), один — просто местом. Счётчик у метки нужен только в
  // первом случае: «1» рядом со «Студії» ничего не считает.
  const isMultiStudio = branches.length > 1;
  const isAuthed = Boolean(user);

  const [activeStudioId, setActiveStudioId] = useState<number | null>(branches[0]?.id ?? null);
  const [liked, setLiked] = useState<number[]>(getLiked);

  // Лист выбора филиала. Открывается только из направления: клиент уже выбрал,
  // ЧТО, осталось решить где. Отдельного входа «посмотреть все студии» нет —
  // для этого есть карточка студии выше, тап по ней открывает саму студию.
  const [pendingService, setPendingService] = useState<string | null>(null);
  const [openedStudio, setOpenedStudio] = useState<Studio | null>(null);
  const [schedule, setSchedule] = useState<{ serviceId: string; studio: Studio | null } | null>(null);
  const [scheduleTick, setScheduleTick] = useState(0);

  // Два источника главной карточки: ближайшее занятие студии (предложение,
  // видно и гостю) и ближайшая СВОЯ бронь клиента. Своя сильнее — см. `hero`.
  const [studioNext, setStudioNext] = useState<LessonResponse | null>(null);
  const [myNext, setMyNext] = useState<UpcomingLessonResponse | null>(null);
  const [isHeroLoading, setIsHeroLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  const { vibrateMedium, vibrateLight } = useTelegram();
  const { t, i18n } = useTranslation();

  // Оба запроса разом и один флаг загрузки на двоих: иначе карточка успевала
  // показать предложение записаться и через мгновение подменялась своей бронью.
  // Ошибка любого из них — не экран ошибки, а просто отсутствие карточки: без
  // ближайшего занятия главная показывает вход в расписание.
  //
  // Скелет показывается только в первый раз: при перечитывании после записи
  // карточка остаётся на месте и меняется, когда данные пришли. Мигать скелетом
  // на экране, который человек уже видит, — худшее из обоих состояний.
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getNextLesson().catch((err) => {
        console.error('Не вдалося завантажити найближче заняття:', err);
        return null;
      }),
      // Своих занятий у гостя нет — и ручка ответила бы ему 401.
      user
        ? getMyLessons()
            .then((data) => data.upcoming[0] ?? null)
            .catch((err) => {
              console.error('Не вдалося завантажити мої заняття:', err);
              return null;
            })
        : Promise.resolve(null),
    ]).then(([next, mine]) => {
      if (cancelled) return;
      setStudioNext(next);
      setMyNext(mine);
      setIsHeroLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user, reloadTick]);

  // Запись и отмена — общие с расписанием (useLessonBooking). Главной после
  // них нужно перечитать и «ближайшее занятие», и открытый лист услуги.
  const booking = useLessonBooking({
    onChanged: () => {
      setReloadTick((tick) => tick + 1);
      setScheduleTick((tick) => tick + 1);
    },
    messages: {
      bookError: t('home.booking_error'),
      cancelError: t('home.cancel_booking_error'),
      cancelSuccess: t('home.cancel_booking_success'),
    },
    onNeedAuth,
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.greeting_morning');
    if (hour < 18) return t('home.greeting_afternoon');
    return t('home.greeting_evening');
  };

  const handleLike = (id: number) => {
    setLiked(toggleLiked(id));
    vibrateLight();
  };

  // Направление ведёт в расписание услуги. Студию спрашиваем только тогда,
  // когда их правда несколько — иначе вопрос без выбора.
  const openDirection = (serviceId: string) => {
    vibrateMedium();
    if (isMultiStudio) {
      setPendingService(serviceId);
    } else {
      setSchedule({ serviceId, studio: null });
    }
  };

  const pickStudio = (studio: Studio) => {
    if (!pendingService) return;

    setActiveStudioId(studio.id);
    setSchedule({ serviceId: pendingService, studio });
    setPendingService(null);
  };

  /**
   * «Сьогодні», «Завтра» — дальше сама дата.
   *
   * Раньше здесь стояла проверка «не сегодня → завтра», и занятие через шесть
   * дней подписывалось «Завтра». Сравниваем календарные дни, а не часы: занятие
   * в 09:00 завтра отстоит меньше чем на сутки, но это всё равно завтра.
   */
  const whenLabel = (startTime: string) => {
    const start = new Date(startTime);
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((startDay.getTime() - today.getTime()) / 86_400_000);

    if (days <= 0) return t('home.today');
    if (days === 1) return t('home.tomorrow');
    return start.toLocaleDateString(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };

  // Своя бронь важнее предложения студии: клиенту нужно его собственное
  // ближайшее занятие, а не витрина. Гостю выбирать не из чего — у него всегда
  // предложение. Две карточки подряд намеренно не показываем: главная перестаёт
  // быть главной, как только на ней два одинаково громких объекта.
  const hero = myNext ?? studioNext;
  const isMine = myNext !== null;

  const heroMeta = hero
    ? [
        hero.teacher,
        `${hero.duration_min} ${t('common.minutes')}`,
        // У своей брони третьим числом идёт коврик — место уже занято, и
        // свободные места клиента больше не касаются. У предложения — сколько
        // мест осталось: total_spots минус занятые, а не «всего в зале».
        isMine && myNext
          ? t('mylessons.mat_label', { spot: myNext.spot_number })
          : `${Math.max(0, hero.total_spots - hero.taken_spots.length)} ${t('home.spots')}`,
      ].join(' · ')
    : '';

  const heroBadge = isMine ? (
    myNext?.status === 'pending' ? (
      <Badge tone="warning">{t('mylessons.awaiting_confirmation')}</Badge>
    ) : (
      <Badge tone="success">{t('schedule.booked')}</Badge>
    )
  ) : undefined;

  /* Главное занятие экрана: своя бронь, предложение студии или — если ни того,
     ни другого нет — вход в расписание. Пустое состояние стоит на том же месте
     и ведёт туда же, куда вела бы карточка: главная без занятия обязана
     предлагать записаться, а не сообщать, что записей нет. */
  const lessonBlock = isHeroLoading ? (
    <>
      <SectionLabel>{t('home.next_lesson')}</SectionLabel>
      <ListSkeleton rows={1} />
    </>
  ) : hero ? (
    <>
      <SectionLabel>{isMine ? t('home.your_lesson') : t('home.next_lesson')}</SectionLabel>
      <NextLessonCard
        dayLabel={whenLabel(hero.start_time)}
        time={hero.time}
        title={t(`lesson.name.${hero.name}`, { defaultValue: hero.name })}
        meta={heroMeta}
        startTime={hero.start_time}
        badge={heroBadge}
        onClick={() => booking.openModal(hero)}
      />
    </>
  ) : (
    <>
      <SectionLabel>{t('home.no_next_lesson')}</SectionLabel>
      <div className="px-5">
        <Press
          onClick={() => onNavigate('sched')}
          role="button"
          tabIndex={0}
          className="group flex cursor-pointer items-center gap-4 rounded-[22px] bg-card p-5 shadow-soft ring-1 ring-inset ring-brand/25 transition-shadow duration-300 dt:rounded-[26px] dt:p-7 dt:hover:shadow-lift"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 dt:h-12 dt:w-12">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </span>

          <span className="min-w-0 flex-1 text-[14.5px] font-extrabold leading-snug tracking-[-0.01em] text-card-foreground dt:text-[16px]">
            {t('home.book_now')}
          </span>

          <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 transition-transform duration-300 dt:group-hover:translate-x-1">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Press>
      </div>
    </>
  );

  /* Направления — над ближайшим занятием: сначала «что здесь бывает», потом
     «ближайшее из этого». Метка без чипов читалась бы поломкой, поэтому у
     студии без единой услуги блока нет вовсе. */
  const directionsBlock = (catalog?.services.length ?? 0) > 0 && (
    <>
      <SectionLabel>{t('home.directions')}</SectionLabel>
      <DirectionsRail services={catalog?.services ?? []} onSelect={openDirection} />
    </>
  );

  /* Студия у гостя и у клиента весит по-разному. Гостю она отвечает на «что это
     за место» — значит кадр, название и часы. Клиенту, который сюда ходит, всё
     это уже известно: ему хватает строки с состоянием, а подробности остались
     за тем же тапом. Выбор филиала (когда их несколько) остаётся лентой в обоих
     случаях — это выбор, а не витрина. */
  const studioBlock =
    branches.length === 0 ? null : isAuthed && !isMultiStudio ? (
      <div className="pt-7 dt:pt-12">
        <StudioStrip
          studio={branches[0]}
          onOpen={() => setOpenedStudio(branches[0])}
          accentColor={catalog?.studio.accent_color ?? '#F9A08B'}
        />
      </div>
    ) : (
      <>
        {isMultiStudio ? (
          <SectionLabel trailing={`${branches.length}`}>{t('home.studios')}</SectionLabel>
        ) : (
          <div className="pt-7 dt:pt-12" />
        )}

        <StudioRail
          studios={branches}
          activeId={activeStudioId ?? branches[0]?.id ?? 0}
          onSelect={setActiveStudioId}
          liked={liked}
          onOpen={setOpenedStudio}
          onToggleLike={handleLike}
          accentColor={catalog?.studio.accent_color ?? '#F9A08B'}
        />
      </>
    );

  return (
    <div className="relative">
      {/* Один порядок блоков на всех ширинах, но разный у гостя и у клиента:
          гость читает студию → направления → занятие, клиент — направления →
          своё занятие → студию. Раскладывать блоки по колонкам на десктопе
          оказалось хуже: блок без данных повисал в строке с именем клиента, а
          глазу приходилось читать экран зигзагом вместо сверху вниз. */}
      <HomeGreeting
        greeting={getGreeting()}
        name={user?.name || t('home.guest_name')}
        studioName={catalog?.studio.name}
        logoUrl={catalog?.studio.logo_url}
      />

      {isAuthed ? (
        <>
          {directionsBlock}
          {lessonBlock}
          {studioBlock}
        </>
      ) : (
        <>
          {studioBlock}
          {directionsBlock}
          {lessonBlock}
        </>
      )}

      <StudioPickerSheet
        isOpen={pendingService !== null}
        onClose={() => setPendingService(null)}
        studios={branches}
        activeId={activeStudioId ?? branches[0]?.id ?? 0}
        onPick={pickStudio}
      />

      <StudioSheet
        isOpen={openedStudio !== null}
        onClose={() => setOpenedStudio(null)}
        studio={openedStudio}
        services={catalog?.services ?? []}
        isLiked={openedStudio ? liked.includes(openedStudio.id) : false}
        onToggleLike={() => openedStudio && handleLike(openedStudio.id)}
        onServicePick={(service) =>
          setSchedule({ serviceId: service.name, studio: openedStudio })
        }
      />

      <ServiceScheduleSheet
        isOpen={schedule !== null}
        onClose={() => setSchedule(null)}
        serviceId={schedule?.serviceId ?? null}
        studio={schedule?.studio ?? null}
        refreshKey={scheduleTick}
        onLessonPick={booking.openModal}
      />

      <BookingModal
        isOpen={booking.isModalOpen}
        onClose={booking.closeModal}
        layer={2}
        selectedSpot={booking.selectedSpot}
        onSpotSelect={booking.setSelectedSpot}
        isProcessing={booking.isProcessing}
        onPay={booking.pay}
        onCancel={booking.cancelBooking}
        lesson={booking.activeLesson}
        allowRepeat={Boolean(catalog?.rules.repeat_booking_allowed)}
      />

      <PhoneSheet
        isOpen={booking.needsPhone}
        onClose={booking.closePhone}
        onSaved={booking.retryAfterPhone}
        layer={3}
      />

      <SubscriptionSheet
        isOpen={booking.needsSubscription !== null}
        onClose={booking.closeSubscription}
        message={booking.needsSubscription}
        onBuy={() => { booking.closeSubscription(); onBuySubscription(); }}
        layer={3}
      />

      <SuccessModal
        isOpen={booking.isSuccessOpen}
        onClose={booking.closeSuccess}
        lesson={booking.activeLesson}
        awaitingConfirmation={Boolean(catalog?.rules.confirmation_required)}
        layer={3}
      />

      <CoffeeModal
        isOpen={booking.isCoffeeOpen}
        onClose={booking.closeCoffee}
        lessonId={booking.activeLesson?.id ?? null}
        coffee={booking.coffee}
        onJoined={() => setScheduleTick((tick) => tick + 1)}
        layer={3}
      />
    </div>
  );
}
