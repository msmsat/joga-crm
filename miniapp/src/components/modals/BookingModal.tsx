import { useTranslation } from 'react-i18next';
import { Sheet } from '../ui/Sheet';
import { LessonBookingActions, LessonBookingBody } from '../booking/LessonBooking';
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
  /** «Повторная запись» в правилах студии: на одном занятии можно занять
   *  второй коврик (пришла с подругой). Выключена — у своей брони остаётся
   *  только отмена. */
  allowRepeat?: boolean;
  /** Поверх листа расписания — иначе бронь открывается под ним. */
  layer?: number;
}

/** Лист брони занятия из расписания. Содержимое и кнопки — общие с итогом
 *  мастера записи с главной (`components/booking/LessonBooking.tsx`). */
export default function BookingModal({
  isOpen,
  onClose,
  selectedSpot,
  onSpotSelect,
  isProcessing,
  onPay,
  onCancel,
  lesson,
  allowRepeat = false,
  layer = 0,
}: BookingModalProps) {
  const { t } = useTranslation();

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
        <LessonBookingActions
          lesson={lesson}
          allowRepeat={allowRepeat}
          selectedSpot={selectedSpot}
          isProcessing={isProcessing}
          onPay={onPay}
          onCancel={onCancel}
          onClose={onClose}
        />
      }
    >
      <LessonBookingBody
        lesson={lesson}
        selectedSpot={selectedSpot}
        onSpotSelect={onSpotSelect}
        allowRepeat={allowRepeat}
      />
    </Sheet>
  );
}
