import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import BookingModal from '../components/modals/BookingModal';
import SuccessModal from '../components/modals/SuccessModal';
import DateRail from '../components/schedule/DateRail';
import LessonCard from '../components/schedule/LessonCard';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { ListSkeleton } from '../components/ui/ListSkeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { getLessonsByDate, type LessonResponse } from '../api/lessons';
import { useTelegram } from '../hooks/useTelegram';
import { bookLesson, cancelLesson } from '../api/user';
import { spawnPetals } from '../lib/petals';

export default function Shedule() {
  const [activeDate, setActiveDate] = useState(0);
  const [dateList, setDateList] = useState<{ day: string; num: number; fullDate: Date }[]>([]);
  const [dayClasses, setDayClasses] = useState<LessonResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeLesson, setActiveLesson] = useState<LessonResponse | null>(null);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { tg, tg_id, vibrateMedium } = useTelegram();
  const [refreshTick, setRefreshTick] = useState(0);
  const { t, i18n } = useTranslation();

  const days = [
    t('schedule.days.sun'),
    t('schedule.days.mon'),
    t('schedule.days.tue'),
    t('schedule.days.wed'),
    t('schedule.days.thu'),
    t('schedule.days.fri'),
    t('schedule.days.sat'),
  ];

  // Генерируем 7 дней при старте
  useEffect(() => {
    const today = new Date();
    // 🔥 Сбрасываем часы, минуты и секунды до нулей!
    // Это гарантирует, что мы всегда считаем от начала суток, избегая багов с часовыми поясами.
    today.setHours(0, 0, 0, 0);

    const arr = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      arr.push({ day: days[d.getDay()], num: d.getDate(), fullDate: d });
    }
    setDateList(arr);
  }, []);

  useEffect(() => {
    if (dateList.length === 0) return; // Ждем, пока сгенерируются даты

    const fetchClasses = async () => {
      setIsLoading(true);
      try {
        const targetDate = dateList[activeDate].fullDate;

        // Форматируем дату в YYYY-MM-DD для нашего бэкенда
        const yyyy = targetDate.getFullYear();
        const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
        const dd = String(targetDate.getDate()).padStart(2, '0');
        const formattedDate = `${yyyy}-${mm}-${dd}`;

        const data = await getLessonsByDate(formattedDate, tg_id);
        setDayClasses(data); // Сохраняем реальные занятия в стейт
      } catch (error) {
        console.error('Помилка завантаження розкладу:', error);
        setDayClasses([]); // Очищаем список при ошибке
      } finally {
        setIsLoading(false);
      }
    };

    fetchClasses();
  }, [activeDate, dateList, refreshTick]);

  const openModal = (lesson: LessonResponse | null) => {
    setSelectedSpot(null);
    setActiveLesson(lesson);
    setIsModalOpen(true);
    vibrateMedium();
  };

  const closeModal = () => setIsModalOpen(false);

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

      setRefreshTick((prev) => prev + 1);

      activeLesson.taken_spots.push(selectedSpot);
      activeLesson.is_booked_by_user = true;

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
      alert(error.message || t('schedule.booking_error'));

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

      setRefreshTick((prev) => prev + 1);

      setIsProcessing(false);
      closeModal();
      alert(t('schedule.cancel_success'));
      if (tg) tg.HapticFeedback.notificationOccurred('success');
    } catch (error: any) {
      setIsProcessing(false);
      alert(error.message || t('schedule.cancel_error'));
      if (tg) tg.HapticFeedback.notificationOccurred('error');
    }
  };

  const selectDate = (index: number) => {
    setActiveDate(index);
    if (tg) tg.HapticFeedback.impactOccurred('light');
  };

  // Месяц выбранного дня — на языке интерфейса, а не жёстко украинский:
  // приложение мультиязычное, а Intl уже умеет склонять названия месяцев.
  const activeFullDate = dateList[activeDate]?.fullDate;
  const monthKicker = activeFullDate
    ? activeFullDate.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })
    : '';

  return (
    <>
      <ScreenHeader
        kicker={monthKicker}
        title={t('schedule.title')}
        action={
          /* Кнопка возврата на сегодня появляется, только когда пользователь
             ушёл с текущего дня — иначе она была бы пустышкой. */
          activeDate !== 0 ? (
            <motion.button
              type="button"
              onClick={() => selectDate(0)}
              whileTap={{ scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-card py-2 pl-2.5 pr-3.5 shadow-soft"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--v-brand)"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <polyline points="11 17 6 12 11 7" />
                <path d="M6 12h8a4 4 0 010 8h-1" />
              </svg>
              <span className="text-[11px] font-extrabold tracking-[-0.01em] text-brand">
                {t('schedule.today')}
              </span>
            </motion.button>
          ) : undefined
        }
      />

      <div className="pt-6">
        <DateRail dates={dateList} activeIndex={activeDate} onSelect={selectDate} />
      </div>

      <div className="flex flex-col gap-3 px-5 pt-5">
        {isLoading ? (
          <ListSkeleton rows={4} />
        ) : dayClasses.length > 0 ? (
          dayClasses.map((cl, i) => (
            <LessonCard
              key={cl.id ?? i}
              lesson={cl}
              index={i}
              title={cl.name ? t(`lesson.name.${cl.name}`, { defaultValue: cl.name }) : ''}
              bookedLabel={t('schedule.booked')}
              almostFullLabel={t('schedule.almost_full')}
              availableLabel={t('schedule.available')}
              onClick={() => openModal(cl)}
            />
          ))
        ) : (
          <EmptyState title={t('schedule.no_classes')} />
        )}
      </div>

      <BookingModal
        isOpen={isModalOpen}
        onClose={closeModal}
        selectedSpot={selectedSpot}
        onSpotSelect={setSelectedSpot}
        isProcessing={isProcessing}
        onPay={pay}
        onCancel={cancelBooking} // 🔥 Передаем функцию отмены в модалку
        lesson={activeLesson} // 🔥 Передаем данные в модалку!
      />

      <SuccessModal isOpen={isSuccessOpen} onClose={closeSuccess} lesson={activeLesson} />
    </>
  );
}
