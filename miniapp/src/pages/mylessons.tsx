import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import UpcomingCard from '../components/mylessons/UpcomingCard';
import PastCard from '../components/mylessons/PastCard';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SectionLabel } from '../components/ui/SectionLabel';
import { ListSkeleton } from '../components/ui/ListSkeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { getMyLessons, type UpcomingLessonResponse, type PastLessonResponse } from '../api/lessons';
import { rateLesson } from '../api/user';
import { useTelegram } from '../hooks/useTelegram';

export default function MyLessons() {
  const { t } = useTranslation();
  const { tg_id, vibrateLight } = useTelegram();

  const [upcoming, setUpcoming] = useState<UpcomingLessonResponse[]>([]);
  const [past, setPast] = useState<PastLessonResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [countdowns, setCountdowns] = useState<{ [key: number]: string }>({});
  const [ratings, setRatings] = useState<{ [key: number]: number }>({});
  const [bouncing, setBouncing] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    const fetchLessons = async () => {
      setIsLoading(true);
      try {
        const data = await getMyLessons(tg_id);
        setUpcoming(data.upcoming);
        setPast(data.past);

        const initialRatings: { [key: number]: number } = {};
        data.past.forEach((lesson) => {
          if (lesson.rating) initialRatings[lesson.id] = lesson.rating;
        });
        setRatings(initialRatings);
      } catch (error) {
        console.error('Помилка завантаження моїх занять:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLessons();
  }, [tg_id]);

  useEffect(() => {
    if (upcoming.length === 0) return;

    const updateCountdowns = () => {
      const now = new Date().getTime();
      const newCountdowns: { [key: number]: string } = {};

      upcoming.forEach((lesson) => {
        const target = new Date(lesson.start_time).getTime();
        const diff = target - now;

        if (diff > 0) {
          const h = Math.floor(diff / 3600000);
          const m = Math.floor((diff % 3600000) / 60000);
          newCountdowns[lesson.id] = t('mylessons.remaining', { hours: h, minutes: m });
        } else {
          newCountdowns[lesson.id] = t('mylessons.lesson_started');
        }
      });
      setCountdowns(newCountdowns);
    };

    updateCountdowns();
    const interval = setInterval(updateCountdowns, 60000);
    return () => clearInterval(interval);
  }, [upcoming]);

  const rateClass = async (classId: number, rating: number) => {
    // Сначала меняем локально в React, чтобы сердечки загорелись МОМЕНТАЛЬНО (Optimistic UI)
    setRatings({ ...ratings, [classId]: rating });
    vibrateLight();

    // Запускаем красивую анимацию прыгающих сердечек
    for (let i = 1; i <= rating; i++) {
      setTimeout(() => {
        setBouncing((prev) => ({ ...prev, [`${classId}-${i}`]: true }));
        setTimeout(() => setBouncing((prev) => ({ ...prev, [`${classId}-${i}`]: false })), 500);
      }, i * 60);
    }

    try {
      // 🔥 3. Отправляем реальный запрос на бэкенд
      await rateLesson({
        tg_id: tg_id,
        lesson_id: classId,
        rating: rating,
      });
      console.log(`Оцінку ${rating} для заняття ${classId} успішно збережено в БД!`);
    } catch (error: any) {
      console.error('Не вдалося зберегти оцінку на бэкенде:', error);
      alert(error.message || t('mylessons.save_review_error'));
    }
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
  };

  const translateName = (name?: string) =>
    name ? t(`lesson.name.${name}`, { defaultValue: name }) : '';

  return (
    <>
      <ScreenHeader title={t('mylessons.title')} />

      {isLoading ? (
        <div className="pt-8">
          <ListSkeleton rows={3} />
        </div>
      ) : upcoming.length === 0 && past.length === 0 ? (
        <EmptyState
          title={t('mylessons.no_lessons')}
          icon={
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          }
        />
      ) : (
        <>
          {upcoming.length > 0 && (
            <>
              <SectionLabel trailing={`${upcoming.length}`}>
                {t('mylessons.status.upcoming')}
              </SectionLabel>
              <div className="flex flex-col gap-3 px-5">
                {upcoming.map((cls, i) => (
                  <UpcomingCard
                    key={`upcoming-${cls.id}`}
                    index={i}
                    title={translateName(cls.name)}
                    statusLabel={t('mylessons.status.upcoming')}
                    meta={`${formatDate(cls.start_time)}, ${cls.time} · ${cls.teacher}`}
                    matLabel={t('mylessons.mat_label', { spot: cls.spot_number })}
                    countdown={countdowns[cls.id] || t('mylessons.counting_time')}
                  />
                ))}
              </div>
            </>
          )}

          {past.length > 0 && (
            <>
              <SectionLabel trailing={`${past.length}`}>
                {t('mylessons.status.past')}
              </SectionLabel>
              <div className="flex flex-col gap-3 px-5">
                {past.map((cls, i) => (
                  <PastCard
                    key={`past-${cls.id}`}
                    index={i}
                    lessonId={cls.id}
                    title={translateName(cls.name)}
                    statusLabel={t('mylessons.status.past')}
                    meta={`${formatDate(cls.start_time)}, ${cls.time} · ${cls.teacher}`}
                    ratingLabel={t('mylessons.your_rating')}
                    rating={ratings[cls.id] || 0}
                    bouncing={bouncing}
                    onRate={(star) => rateClass(cls.id, star)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
