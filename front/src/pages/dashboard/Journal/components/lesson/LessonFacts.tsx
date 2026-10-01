// Всё о занятии одним взглядом: когда, где (зал, филиал, улица — со ссылкой на
// карту), кто ведёт, сколько стоит, уровень, инвентарь, заполненность и деньги
// по записанным. Данные — из GET /schedule/lessons/{id}; пока он летит,
// плитки строятся по карточке сетки, а адрес и сводка по деньгам дорисуются.
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../components/Icons';
import type { BookedClient, LessonDetail } from '../../../../../api/schedule/schedule.types';
import { formatMoney } from '../../../../../lib/money';
import { useRoleLabel } from '../../../../../hooks/useBusinessTerms';
import type { Booking } from '../../types';
import { attendanceOf, isLessonStarted } from '../../utils';
import './lessonCard.css';
import { MasterCompensation } from './MasterCompensation';

interface Props {
  booking: Booking;
  detail: LessonDetail | null;
  booked: BookedClient[] | null;
  trainerName?: string;
  currency?: string;
}

const durationOf = (b: Booking) => Math.round((b.timeEnd - b.timeStart) * 60);

export function LessonFacts({ booking, detail, booked, trainerName, currency }: Props) {
  const { t, i18n } = useTranslation('journal');
  const roleLabel = useRoleLabel();
  const location = detail?.location ?? null;
  // Город — только когда улицы нет: в адресе студии он обычно уже есть
  // («Vinohradská 42, Praha 2»), и приписка «Prague» читалась бы повтором.
  const street = location?.address || location?.city || '';
  const place = [location?.hall_name ?? booking.hall, location?.branch_name].filter(Boolean).join(' · ');
  const mapUrl = street ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(street)}` : null;
  const minutes = durationOf(booking);
  const date = booking.date
    ? new Date(`${booking.date}T00:00:00`).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
    : null;
  const level = detail?.level?.trim();
  const equipment = detail?.equipment?.trim();

  return (
    <div className="lc-facts">
      <div className="lc-when">
        <div className="lc-when-date">{date ?? t('lessonCard.today')}</div>
        {/* Время — в шапке попапа; здесь длительность. */}
        <span className="lc-when-dur">{t('lessonCard.minutes', { value: minutes })}</span>
      </div>

      {/* Место — главное, о чём спрашивают клиенты: улица крупно, зал и филиал
          под ней, и одно нажатие до маршрута. */}
      <a className={`lc-place${mapUrl ? '' : ' is-static'}`} href={mapUrl ?? undefined}
         target="_blank" rel="noopener noreferrer"
         onClick={e => { if (!mapUrl) e.preventDefault(); e.stopPropagation(); }}>
        <span className="lc-place-icon"><Icons.MapPin /></span>
        <span className="lc-place-text">
          <span className="lc-place-street">{street || place || t('lessonCard.noAddress')}</span>
          {street && place && <span className="lc-place-hall">{place}</span>}
        </span>
        {mapUrl && <span className="lc-place-go">{t('lessonCard.route')}</span>}
      </a>

      <div className="lc-tiles">
        <Tile label={roleLabel('trainer')} caption={<MasterCompensation value={detail?.compensation} currency={currency} />}>
          <span className="lc-dot" style={{ background: booking.color }} />
          {trainerName ?? '—'}
        </Tile>
        <Tile label={t('lessonCard.price')}>{formatMoney(booking.price, currency)}</Tile>
        {booking.bookingMode !== 'resource' && (
          <Tile label={t('lessonCard.spots')}>{booking.clients} / {booking.maxClients}</Tile>
        )}
        <Tile label={t('lessonCard.format')}>
          {booking.bookingMode === 'resource' ? t('lessonCard.individual') : t('lessonCard.group')}
        </Tile>
        {level && <Tile label={t('lessonCard.level')}>{level}</Tile>}
        {equipment && <Tile label={t('lessonCard.equipment')}>{equipment}</Tile>}
        {(booking.bufferBefore || booking.bufferAfter) ? (
          <Tile label={t('lessonCard.buffers')}>
            {t('lessonCard.buffersValue', { before: booking.bufferBefore ?? 0, after: booking.bufferAfter ?? 0 })}
          </Tile>
        ) : null}
      </div>

      {booking.bookingMode !== 'resource' && booking.maxClients > 0 && (
        <div className="lc-fill">
          <div className="lc-fill-bar">
            <span style={{ width: `${Math.min(100, booking.clients / booking.maxClients * 100)}%`, background: booking.color }} />
          </div>
          <span className="lc-fill-pct">{Math.round(booking.clients / booking.maxClients * 100)}%</span>
        </div>
      )}

      {booked && booked.length > 0 && <MoneyStrip booked={booked} started={isLessonStarted(booking)} currency={currency} />}
    </div>
  );
}

/** Пришли, оплачено, долг — по записанным на это занятие. */
function MoneyStrip({ booked, started, currency }: { booked: BookedClient[]; started: boolean; currency?: string }) {
  const { t } = useTranslation('journal');
  // Пришёл — по той же отметке, что у строки записанного: с начала занятия
  // неотмеченный считается пришедшим (utils.attendanceOf).
  const attended = booked.filter(c => attendanceOf(c, started) === 'came').length;
  const paid = booked.reduce((sum, c) => sum + (c.paid_amount ?? 0), 0);
  const debt = booked.reduce((sum, c) => sum + c.debt, 0);
  return (
    <div className="lc-money">
      <div className="lc-money-cell">
        <strong>{attended}/{booked.length}</strong>
        <span>{t('lessonCard.cameIn')}</span>
      </div>
      <div className="lc-money-cell is-good">
        <strong>{formatMoney(paid, currency)}</strong>
        <span>{t('lessonCard.paid')}</span>
      </div>
      <div className={`lc-money-cell${debt > 0 ? ' is-debt' : ''}`}>
        <strong>{formatMoney(debt, currency)}</strong>
        <span>{t('lessonCard.owed')}</span>
      </div>
    </div>
  );
}

function Tile({ label, children, caption }: { label: string; children: React.ReactNode; caption?: React.ReactNode }) {
  return (
    <div className="lc-tile">
      <span className="lc-tile-label">{label}</span>
      <span className="lc-tile-value">{children}</span>
      {caption}
    </div>
  );
}
