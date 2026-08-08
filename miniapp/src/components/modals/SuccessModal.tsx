import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetAction } from '../ui/Sheet';
import { type LessonResponse } from '../../api/lessons';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  lesson: LessonResponse | null;
  /**
   * Студия включила «Подтверждение тренером»: место занято, но бронь ещё не
   * подтверждена — обещать «до встречи на коврике» рано.
   */
  awaitingConfirmation?: boolean;
  /** Поверх брони, из которой он и появился. */
  layer?: number;
}

/**
 * Подтверждение записи.
 *
 * Лотос рисуется линией на глазах у клиента: три контура проступают один за
 * другим за секунду. Это единственная «награда» в приложении, и она должна
 * ощущаться как выдох, а не как системный алерт «успешно».
 */
export default function SuccessModal({
  isOpen,
  onClose,
  lesson,
  awaitingConfirmation = false,
  layer = 0,
}: SuccessModalProps) {
  const { t } = useTranslation();

  const petal = (d: string, delay: number, opacity: number) => (
    <motion.path
      d={d}
      stroke="var(--v-brand)"
      strokeWidth="1.1"
      strokeLinecap="round"
      fill="none"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity }}
      transition={{ duration: 1.1, delay, ease: 'easeInOut' }}
    />
  );

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      layer={layer}
      footer={<SheetAction onClick={onClose}>{t('successModal.button')}</SheetAction>}
    >
      <div className="flex flex-col items-center pb-2 pt-4 text-center">
        <div className="relative flex h-[124px] w-[124px] items-center justify-center">
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 22 }}
            className="absolute inset-0 rounded-full bg-brand/10"
          />
          <svg viewBox="0 0 72 72" fill="none" className="relative h-[92px] w-[92px]">
            {petal('M36 60 C36 60 20 48 20 36 C20 26 28 20 36 20 C44 20 52 26 52 36 C52 48 36 60 36 60Z', 0.15, 0.9)}
            {petal('M36 60 C36 60 12 52 10 36 C8 22 22 14 36 14 C50 14 64 22 62 36 C60 52 36 60 36 60Z', 0.35, 0.6)}
            {petal('M36 60 C36 60 4 56 2 36 C0 18 18 8 36 8 C54 8 72 18 70 36 C68 56 36 60 36 60Z', 0.55, 0.32)}
            <motion.circle
              cx="36"
              cy="36"
              r="5"
              fill="var(--v-brand)"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.35 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.9 }}
              style={{ transformOrigin: '36px 36px' }}
            />
          </svg>
        </div>

        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 text-[30px] font-extrabold leading-[1.02] tracking-[-0.035em] text-card-foreground"
        >
          {t('successModal.title')}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="mt-3 max-w-[20rem] text-[13.5px] font-medium leading-relaxed text-muted-foreground"
        >
          {t('successModal.subtitle', {
            name: lesson?.name
              ? t(`lesson.name.${lesson.name}`, { defaultValue: lesson.name })
              : t('successModal.default_lesson'),
            time: lesson?.time || '',
          })}
        </motion.p>

        {awaitingConfirmation && (
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 rounded-[18px] bg-background px-4 py-3 text-[12.5px] font-bold leading-relaxed text-foreground"
          >
            {t('bookingModal.awaiting_confirmation')}
          </motion.p>
        )}
      </div>
    </Sheet>
  );
}
