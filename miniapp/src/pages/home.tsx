import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import HomeGreeting from '../components/home/HomeGreeting';
import AmbientBackdrop from '../components/home/AmbientBackdrop';
import StudioRail from '../components/home/StudioRail';
import StudioSheet from '../components/home/StudioSheet';
import StudioMapSheet from '../components/home/StudioMapSheet';
import NextLessonCard from '../components/home/NextLessonCard';
import DirectionsRail from '../components/home/DirectionsRail';
import ReferralBanner from '../components/home/ReferralBanner';
import ServiceScheduleSheet from '../components/schedule/ServiceScheduleSheet';
import { SectionLabel } from '../components/ui/SectionLabel';
import { EmptyState } from '../components/ui/EmptyState';
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
}

export default function Home({ user, catalog }: HomeProps) {
  const branches = catalog?.branches ?? [];
  const isMultiStudio = branches.length > 1;

  const [activeStudioId, setActiveStudioId] = useState<number | null>(branches[0]?.id ?? null);
  const [liked, setLiked] = useState<number[]>(getLiked);
  // Инвайт-код — только для реферальной ссылки ниже; профиль целиком грузит
  // Profile-страница, дублировать его состояние здесь незачем.
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  // Один лист выбора студии на два сценария: тап по студии и выбор студии для
  // направления. Что делать после выбора, решает pendingService.
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [openedStudio, setOpenedStudio] = useState<Studio | null>(null);
  const [pendingService, setPendingService] = useState<string | null>(null);
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
      setIsMapOpen(true);
    } else {
      setSchedule({ serviceId, studio: null });
    }
  };

  const pickStudio = (studio: Studio) => {
    setActiveStudioId(studio.id);
    setIsMapOpen(false);

    if (pendingService) {
      setSchedule({ serviceId: pendingService, studio });
      setPendingService(null);
    } else {
      setOpenedStudio(studio);
    }
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
      <AmbientBackdrop tint={catalog?.studio.accent_color ?? '#F9A08B'} />

      <HomeGreeting greeting={getGreeting()} name={user?.name || t('home.guest_name')} />

      {isMultiStudio && (
        <>
          <SectionLabel
            trailing={
              <motion.button
                type="button"
                onClick={() => {
                  setPendingService(null);
                  setIsMapOpen(true);
                  vibrateLight();
                }}
                whileTap={{ scale: 0.94 }}
                className="flex items-center gap-1.5 rounded-full bg-card py-1.5 pl-2.5 pr-3 shadow-soft"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21" />
                  <line x1="8" y1="3" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="21" />
                </svg>
                <span className="text-[10.5px] font-extrabold tracking-[0.02em] text-brand">
                  {t('studio.map')}
                </span>
              </motion.button>
            }
          >
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
            onClick={() => openModal(heroLesson)}
          />
        </>
      ) : (
        <div className="px-5">
          <EmptyState title={t('home.no_next_lesson')} size="sm" />
        </div>
      )}

      <SectionLabel>{t('home.directions')}</SectionLabel>
      <DirectionsRail services={catalog?.services ?? []} onSelect={openDirection} />

      <ReferralBanner
        title={t('home.referral_title')}
        subtitle={t('home.referral_subtitle')}
        copiedLabel={t('home.referral_link_copied')}
        isCopied={isCopied}
        onClick={handleCopyLink}
      />

      <StudioMapSheet
        isOpen={isMapOpen}
        onClose={() => {
          setIsMapOpen(false);
          setPendingService(null);
        }}
        studios={branches}
        activeId={activeStudioId ?? branches[0]?.id ?? 0}
        onPick={pickStudio}
        title={pendingService ? t('studio.choose_studio') : t('studio.map_title')}
        subtitle={t('studio.map_sub')}
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

      <SuccessModal isOpen={isSuccessOpen} onClose={closeSuccess} lesson={activeLesson} layer={3} />
    </div>
  );
}
