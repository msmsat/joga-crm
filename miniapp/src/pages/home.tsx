import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import HomeGreeting from '../components/home/HomeGreeting';
import StudioRail from '../components/home/StudioRail';
import StudioSheet from '../components/home/StudioSheet';
import StudioPickerSheet from '../components/home/StudioPickerSheet';
import NextLessonCard from '../components/home/NextLessonCard';
import DirectionsRail from '../components/home/DirectionsRail';
import ReferralBanner from '../components/home/ReferralBanner';
import ServiceScheduleSheet from '../components/schedule/ServiceScheduleSheet';
import { SectionLabel } from '../components/ui/SectionLabel';
import { Press } from '../components/ui/Press';
import BookingModal from '../components/modals/BookingModal';
import SuccessModal from '../components/modals/SuccessModal';
import { getLiked, toggleLiked } from '../lib/likes';
import { type UserResponse } from '../api/auth';
import { getNextLesson, type LessonResponse } from '../api/lessons';
import { bookLesson, cancelLesson, getUserProfile } from '../api/user';
import type { Studio, StudioCatalog } from '../api/studio';
import { useTelegram } from '../hooks/useTelegram';
import { spawnPetals } from '../lib/petals';
import { notify } from '../lib/notify';

interface HomeProps {
  user: UserResponse | null;
  catalog: StudioCatalog | null;
  /** Переход в другой раздел кабинета — пустая главная должна куда-то вести. */
  onNavigate: (tab: string) => void;
}

export default function Home({ user, catalog, onNavigate }: HomeProps) {
  const branches = catalog?.branches ?? [];
  const isMultiStudio = branches.length > 1;

  const [activeStudioId, setActiveStudioId] = useState<number | null>(branches[0]?.id ?? null);
  const [liked, setLiked] = useState<number[]>(getLiked);
  // Инвайт-код — только для реферальной ссылки ниже; профиль целиком грузит
  // Profile-страница, дублировать его состояние здесь незачем.
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  // Лист выбора филиала. Открывается только из направления: клиент уже выбрал,
  // ЧТО, осталось решить где. Отдельного входа «посмотреть все студии» нет —
  // для этого есть лента студий выше, тап по карточке открывает саму студию.
  const [pendingService, setPendingService] = useState<string | null>(null);
  const [openedStudio, setOpenedStudio] = useState<Studio | null>(null);
  const [schedule, setSchedule] = useState<{ serviceId: string; studio: Studio | null } | null>(null);
  const [scheduleTick, setScheduleTick] = useState(0);

  const [heroLesson, setHeroLesson] = useState<LessonResponse | null>(null);
  const [isHeroLoading, setIsHeroLoading] = useState(true);
  const [activeLesson, setActiveLesson] = useState<LessonResponse | null>(null);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const { tg, vibrateMedium, vibrateLight } = useTelegram();
  const { t } = useTranslation();

  useEffect(() => {
    getUserProfile()
      .then((profile) => setInviteCode(profile.invite_code))
      .catch((err) => console.error('Не вдалося завантажити інвайт-код:', err));
  }, []);

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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.greeting_morning');
    if (hour < 18) return t('home.greeting_afternoon');
    return t('home.greeting_evening');
  };

  const openModal = (lesson: LessonResponse | null) => {
    setSelectedSpot(null);
    setActiveLesson(lesson);
    setIsModalOpen(true);
    vibrateMedium();
  };

  const closeModal = () => setIsModalOpen(false);

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

  const closeSuccess = () => {
    if (tg) tg.close();
    else setIsSuccessOpen(false);
  };

  const pay = async () => {
    if (!activeLesson || !selectedSpot) return;

    setIsProcessing(true);

    try {
      await bookLesson({ lesson_id: activeLesson.id, spot_number: selectedSpot });

      loadHeroLesson();
      setScheduleTick((tick) => tick + 1);

      setIsProcessing(false);
      closeModal();
      setIsSuccessOpen(true);
      spawnPetals();

      if (tg) tg.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      setIsProcessing(false);
      notify(error instanceof Error ? error.message : t('home.booking_error'));
      if (tg) tg.HapticFeedback.notificationOccurred('error');
    }
  };

  const cancelBooking = async () => {
    if (!activeLesson) return;

    setIsProcessing(true);

    try {
      await cancelLesson(activeLesson.id);

      loadHeroLesson();
      setScheduleTick((tick) => tick + 1);

      setIsProcessing(false);
      closeModal();
      notify(t('home.cancel_booking_success'));
      if (tg) tg.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      setIsProcessing(false);
      notify(error instanceof Error ? error.message : t('home.cancel_booking_error'));
      if (tg) tg.HapticFeedback.notificationOccurred('error');
    }
  };

  const handleCopyLink = () => {
    const botUsername = catalog?.studio.bot_username;
    if (!botUsername || !inviteCode) return;

    navigator.clipboard
      .writeText(`https://t.me/${botUsername}?startapp=s${catalog!.studio.id}_ref${inviteCode}`)
      .then(() => {
        setIsCopied(true);
        if (tg) tg.HapticFeedback.notificationOccurred('success');
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch((err) => console.error('Помилка копіювання: ', err));
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
      {/* Первый экран десктопа — одна композиция из двух вещей, которые есть
          всегда: кто пришёл и что у него ближайшее. Раньше они шли стопкой, и
          широкий монитор показывал имя, узкую карточку и полполя пустоты.
          Порядок на телефоне остался прежним (приветствие → студии → занятие) —
          его держит порядок в разметке, переставляет колонки только `dt:order`.
          Ленту студий пускаем во всю ширину строкой ниже: это уже не «кто я и
          что у меня», а выбор места. */}
      <div className="dt:grid dt:grid-cols-[1.05fr_minmax(0,460px)] dt:items-end dt:gap-x-6">
        <div className="dt:order-1">
          <HomeGreeting
            greeting={getGreeting()}
            name={user?.name || t('home.guest_name')}
            studioName={catalog?.studio.name}
            logoUrl={catalog?.studio.logo_url}
          />
        </div>

        {isMultiStudio && (
          <div className="dt:order-3 dt:col-span-2">
            <SectionLabel trailing={`${branches.length}`}>
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
          </div>
        )}

        {/* Карточка занятия — строка «время · название · стрелка» с живым
            отсчётом. Пустое состояние живёт в тех же границах и ведёт в
            расписание: главная без ближайшего занятия обязана предлагать
            записаться, а не сообщать, что записей нет. */}
        <div className="dt:order-2">
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
                onClick={() => openModal(heroLesson)}
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
        </div>
      </div>

      {/* Единственная пара в строку: направления и приглашение есть всегда,
          и обе — короткие. Метки колонок стоят на одной высоте, поэтому у
          приглашения появляется своя (на телефоне она не нужна). */}
      <div className="dt:grid dt:grid-cols-[1.2fr_1fr] dt:items-start dt:gap-x-6">
        <div>
          <SectionLabel>{t('home.directions')}</SectionLabel>
          <DirectionsRail services={catalog?.services ?? []} onSelect={openDirection} />
        </div>

        <div>
          <div className="hidden dt:block">
            <SectionLabel>{t('profile.community')}</SectionLabel>
          </div>

          <ReferralBanner
            title={t('home.referral_title')}
            subtitle={t('home.referral_subtitle')}
            copiedLabel={t('home.referral_link_copied')}
            isCopied={isCopied}
            onClick={handleCopyLink}
          />
        </div>
      </div>

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
        onLessonPick={openModal}
      />

      <BookingModal
        isOpen={isModalOpen}
        onClose={closeModal}
        layer={2}
        selectedSpot={selectedSpot}
        onSpotSelect={setSelectedSpot}
        isProcessing={isProcessing}
        onPay={pay}
        onCancel={cancelBooking}
        lesson={activeLesson}
      />

      <SuccessModal
        isOpen={isSuccessOpen}
        onClose={closeSuccess}
        lesson={activeLesson}
        awaitingConfirmation={Boolean(catalog?.rules.confirmation_required)}
        layer={3}
      />
    </div>
  );
}
