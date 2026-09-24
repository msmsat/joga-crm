import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import * as Icons from '../../../../components/Icons';
import { useToast } from '../../../../components/ui/index';
import { hybridApi } from '../../../../api/booking/hybrid.api';
import { errorMessage } from '../../../../api/errorMessage';
import { formatIndexToTimeStr, parseTimeToIndex, listedTimes } from '../utils';
import type { Booking } from '../types';

/**
 * Перенос индивидуальной записи — два поля во всплывающем окне.
 *
 * Раньше «Перенести» открывала полноценную форму записи в режиме переноса: та
 * спрашивала дату, показывала плитку слотов, потом расчёт, потом подтверждение.
 * Для «сдвинуть Ирину с 14:00 на 15:30» это четыре экрана и три клика на ровном
 * месте — услуга, филиал и клиент при переносе и так заданы самой бронью и
 * менять их нельзя (§6.5).
 *
 * Поля жили прямо в карточке занятия и занимали её треть всегда — даже когда
 * ничего не переносят. Теперь они появляются по кнопке (MoveBookingModal), а
 * здесь остаётся только содержимое окна.
 *
 * Здесь остаётся ровно то, что меняется: день и время. Время — то же поле с
 * выпадающим списком, что у правки занятия, но в списке СВОБОДНОЕ время мастера,
 * а не вся сетка часов: показать занятое значило бы обещать то, что сервер
 * отклонит. Набрать руками по-прежнему можно — попадание в свободный слот
 * проверяется на месте, до отправки.
 *
 * Сервер по-прежнему видит два шага (quote → reschedule с expected_version):
 * это его защита от чужой правки между показом и подтверждением. Для человека
 * это одно нажатие — расчёт при переносе показывать нечего, цена и
 * длительность по определению те же, иначе сервер отвечает TERMS_CHANGED.
 */

const QUERY_KEY = 'resource-move-availability';

interface Props {
  booking: Booking;
  /** Бронь, которую двигаем. `null` — список записанных ещё грузится. */
  reservationId: number | null;
  /** Перенос удался: обновить журнал и закрыть карточку. */
  onMoved: () => void;
}

export function ResourceMoveField({ booking, reservationId, onMoved }: Props) {
  const { t } = useTranslation('journal');
  const toast = useToast();

  const currentDate = booking.date ?? '';
  const currentTime = formatIndexToTimeStr(booking.timeStart);
  const [date, setDate] = useState(currentDate);
  const [time, setTime] = useState(currentTime);
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Мастер тот же, что и был: перенос — это другое ВРЕМЯ той же записи, а не
  // передача её другому специалисту. Без этого фильтра свободное время
  // считалось бы по всем мастерам услуги, и `teacher_ids[0]` у чужого слота
  // молча переписал бы исполнителя — сервер такую замену не отклоняет.
  const teacherId = booking.trainer > 0 ? booking.trainer : undefined;

  const { data: availability, isPending } = useQuery({
    queryKey: [QUERY_KEY, booking.id, booking.serviceId, booking.branchId, teacherId, date],
    queryFn: () => hybridApi.availability({
      service_id: booking.serviceId!,
      branch_id: booking.branchId!,
      teacher_id: teacherId,
      date_from: date,
      date_to: date,
      // Занятие не занимает само себя: без этого список прятал бы соседние
      // минуты, которые сервер на самом деле примет — его quote считается
      // ровно с таким же исключением (services/resource_reschedule).
      exclude_lesson_id: booking.id,
    }),
    enabled: booking.serviceId != null && booking.branchId != null && date !== '',
  });

  // «HH:MM» → момент, который отправится серверу. Строим карту, а не ищем
  // перебором: список рисуется из тех же ключей, и второй проход по слотам
  // ради того же ответа не нужен.
  const free = useMemo(() => {
    const map = new Map<string, { startsAt: string; teacherId: number | null }>();
    for (const slot of availability?.slots ?? []) {
      map.set(slot.local_start.slice(11, 16), {
        startsAt: slot.starts_at,
        teacherId: slot.teacher_ids[0] ?? null,
      });
    }
    return map;
  }, [availability]);

  const picked = free.get(time) ?? null;
  const changed = date !== currentDate || time !== currentTime;
  const ready = Boolean(picked) && changed && reservationId != null && !saving;
  // Ругаемся только на то, что человек уже выбрал: пока список едет, «занято»
  // было бы неправдой, а на неизменённом времени — придиркой.
  const busy = changed && !picked && !isPending;

  async function move() {
    if (!ready || !picked || reservationId == null) return;
    setSaving(true);
    try {
      const quote = await hybridApi.moveQuote(reservationId, {
        booking_mode: 'resource',
        service_id: booking.serviceId!,
        branch_id: booking.branchId!,
        teacher_id: teacherId ?? picked.teacherId,
        starts_at: picked.startsAt,
      });
      await hybridApi.move(reservationId, quote.quote_id, booking.version ?? 1);
      toast.success(t('toasts.lessonMoved'));
      onMoved();
    } catch (error) {
      toast.error(errorMessage(error, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={e => e.stopPropagation()}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={FIELD}>
          <span style={FIELD_KICKER}>{t('resourceBooking.date')}</span>
          <input
            type="date"
            value={date}
            onChange={e => { setDate(e.target.value); setIsOpen(false); }}
            style={FIELD_INPUT}
          />
        </label>

        <div className="kp-time-container" style={{ position: 'relative' }}>
          <div style={{ ...FIELD, borderColor: isOpen ? 'var(--peach)' : busy ? 'var(--error)' : 'var(--border)', cursor: 'text' }}>
            <span style={FIELD_KICKER}>{t('resourceBooking.time')}</span>
            <input
              type="text"
              value={time}
              onFocus={e => { e.target.select(); setIsOpen(true); }}
              onChange={e => setTime(e.target.value)}
              // Набранное приводим к виду сетки на выходе из поля: «9» и «9:0»
              // человек пишет чаще, чем «09:00», и отвергать их было бы
              // придиркой к форме, а не к смыслу.
              onBlur={e => { setTime(formatIndexToTimeStr(parseTimeToIndex(e.target.value))); setIsOpen(false); }}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              style={{ ...FIELD_INPUT, textAlign: 'center' }}
            />
          </div>

          {isOpen && free.size > 0 && (
            <div className="kp-time-dropdown">
              {listedTimes([...free.keys()], 15).map(value => (
                <div
                  key={value}
                  className={`kp-time-item ${value === time ? 'active-time-item' : ''}`}
                  onMouseDown={e => { e.preventDefault(); setTime(value); setIsOpen(false); }}
                >
                  {value}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(busy || (!isPending && free.size === 0)) && (
        <div style={{ fontSize: 11, color: 'var(--error)', fontWeight: 600, marginTop: 8 }}>
          {free.size === 0 ? t('resourceBooking.noSlots') : t('resourceBooking.moveBusy')}
        </div>
      )}

      {/* Кнопка появляется, только когда есть что переносить: на нетронутом
          времени переносить нечего, и серая кнопка там — просто шум. */}
      {changed && (
        <button
          type="button"
          className="bp-btn primary text-btn"
          disabled={!ready}
          style={{ width: '100%', marginTop: 10, opacity: ready ? 1 : 0.5, cursor: ready ? 'pointer' : 'not-allowed' }}
          onClick={move}
        >
          <Icons.Clock /> {saving || reservationId == null ? t('bookingPopup.loading') : t('bookingPopup.reschedule')}
        </button>
      )}
    </div>
  );
}

const FIELD: React.CSSProperties = {
  display: 'flex', alignItems: 'center', background: 'var(--bg)',
  border: '1.5px solid var(--border)', borderRadius: '12px',
  padding: '0 10px', height: '42px', boxSizing: 'border-box',
  transition: 'border-color 0.2s',
};

const FIELD_KICKER: React.CSSProperties = {
  fontSize: '10px', color: 'var(--muted)', fontWeight: 800,
  textTransform: 'uppercase', marginRight: '6px', flexShrink: 0,
};

const FIELD_INPUT: React.CSSProperties = {
  margin: 0, padding: 0, border: 'none', background: 'transparent',
  height: '100%', width: '100%', fontSize: '13px', fontWeight: 800,
  color: 'var(--onyx)', outline: 'none', boxShadow: 'none',
};
