import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import HomeGreeting from '../components/home/HomeGreeting';
import StudioRail from '../components/home/StudioRail';
import StudioSheet from '../components/home/StudioSheet';
import StudioPickerSheet from '../components/home/StudioPickerSheet';
import NextLessonCard from '../components/home/NextLessonCard';
import DirectionsRail from '../components/home/DirectionsRail';
import ServiceScheduleSheet from '../components/schedule/ServiceScheduleSheet';
import { SectionLabel } from '../components/ui/SectionLabel';
import { Press } from '../components/ui/Press';
import BookingModal from '../components/modals/BookingModal';
import PhoneSheet from '../components/modals/PhoneSheet';
import SubscriptionSheet from '../components/modals/SubscriptionSheet';
import SuccessModal from '../components/modals/SuccessModal';
import CoffeeModal from '../components/modals/CoffeeModal';
import { getLiked, toggleLiked } from '../lib/likes';
import { type UserResponse } from '../api/auth';
import { getNextLesson, type LessonResponse } from '../api/lessons';
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
  // Лента рисуется и для одного филиала: карточка — единственный вход в
  // описание студии (фото, адрес, часы, StudioSheet), а филиал ровно один у
  // большинства студий. Счётчик при этом прячем — «1» рядом с «Студії» пустой.
  const isMultiStudio = branches.length > 1;

  const [activeStudioId, setActiveStudioId] = useState<number | null>(branches[0]?.id ?? null);
  const [liked, setLiked] = useState<number[]>(getLiked);

  // Лист выбора филиала. Открывается только из направления: клиент уже выбрал,
  // ЧТО, осталось решить где. Отдельного входа «посмотреть все студии» нет —
  // для этого есть лента студий выше, тап по карточке открывает саму студию.
  const [pendingService, setPendingService] = useState<string | null>(null);
  const [openedStudio, setOpenedStudio] = useState<Studio | null>(null);
  const [schedule, setSchedule] = useState<{ serviceId: string; studio: Studio | null } | null>(null);
  const [scheduleTick, setScheduleTick] = useState(0);

  const [heroLesson, setHeroLesson] = useState<LessonResponse | null>(null);
  const [isHeroLoading, setIsHeroLoading] = useState(true);

  const { vibrateMedium, vibrateLight } = useTelegram();
  const { t } = useTranslation();

  const loadHeroLesson = () => {
    getNextLesson()
      .then((lesson) => {
        setHeroLesson(lesson);
        setIsHeroLoading(false);
      })
      .catch((err) => {
        console.error('Не вдалося завантажити головне заняття:', err);
        setIsHeroLoading(false);
      });
  };

  useEffect(() => {
    loadHeroLesson();
  }, []);

  // Запись и отмена — общие с расписанием (useLessonBooking). Главной после
  // них нужно перечитать и «ближайшее занятие», и открытый лист услуги.
  const booking = useLessonBooking({
    onChanged: () => {
      loadHeroLesson();
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

  const isTomorrow = (() => {
    if (!heroLesson?.start_time) return false;
    const lessonDate = new Date(heroLesson.start_time);
    const today = new Date();
    return (
      lessonDate.getDate() !== today.getDate() ||
      lessonDate.getMonth() !== today.getMonth() ||
      lessonDate.getFullYear() !== today.getFullYear()
    );
  })();

  return (
    <div className="relative">
      {/* Один порядок блоков на всех ширинах: приветствие → студии →
          ближайшее занятие → направления → приглашение. Раскладывать их по
          колонкам на десктопе оказалось хуже: блок без данных («ближайшее
          занятие» пустует регулярно) повисал в строке с именем клиента, а
          глазу приходилось читать экран зигзагом вместо сверху вниз. */}
      <HomeGreeting
        greeting={getGreeting()}
        name={user?.name || t('home.guest_name')}
        studioName={catalog?.studio.name}
        logoUrl={catalog?.studio.logo_url}
      />

      {branches.length > 0 && (
        <>
          <SectionLabel trailing={isMultiStudio ? `${branches.length}` : undefined}>
            {t('home.studios', { defaultValue: 'Студії' })}
          </SectionLabel>

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
      )}

      {/* Карточка занятия — строка «время · название · стрелка» с живым
          отсчётом. Пустое состояние стоит на том же месте и ведёт в
          расписание: главная без ближайшего занятия обязана предлагать
          записаться, а не сообщать, что записей нет. */}
      {isHeroLoading ? null : heroLesson ? (
        <>
          <SectionLabel>
            {isTomorrow
              ? t('home.lesson_tomorrow_at', { time: heroLesson.time })
              : t('home.lesson_today_at', { time: heroLesson.time })}
          </SectionLabel>
          <NextLessonCard
            time={heroLesson.time}
            dayLabel={isTomorrow ? t('home.tomorrow') : t('home.today')}
            title={t(`lesson.name.${heroLesson.name}`, { defaultValue: heroLesson.name })}
            meta={`${heroLesson.teacher} · ${heroLesson.duration_min} ${t('common.minutes')} · ${heroLesson.total_spots} ${t('home.spots')}`}
            startTime={heroLesson.start_time}
            onClick={() => booking.openModal(heroLesson)}
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
      )}

      <SectionLabel>{t('home.directions')}</SectionLabel>
      <DirectionsRail services={catalog?.services ?? []} onSelect={openDirection} />


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
