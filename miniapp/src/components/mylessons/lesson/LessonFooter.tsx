import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SheetAction } from '../../ui/Sheet';

type Props = {
  onReschedule?: () => void;
  onCancel?: () => void;
  processing: boolean;
  /** «пт, 12 октября, 18:00» — что именно отменяется, словами. */
  when: string;
};

/**
 * Действия с записью: перенести и отменить.
 *
 * Отмена — в два касания. Раньше запись снималась с первого же нажатия: на
 * телефоне это кнопка у большого пальца, и случайный тап освобождал место,
 * которое мог тут же занять другой. Второй шаг называет, ЧТО отменяется, а
 * «Оставить» стоит первым — безопасный выход под тем же пальцем.
 */
export default function LessonFooter({ onReschedule, onCancel, processing, when }: Props) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {confirming && onCancel ? (
        <motion.div
          key="confirm"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
        >
          <p className="mb-3 text-center text-[13px] font-bold leading-snug text-foreground">
            {t('lessonSheet.cancel.question', { when })}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <SheetAction tone="ghost" onClick={() => setConfirming(false)} disabled={processing}>
              {t('lessonSheet.cancel.keep')}
            </SheetAction>
            <SheetAction tone="danger" onClick={onCancel} disabled={processing}>
              {processing ? t('bookingModal.processing') : t('lessonSheet.cancel.confirm')}
            </SheetAction>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="actions"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className={onReschedule && onCancel ? 'grid grid-cols-2 gap-2.5' : undefined}
        >
          {onReschedule && (
            <SheetAction tone="ghost" onClick={onReschedule} disabled={processing}>
              {t('mylessons.reschedule')}
            </SheetAction>
          )}
          {onCancel && (
            <SheetAction tone="danger" onClick={() => setConfirming(true)} disabled={processing}>
              {t('bookingModal.cancel_booking')}
            </SheetAction>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
