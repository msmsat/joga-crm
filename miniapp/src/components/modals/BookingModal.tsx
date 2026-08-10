import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetAction } from '../ui/Sheet';
import { useTelegram } from '../../hooks/useTelegram';
import type { LessonResponse } from '../../api/lessons';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSpot: number | null;
  onSpotSelect: (spot: number) => void;
  isProcessing: boolean;
  onPay: () => void;
  onCancel: () => void;
  lesson: LessonResponse | null;
  /** Поверх листа расписания — иначе бронь открывается под ним. */
  layer?: number;
}

export default function BookingModal({
  isOpen,
  onClose,
  selectedSpot,
  onSpotSelect,
  isProcessing,
  onPay,
  onCancel,
  lesson,
  layer = 0,
}: BookingModalProps) {
  const { t } = useTranslation();
  const { vibrateLight } = useTelegram();

  const total = lesson?.total_spots || 0;
  const taken = lesson?.taken_spots?.length || 0;
  const left = total - taken;
  const isBooked = Boolean(lesson?.is_booked_by_user);
  // Занятие видно в расписании, но правила студии его для онлайн-записи
  // закрыли (часы работы виджета, окно записи, минимум времени до начала или
  // выключенная онлайн-запись). Своя бронь при этом остаётся отменяемой.
  const isClosed = lesson !== null && !lesson.bookable && !isBooked;

  const facts = [
    {
      label: t('bookingModal.level'),
      value: lesson?.level
        ? t(`lesson.level.${lesson.level}`, { defaultValue: lesson.level })
        : '—',
    },
    {
      label: t('bookingModal.spots'),
      value: left > 0 ? t('bookingModal.spots_count', { left, total }) : t('bookingModal.no_spots'),
    },
    {
      label: t('bookingModal.equipment'),
      value: lesson?.equipment
        ? t(`lesson.equipment.${lesson.equipment}`, { defaultValue: lesson.equipment })
        : '—',
    },
    { label: t('bookingModal.price'), value: lesson?.price_str ?? '—' },
  ];

  const initials = (lesson?.teacher ?? '')
    .split(' ')
    .map((part) => part[0])
    .join('');

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      layer={layer}
      kicker={`${
        lesson?.equipment
          ? t(`lesson.equipment.${lesson.equipment}`, { defaultValue: lesson.equipment })
          : t('bookingModal.training')
      } · ${lesson?.time ?? ''}`}
      title={
        lesson?.name ? t(`lesson.name.${lesson.name}`, { defaultValue: lesson.name }) : ''
      }
      footer={
        isBooked ? (
          <SheetAction tone="danger" onClick={onCancel} disabled={isProcessing}>
            {isProcessing ? t('bookingModal.processing') : t('bookingModal.cancel_booking')}
          </SheetAction>
        ) : isClosed ? (
          <SheetAction onClick={onClose} disabled>
            {t('bookingModal.not_bookable')}
          </SheetAction>
        ) : (
          <SheetAction onClick={onPay} disabled={isProcessing || !selectedSpot}>
            {isProcessing
              ? t('bookingModal.processing')
              : t('bookingModal.pay', { price: lesson?.price_str || '0' })}
          </SheetAction>
        )
      }
    >
      {/* Тренер — лицо занятия, поэтому он идёт первым и с аватаром: клиент
          выбирает не «пилатес в 18:00», а «пилатес у Олены». */}
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

      {isBooked ? (
        <div className="mt-5 flex items-center gap-2.5 rounded-[18px] bg-success/14 px-4 py-3.5">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--v-success)"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-[13px] font-bold text-foreground">
            {t('bookingModal.already_booked')}
          </span>
        </div>
      ) : isClosed ? (
        // Сетку ковриков не показываем вовсе: выбирать место, которое всё равно
        // не забронировать, — это кнопка «оплатить», ведущая в отказ.
        <div className="mt-5 rounded-[18px] bg-background px-4 py-3.5">
          <div className="text-[13px] font-extrabold tracking-[-0.015em] text-foreground">
            {t('bookingModal.not_bookable')}
          </div>
          <div className="mt-1 text-[12px] font-medium leading-relaxed text-muted-foreground">
            {t('bookingModal.not_bookable_hint')}
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <div className="text-[9.5px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
            {t('bookingModal.choose_spot')}
          </div>

          {/* Коврики нумерованы: «мій — сьомий» клиент запоминает числом, а не
              позицией в сетке. Занятый гасится, а не прячется — так видно,
              насколько полон зал. */}
          <div className="mt-3.5 grid grid-cols-5 gap-2.5">
            {Array.from({ length: total }, (_, i) => i + 1).map((spot) => {
              const isTaken = lesson?.taken_spots?.includes(spot) || false;
              const isSelected = selectedSpot === spot;

              return (
                <motion.button
                  key={spot}
                  type="button"
                  disabled={isTaken}
                  whileTap={isTaken ? undefined : { scale: 0.9 }}
                  animate={{ scale: isSelected ? 1.06 : 1 }}
                  transition={{ type: 'spring', stiffness: 480, damping: 26 }}
                  onClick={() => {
                    onSpotSelect(spot);
                    vibrateLight();
                  }}
                  className={[
                    'flex aspect-square items-center justify-center rounded-[14px] text-[12.5px] font-extrabold tabular-nums transition-colors',
                    isSelected
                      ? 'bg-brand text-brand-foreground shadow-brand'
                      : isTaken
                        ? 'bg-muted text-muted-foreground/40'
                        : 'bg-background text-foreground ring-1 ring-foreground/8',
                  ].join(' ')}
                >
                  {spot}
                </motion.button>
              );
            })}
          </div>
        </div>
      )}
    </Sheet>
  );
}
