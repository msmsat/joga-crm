import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import { hybridApi } from '../../../../../api/booking/hybrid.api';
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton } from '../../../../../components/ui/modal';
import { ResourceTimeField } from '../ResourceTimeField';
import { MAX_TIME_INDEX, formatIndexToTimeStr, generateTimeIntervals, listedTimes, parseTimeToIndex } from '../../utils';
import type { Booking } from '../../types';

/** Этаж выше попапа журнала (9000) и ниже подтверждений (9999). */
const FLOOR = 9500;

/**
 * «Изменить время» индивидуальной записи: день, начало, окончание.
 *
 * На телефоне это ЕДИНСТВЕННЫЙ способ сдвинуть или растянуть запись —
 * перетаскивания там нет, палец листает расписание. На ноутбуке окно делает
 * то же, что перетаскивание, но точно до минуты. Сохраняется оно тем же путём,
 * что и жесты (`onSave` → hooks/useResourceMove): одна история отмены, одно
 * сообщение о цене и один набор проверок сервера.
 *
 * Сдвиг начала переносит запись целиком — длительность остаётся прежней;
 * окончание меняет длительность. Так человек, передвинувший 10:00 на 11:00,
 * не получает запись 11:00–10:45, а тот, кто хочет подольше, тянет конец.
 *
 * В списке начал — свободное время мастера в этот день. Это подсказка, а не
 * запрет: время, которого в списке нет, можно набрать, а занятость проверит
 * сервер и скажет, если оно занято.
 */
export function MoveBookingModal({ booking, trainerName, onSave, onClose }: {
  booking: Booking;
  trainerName?: string;
  /** Сохранить новое время. true — сохранено, окно закрывается. */
  onSave: (next: Booking) => Promise<boolean>;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation(['journal', 'common']);
  const [date, setDate] = useState(booking.date ?? '');
  const [start, setStart] = useState(booking.timeStart);
  const [end, setEnd] = useState(booking.timeEnd);
  const [saving, setSaving] = useState(false);

  const minutes = Math.round((end - start) * 60);
  const tooShort = minutes <= 0;
  const changed = date !== (booking.date ?? '') || start !== booking.timeStart || end !== booking.timeEnd;

  const { data: availability } = useQuery({
    queryKey: ['resource-move-availability', booking.id, booking.serviceId, booking.branchId, booking.trainer, date],
    queryFn: () => hybridApi.availability({
      service_id: booking.serviceId!,
      branch_id: booking.branchId!,
      teacher_id: booking.trainer,
      date_from: date,
      date_to: date,
      // Запись не занимает сама себя: иначе список прятал бы соседние минуты,
      // которые сервер примет (перенос считается с тем же исключением).
      exclude_lesson_id: booking.id,
    }),
    enabled: booking.serviceId != null && booking.branchId != null && date !== '',
  });

  const starts = useMemo(() => {
    const free = (availability?.slots ?? []).map(slot => slot.local_start.slice(11, 16));
    return free.length > 0 ? listedTimes(free, 15) : generateTimeIntervals(15);
  }, [availability]);
  const ends = useMemo(
    () => generateTimeIntervals(15).filter(time => parseTimeToIndex(time) > start),
    [start],
  );

  const moveStart = (time: string) => {
    const next = parseTimeToIndex(time);
    // Край сетки (23:00) — предел и для конца: дальше Журнал запись не покажет.
    setEnd(Math.min(end + (next - start), MAX_TIME_INDEX));
    setStart(next);
  };

  async function submit() {
    if (!changed || tooShort || saving) return;
    setSaving(true);
    const saved = await onSave({ ...booking, date, timeStart: start, timeEnd: end });
    setSaving(false);
    if (saved) onClose();
  }

  // День — словами, как в шапке карточки занятия: «пт, 25 сентября», а не
  // «2026-09-25», которое человек у стойки читает с запинкой.
  const day = booking.date
    ? new Date(`${booking.date}T00:00:00`).toLocaleDateString(i18n.language, {
        weekday: 'short', day: 'numeric', month: 'long',
      })
    : '';
  const now = `${day} · ${formatIndexToTimeStr(booking.timeStart)}–${formatIndexToTimeStr(booking.timeEnd)}`;

  return (
    <ModalShell size="sm" onClose={onClose} maxWidth="440px" dismissible={!saving} zIndex={FLOOR}>
      <ModalHeader
        title={t('resourceBooking.moveTitle')}
        subtitle={[booking.title, trainerName].filter(Boolean).join(' · ')}
      />
      <ModalBody>
        <div style={{ display: 'grid', gap: '14px' }}>
          <div className="mv-now">
            <span className="mv-now-label">{t('resourceBooking.moveNow')}</span>
            <span className="mv-now-value">{now}</span>
          </div>

          <div>
            <label className="vk-label">{t('resourceBooking.date')}</label>
            <input className="modal-input kp-date-input" type="date" value={date} disabled={saving}
                   style={{ width: '100%' }} onChange={e => setDate(e.target.value)} />
          </div>

          <div className="mv-times">
            <div>
              <label className="vk-label">{t('bookingPopup.from')}</label>
              <ResourceTimeField value={formatIndexToTimeStr(start)} free={starts}
                                 disabled={saving} onCommit={moveStart} />
            </div>
            <div>
              <label className="vk-label">{t('bookingPopup.to')}</label>
              <ResourceTimeField value={formatIndexToTimeStr(end)} free={ends}
                                 disabled={saving} onCommit={time => setEnd(parseTimeToIndex(time))} />
            </div>
          </div>

          <div className={`mv-duration ${tooShort ? 'is-error' : ''}`} role={tooShort ? 'alert' : undefined}>
            {tooShort
              ? t('bookingPopup.errors.endAfterStart')
              : `${t('resourceBooking.durationLabel')}: ${minutes} ${t('common:units.min')}`}
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <GhostButton>{t('bookingPopup.cancel')}</GhostButton>
        <PrimaryButton onClick={() => void submit()} disabled={!changed || tooShort} loading={saving}>
          {t('bookingPopup.reschedule')}
        </PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}
