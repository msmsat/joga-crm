import { useTranslation } from 'react-i18next';
import type { BookingModeSlice } from '../../../../api/analytics/analytics.types';

/**
 * HB-23 / §4.1: две модели записи в одном ряду и с разными знаменателями.
 *
 * Событий и записей ДВА РАЗНЫХ ЧИСЛА: группа с десятью участниками — одно
 * событие и десять записей, индивидуальная запись — один интервал и одна
 * запись. Сложить их в «количество занятий» значит соврать вдвойне.
 *
 * `pending` и `hold` показаны отдельно и НЕ входят ни в посещения, ни в
 * выручку: место держится, но визита ещё не было и деньги не получены.
 *
 * Загрузка `null` — «Нет данных», а не 0 %: у события это отсутствие
 * вместимости в периоде, у индивидуальной услуги — незаполненные часы
 * специалистов. Обе причины требуют разных действий владельца.
 */
export function BookingModesBoard({ rows }: { rows: BookingModeSlice[] }) {
  const { t } = useTranslation('dashboard');
  if (rows.length === 0) return null;

  return (
    <div className="card mb-20" style={{ padding: '24px 28px' }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 16 }}>
        {t('bookingModes.title')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`, gap: 16 }}>
        {rows.map(row => (
          <div key={row.booking_mode} style={{
            border: '1px solid rgba(var(--ink),0.08)', borderRadius: 14, padding: '16px 18px',
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text3)' }}>
              {t(`bookingModes.${row.booking_mode}`)}
            </div>
            <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
              <Line label={t('bookingModes.events')} value={String(row.events)} />
              <Line label={t('bookingModes.bookings')} value={String(row.bookings)} />
              <Line label={t('bookingModes.attended')} value={String(row.attended)} />
              <Line label={t('bookingModes.pending')} value={String(row.pending)} muted />
              <Line label={t('bookingModes.hold')} value={String(row.hold)} muted />
              <Line label={t('bookingModes.cancelled')} value={String(row.cancelled)} muted />
              <Line
                label={t('bookingModes.utilization')}
                value={row.utilization_pct == null ? t('bookingModes.noData') : `${row.utilization_pct}%`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: muted ? 'var(--text3)' : 'var(--text2)' }}>{label}</span>
      <span style={{ fontWeight: 800, color: muted ? 'var(--text3)' : 'var(--text)' }}>{value}</span>
    </div>
  );
}
