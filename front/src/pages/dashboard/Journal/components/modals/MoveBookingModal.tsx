import { useTranslation } from 'react-i18next';
import { Dialog, ModalHeader, ModalBody } from '../../../../../components/ui/index';
import { ResourceMoveField } from '../ResourceMoveField';
import { formatIndexToTimeStr } from '../../utils';
import type { Booking } from '../../types';

/** Этаж выше попапа журнала (9000) и ниже подтверждений (9999). */
const FLOOR = 9500;

/**
 * Перенос записи — всплывающим окном, а не третью карточки занятия.
 *
 * Два поля, дата и время, лежали в карточке всегда: открыл посмотреть, кто
 * записан, — и треть окна занята формой, которой сейчас не пользуешься. Окно
 * появляется по кнопке и уходит сразу после переноса.
 *
 * Подвала нет намеренно: кнопка «Перенести» живёт внутри полей и появляется
 * только когда время действительно изменили — переносить нетронутое время
 * нечего, и серая кнопка в подвале была бы обещанием ни о чём.
 */
export function MoveBookingModal({ booking, reservationId, onMoved, onClose }: {
  booking: Booking;
  reservationId: number | null;
  onMoved: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('journal');
  const when = `${booking.date ?? ''} · ${formatIndexToTimeStr(booking.timeStart)}`;

  return (
    <Dialog onClose={onClose} zIndex={FLOOR} maxWidth="420px">
      <ModalHeader title={t('resourceBooking.moveTitle')} subtitle={`${booking.title} · ${when}`}/>
      <ModalBody>
        <ResourceMoveField
          booking={booking}
          reservationId={reservationId}
          onMoved={() => { onMoved(); onClose(); }}
        />
      </ModalBody>
    </Dialog>
  );
}
