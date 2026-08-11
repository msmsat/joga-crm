import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetAction } from '../ui/Sheet';
import { useTelegram } from '../../hooks/useTelegram';
import { joinCoffee, type CoffeeState } from '../../api/lessons';

interface CoffeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Занятие, на которое человек только что записался. */
  lessonId: number | null;
  /** Состояние на момент открытия — сколько уже согласилось. */
  coffee: CoffeeState | null;
  /** Согласие ушло на сервер: обновить карточки занятия. */
  onJoined?: (state: CoffeeState) => void;
  layer?: number;
}

/**
 * «Останешься на 15 минут?» — приглашение на кофе после занятия.
 *
 * Третья панель цепочки записи: бронь → успех → кофе. Отдельным листом, а не
 * строкой внутри экрана успеха, намеренно — момент подтверждения записи это
 * выдох, и вкладывать в него второе решение нельзя.
 *
 * Чашка рисуется линией на глазах (тот же приём, что лотос в SuccessModal:
 * контур проступает через pathLength), пар — три волны одна за другой. Это не
 * украшение: панель должна читаться как тёплое предложение, а не как опрос.
 *
 * Кнопки равновесные. «Не сегодня» не серая и не мельче — отказ обязан стоить
 * столько же, сколько согласие, иначе получается давление, а не приглашение.
 */
export default function CoffeeModal({
  isOpen,
  onClose,
  lessonId,
  coffee,
  onJoined,
  layer = 0,
}: CoffeeModalProps) {
  const { t } = useTranslation();
  const { vibrateSuccess, vibrateLight } = useTelegram();
  const [isSending, setIsSending] = useState(false);

  const alreadyGoing = coffee?.count ?? 0;

  const join = async () => {
    if (lessonId === null || isSending) return;
    setIsSending(true);
    try {
      const state = await joinCoffee(lessonId);
      onJoined?.(state);
      vibrateSuccess();
      onClose();
    } catch {
      // Молча закрываем: кофе — приятное дополнение, а не шаг оплаты, и
      // красная ошибка поверх только что удавшейся записи пугала бы зря.
      onClose();
    } finally {
      setIsSending(false);
    }
  };

  const steam = (d: string, delay: number) => (
    <motion.path
      d={d}
      stroke="var(--v-brand)"
      strokeWidth="1.6"
      strokeLinecap="round"
      fill="none"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 0.55 }}
      transition={{ duration: 1.2, delay, ease: 'easeInOut' }}
    />
  );

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      layer={layer}
      footer={
        <div className="flex flex-col gap-2.5">
          <SheetAction onClick={join} disabled={isSending}>
            {t('coffeeModal.join')}
          </SheetAction>
          <SheetAction
            tone="ghost"
            onClick={() => {
              vibrateLight();
              onClose();
            }}
          >
            {t('coffeeModal.decline')}
          </SheetAction>
        </div>
      }
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
            {/* Пар — раньше чашки: сначала тепло, потом предмет. */}
            {steam('M28 22 C24 17 32 14 28 9', 0.15)}
            {steam('M36 20 C32 14 40 11 36 6', 0.3)}
            {steam('M44 22 C40 17 48 14 44 9', 0.45)}

            {/* Чашка */}
            <motion.path
              d="M18 30 h30 v12 a12 12 0 0 1 -12 12 h-6 a12 12 0 0 1 -12 -12 z"
              stroke="var(--v-brand)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.1, delay: 0.5, ease: 'easeInOut' }}
            />
            {/* Ручка */}
            <motion.path
              d="M48 33 h4 a6 6 0 0 1 0 12 h-4"
              stroke="var(--v-brand)"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.75 }}
              transition={{ duration: 0.7, delay: 1.1, ease: 'easeInOut' }}
            />
            {/* Блюдце */}
            <motion.path
              d="M14 60 h40"
              stroke="var(--v-brand)"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.4 }}
              transition={{ duration: 0.6, delay: 1.3, ease: 'easeInOut' }}
            />
          </svg>
        </div>

        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 text-[30px] font-extrabold leading-[1.02] tracking-[-0.035em] text-card-foreground"
        >
          {t('coffeeModal.title')}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="mt-3 max-w-[20rem] text-[13.5px] font-medium leading-relaxed text-muted-foreground"
        >
          {t('coffeeModal.subtitle')}
        </motion.p>

        {/* Имён здесь нет намеренно: пока человек не согласился, он видит только
            цифру — имена участниц открываются взаимно (гейт на сервере). */}
        {alreadyGoing > 0 && (
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 rounded-full bg-brand/12 px-4 py-2 text-[12.5px] font-extrabold text-brand"
          >
            {t('coffeeModal.already_going', { n: alreadyGoing })}
          </motion.p>
        )}
      </div>
    </Sheet>
  );
}
