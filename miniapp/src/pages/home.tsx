import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import HomeGreeting from '../components/home/HomeGreeting';
import AmbientBackdrop from '../components/home/AmbientBackdrop';
import StudioRail from '../components/home/StudioRail';
import NextLessonCard from '../components/home/NextLessonCard';
import DirectionsRail from '../components/home/DirectionsRail';
import ReferralBanner from '../components/home/ReferralBanner';
import { SectionLabel } from '../components/ui/SectionLabel';
import BookingModal from '../components/modals/BookingModal';
import DirectionModal from '../components/modals/DirectionModal';
import SuccessModal from '../components/modals/SuccessModal';
import { STUDIOS } from '../data/studios';
import { type UserResponse } from '../api/auth';
import { getToday1800Lesson, getTodayLessonsByDirection, type LessonResponse } from '../api/lessons';
import { bookLesson, cancelLesson } from '../api/user';
import { useTelegram } from '../hooks/useTelegram';
import { spawnPetals } from '../lib/petals';

interface HomeProps {
  user: UserResponse | null;
}

export default function Home({ user }: HomeProps) {
  // ponytail: выбор студии пока только подсвечивает карточку и красит фон —
  // расписание и занятия по-прежнему приходят из единственной студии, потому
  // что публичного эндпоинта «студии клиента» в CRM ещё нет. Когда появится
  // мультистудийность, activeStudioId станет параметром запросов ниже.
  const [activeStudioId, setActiveStudioId] = useState(STUDIOS[0].id);

  const [isDirModalOpen, setIsDirModalOpen] = useState(false);
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [selectedDirLabel, setSelectedDirLabel] = useState<string | null>(null);
  const [heroLesson, setHeroLesson] = useState<LessonResponse | null>(null);
  const [directionClasses, setDirectionClasses] = useState<LessonResponse[]>([]);
  const [isDirLoading, setIsDirLoading] = useState(false);
  const [activeLesson, setActiveLesson] = useState<LessonResponse | null>(null);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const { tg, tg_id, vibrateMedium } = useTelegram();
  const { t } = useTranslation();

  const activeStudio = STUDIOS.find((s) => s.id === activeStudioId) ?? STUDIOS[0];

  const loadHeroLesson = () => {
    if (!tg_id) return; // 🔥 Защита: ждем, пока Телеграм отдаст нам ID

    getToday1800Lesson(tg_id) // 🔥 Обязательно передаем tg_id внутрь!
      .then(setHeroLesson)
      .catch((err) => console.error('Не вдалося завантажити головне заняття:', err));
  };

  useEffect(() => {
    if (tg_id) {
      loadHeroLesson();
    }
  }, [tg_id]);

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

  // Функция открытия модалки направлений
  const openDirectionModal = async (dir: string, dirLabel: string) => {
    setSelectedDir(dir);
    setSelectedDirLabel(dirLabel);
    setIsDirModalOpen(true);
    setDirectionClasses([]);
    setIsDirLoading(true);

    if (tg) tg.HapticFeedback.impactOccurred('medium');

    try {
      // 🔥 Ось тут додаємо tg_id другим параметром!
      const data = await getTodayLessonsByDirection(dir, tg_id);
      setDirectionClasses(data);
    } catch (error) {
      console.error('Помилка завантаження занять напрямку:', error);
    } finally {
      setIsDirLoading(false);
    }
  };

  const closeDirModal = () => setIsDirModalOpen(false);

  const handleClassSelect = (selectedClass: LessonResponse) => {
    setIsDirModalOpen(false);
    openModal(selectedClass); // Передаем выбранный класс из списка в модалку бронирования!
  };

  const closeSuccess = () => {
    if (tg) tg.close();
    else setIsSuccessOpen(false);
  };

  const pay = async () => {
    // Базовая проверка: если не выбрали место или нет активного занятия — ничего не делаем
    if (!activeLesson || !selectedSpot) return;

    setIsProcessing(true);

    try {
      await bookLesson({
        tg_id: tg_id,
        lesson_id: activeLesson.id,
        spot_number: selectedSpot,
      });

      loadHeroLesson();
      if (selectedDir && selectedDirLabel) openDirectionModal(selectedDir, selectedDirLabel);

      // 🔥 3. Если всё прошло успешно — запускаем праздник!
      setIsProcessing(false);
      closeModal();

      setIsSuccessOpen(true);
      spawnPetals();

      if (tg) tg.HapticFeedback.notificationOccurred('success');
    } catch (error: any) {
      // ⚠️ Если бэкенд выдал ошибку (например, коврик уже занят), мы поймаем её здесь!
      setIsProcessing(false);

      // Показываем клиенту красивое сообщение с бэкенда ("Це місце вже зайнято, оберіть інше")
      alert(error.message || t('home.booking_error'));

      if (tg) tg.HapticFeedback.notificationOccurred('error');
    }
  };

  const cancelBooking = async () => {
    if (!activeLesson) return;

    setIsProcessing(true);

    try {
      await cancelLesson({
        tg_id: tg_id, // Беремо з хука useTelegram
        lesson_id: activeLesson.id,
      });

      loadHeroLesson();
      if (selectedDir) openDirectionModal(selectedDir, selectedDirLabel || selectedDir);

      setIsProcessing(false);
      closeModal();
      alert(t('home.cancel_booking_success'));
      if (tg) tg.HapticFeedback.notificationOccurred('success');
    } catch (error: any) {
      setIsProcessing(false);
      alert(error.message || t('home.cancel_booking_error'));
      if (tg) tg.HapticFeedback.notificationOccurred('error');
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard
      .writeText('https://jogaua.online/')
      .then(() => {
        setIsCopied(true); // Показываем галочку
        if (tg) tg.HapticFeedback.notificationOccurred('success'); // Дзынь! (вибрация успеха)

        // Прячем галочку обратно через 2 секунды
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch((err) => console.error('Помилка копіювання: ', err));
  };

  const getDayLabel = (startTimeIso?: string) => {
    if (!startTimeIso) return t('home.today'); // Пока грузится, показываем дефолт

    const lessonDate = new Date(startTimeIso);
    const today = new Date();

    // Сравниваем только день, месяц и год
    if (
      lessonDate.getDate() === today.getDate() &&
      lessonDate.getMonth() === today.getMonth() &&
      lessonDate.getFullYear() === today.getFullYear()
    ) {
      return t('home.today');
    }

    return t('home.tomorrow');
  };

  const heroDuration = heroLesson?.dur || t('home.default_duration');
  const heroSpots = `${heroLesson?.total_spots || 5} ${t('home.spots')}`;

  return (
    <div className="relative">
      <AmbientBackdrop tint={activeStudio.tint} />

      <HomeGreeting greeting={getGreeting()} name={user?.name || t('home.guest_name')} />

      <SectionLabel trailing={`${STUDIOS.length}`}>
        {t('home.studios', { defaultValue: 'Студії' })}
      </SectionLabel>
      <StudioRail studios={STUDIOS} activeId={activeStudioId} onSelect={setActiveStudioId} />

      <SectionLabel>
        {t('home.next_lesson', { defaultValue: 'Найближче заняття' })}
      </SectionLabel>
      <NextLessonCard
        time={heroLesson?.time || '18:00'}
        dayLabel={getDayLabel(heroLesson?.start_time)}
        title={
          heroLesson?.name
            ? t(`lesson.name.${heroLesson.name}`, { defaultValue: heroLesson.name })
            : t('lesson.name.reformer_glow')
        }
        meta={`${heroLesson?.teacher || 'Олена Соколова'} · ${heroDuration} · ${heroSpots}`}
        onClick={() => openModal(heroLesson)}
      />

      <SectionLabel>{t('home.directions')}</SectionLabel>
      <DirectionsRail onSelect={openDirectionModal} />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="px-5 pt-9"
      >
        <div className="rounded-[22px] bg-muted/60 p-5">
          <div className="text-[14.5px] font-extrabold leading-tight tracking-[-0.01em] text-foreground">
            {t('home.body_spirit_balance')}
          </div>
          <div className="mt-1.5 text-[12px] font-medium leading-relaxed text-muted-foreground">
            {t('home.studio_description')}
          </div>
        </div>
      </motion.div>

      <ReferralBanner
        title={t('home.referral_title')}
        subtitle={t('home.referral_subtitle')}
        copiedLabel={t('home.referral_link_copied')}
        isCopied={isCopied}
        onClick={handleCopyLink}
      />

      <BookingModal
        isOpen={isModalOpen}
        onClose={closeModal}
        selectedSpot={selectedSpot}
        onSpotSelect={setSelectedSpot}
        isProcessing={isProcessing}
        onPay={pay}
        onCancel={cancelBooking} // 🔥 Добавляем функцию отмены в пропсы
        lesson={activeLesson}
      />
      <DirectionModal
        isOpen={isDirModalOpen}
        onClose={closeDirModal}
        selectedDirLabel={selectedDirLabel}
        todayClasses={directionClasses} // Передаем данные из стейта
        isLoading={isDirLoading} // Передаем статус загрузки
        onClassSelect={handleClassSelect}
      />

      <SuccessModal isOpen={isSuccessOpen} onClose={closeSuccess} lesson={activeLesson} />
    </div>
  );
}
