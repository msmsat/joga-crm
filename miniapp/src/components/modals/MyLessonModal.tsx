import { useTranslation } from 'react-i18next';
import { Sheet, SheetAction } from '../ui/Sheet';
import CoffeeStrip from '../mylessons/CoffeeStrip';
import RatingStars from '../mylessons/RatingStars';
import type {
  CoffeeState,
  PastLessonResponse,
  UpcomingLessonResponse,
} from '../../api/lessons';

type MyLesson = UpcomingLessonResponse | PastLessonResponse;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  lesson: MyLesson | null;
  /** Занятие уже прошло: вместо отмены и кофе — оценка. */
  isPast: boolean;
  /** Название на языке интерфейса — переводит страница (у неё словарь занятий). */
  title: string;
  /** «12 травня» — формат и локаль тоже знает страница. */
  dateLabel: string;
  /** «Залишилось 2г 15хв» — тикает на странице, здесь только показываем. */
  countdown?: string;
  rating?: number;
  bouncing?: Record<string, boolean>;
  onRate?: (star: number) => void;
  isProcessing?: boolean;
  onCancel?: () => void;
  onCoffeeChange?: (state: CoffeeState) => void;
};

/**
 * Занятие клиента — то же, что в списке «Мои занятия», но целиком и с
 * действиями: отменить запись, согласиться на кофе, поставить оценку.
 *
 * Отдельно от BookingModal намеренно: там лист решает задачу «записаться» —
 * свободные места, цена, выбор коврика. Здесь всё это уже позади, и на тех же
 * четырёх плитках стоят другие величины: свой коврик и время до начала.
 * Общее у листов — каркас Sheet, а не набор фактов.
 *
 * Правила отмены (за сколько часов ещё можно) проверяет сервер и объясняет
 * текстом ошибки — дублировать их здесь значило бы держать два свода правил.
 */
export default function MyLessonModal({
  isOpen,
  onClose,
  lesson,
  isPast,
  title,
  dateLabel,
  countdown,
  rating = 0,
  bouncing = {},
  onRate,
  isProcessing = false,
  onCancel,
  onCoffeeChange,
}: Props) {
  const { t } = useTranslation();

  const isPending = !isPast && (lesson as UpcomingLessonResponse | null)?.status === 'pending';

  const facts = [
    {
      label: t('bookingModal.level'),
      value: lesson?.level
        ? t(`lesson.level.${lesson.level}`, { defaultValue: lesson.level })
        : '—',
    },
    {
      label: t('bookingModal.equipment'),
      value: lesson?.equipment
        ? t(`lesson.equipment.${lesson.equipment}`, { defaultValue: lesson.equipment })
        : '—',
    },
    {
      label: t('mylessons.spot'),
      value: lesson ? `№${lesson.spot_number}` : '—',
    },
    isPast
      ? {
          label: t('mylessons.duration'),
          value: `${lesson?.duration_min ?? 0} ${t('common.minutes')}`,
        }
      : {
          label: t('mylessons.until_start'),
          value: countdown || t('mylessons.counting_time'),
        },
  ];

  const initials = (lesson?.teacher ?? '')
    .split(' ')
    .map((part) => part[0])
    .join('');

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      kicker={`${dateLabel} · ${lesson?.time ?? ''}`}
      title={title}
      footer={
        // У прошедшего занятия действий нет: отменять нечего, а оценка стоит
        // в самом листе — кнопкой во всю ширину её делать не за что.
        !isPast && onCancel ? (
          <SheetAction tone="danger" onClick={onCancel} disabled={isProcessing}>
            {isProcessing ? t('bookingModal.processing') : t('bookingModal.cancel_booking')}
          </SheetAction>
        ) : undefined
      }
    >
      {/* Тренер — лицо занятия, поэтому он идёт первым и с аватаром. */}
      <div className="flex items-center gap-3 rounded-[20px] bg-background px-4 py-3.5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold text-brand-foreground"
          style={{ background: lesson?.color || 'var(--v-brand)' }}
        >
          {initials}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-extrabold tracking-[-0.015em] text-foreground">
            {lesson?.teacher}
          </div>
          <div className="mt-0.5 text-[11.5px] font-medium text-muted-foreground">
            {lesson?.time} · {lesson?.duration_min} {t('common.minutes')}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {facts.map((fact) => (
          <div key={fact.label} className="rounded-[18px] bg-background px-4 py-3.5">
            <div className="text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
              {fact.label}
            </div>
            <div className="mt-1.5 text-[14px] font-extrabold tracking-[-0.015em] text-foreground">
              {fact.value}
            </div>
          </div>
        ))}
      </div>

      {isPending && (
        <div className="mt-3 rounded-[18px] bg-brand/12 px-4 py-3.5 text-[13px] font-bold text-foreground">
          {t('bookingModal.awaiting_confirmation')}
        </div>
      )}

      {/* Долг за занятие и подарок студии — те же две метки, что на карточке
          списка. Без них лист занятия был единственным местом, где «Не
          оплачено» пропадало ровно тогда, когда человек открыл подробности. */}
      {lesson && lesson.debt > 0 && (
        <div className="mt-3 rounded-[18px] bg-danger/12 px-4 py-3.5 text-[13px] font-bold text-danger">
          {t('mylessons.unpaid', { amount: lesson.debt_str })}
        </div>
      )}
      {lesson && lesson.debt <= 0 && lesson.is_trial && (
        <div className="mt-3 rounded-[18px] bg-success/14 px-4 py-3.5 text-[13px] font-bold text-foreground">
          {t('mylessons.trial')}
        </div>
      )}

      {/* Кофе — единственное, что клиент может изменить у будущего занятия,
          кроме самой записи. Полоска та же, что в карточке списка, и состояние
          у них общее: страница обновляет занятие ответом сервера. */}
      {!isPast && lesson && lesson.coffee.enabled && onCoffeeChange && (
        <div className="mt-3 rounded-[18px] bg-background px-4 py-3.5">
          <CoffeeStrip flush lessonId={lesson.id} coffee={lesson.coffee} onChange={onCoffeeChange} />
        </div>
      )}

      {isPast && lesson && onRate && (
        <div className="mt-3 rounded-[18px] bg-background px-4 pb-2 pt-3.5">
          <div className="text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
            {t('mylessons.your_rating')}
          </div>
          <div className="mt-0.5">
            <RatingStars
              lessonId={lesson.id}
              rating={rating}
              bouncing={bouncing}
              onRate={onRate}
            />
          </div>
        </div>
      )}
    </Sheet>
  );
}
