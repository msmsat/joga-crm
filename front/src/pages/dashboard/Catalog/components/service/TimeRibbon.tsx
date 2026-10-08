import { useTranslation } from 'react-i18next';

/**
 * Сколько услуга занимает в журнале: буфер до, сама услуга, буфер после — на
 * шкале целых часов, как в сетке журнала. Шкала не растягивается под услугу:
 * стрижка на 30 минут — половина часа, йога на 75 — час с четвертью из двух,
 * и при переключении услуг длины можно сравнить на глаз. Буферы раньше в
 * карточке не показывались вовсе: барбершоп видел «45 мин», а в сетке
 * стрижка занимала 55.
 *
 * Если у мастеров время разное (from < to), хвост до максимума — тем же
 * цветом, но штрихом: столько услуга длится только у части исполнителей.
 */
interface Props {
  before: number;
  from: number;
  to: number;
  after: number;
}

/** Шаг рисок по длине шкалы: мелкие и подписанные. */
function steps(scale: number): { minor: number; major: number } {
  if (scale <= 60) return { minor: 5, major: 15 };
  if (scale <= 180) return { minor: 15, major: 30 };
  if (scale <= 360) return { minor: 15, major: 60 };
  return { minor: 30, major: 120 };
}

export function TimeRibbon({ before, from, to, after }: Props) {
  const { t } = useTranslation(['catalog', 'common']);
  const min = t('common:units.min');
  const longest = Math.max(from, to);
  const total = before + longest + after;
  if (total <= 0) return null;

  const scale = Math.max(60, Math.ceil(total / 60) * 60);
  const { minor, major } = steps(scale);
  const pct = (m: number) => `${(m / scale) * 100}%`;
  const ticks: number[] = [];
  for (let m = 0; m <= scale; m += minor) ticks.push(m);

  const span = (a: number, b: number) => (b > a ? `${a}–${b}` : `${a}`);
  const buffered = before > 0 || after > 0;

  return (
    <div className="svc-time">
      <div
        className="svc-time-track"
        role="img"
        aria-label={`${t('catalog:services.card.slotTotal')}: ${span(before + from + after, total)} ${min}`}
      >
        <div className="svc-time-fill" style={{ width: pct(total) }}>
          {before > 0 && <span className="svc-seg is-buf" style={{ flexGrow: before }} />}
          <span className="svc-seg is-main" style={{ flexGrow: from }} />
          {to > from && <span className="svc-seg is-ext" style={{ flexGrow: to - from }} />}
          {after > 0 && <span className="svc-seg is-buf" style={{ flexGrow: after }} />}
        </div>
      </div>

      <div className="svc-ruler" aria-hidden="true">
        {ticks.map(m => (
          <i key={m} className={`svc-tick${m % major === 0 ? ' is-major' : ''}`} style={{ left: m === scale ? 'calc(100% - 1px)' : pct(m) }} />
        ))}
        {ticks.filter(m => m % major === 0).map(m => (
          <span
            key={m}
            className={`svc-tick-l${m === 0 ? ' is-first' : m === scale ? ' is-last' : ''}`}
            style={{ left: pct(m) }}
          >{m === scale ? `${m} ${min}` : m}</span>
        ))}
      </div>

      {(buffered || to > from) && (
        <ul className="svc-legend">
          {to > from && (
            <li className="svc-leg">
              <span className="svc-leg-sw svc-seg is-ext" />
              {t('catalog:services.card.durationVaries')}
            </li>
          )}
          {before > 0 && (
            <li className="svc-leg">
              <span className="svc-leg-sw svc-seg is-buf" />
              {t('catalog:modals.service.bufferBefore')} <b>{before} {min}</b>
            </li>
          )}
          {after > 0 && (
            <li className="svc-leg">
              <span className="svc-leg-sw svc-seg is-buf" />
              {t('catalog:modals.service.bufferAfter')} <b>{after} {min}</b>
            </li>
          )}
          {buffered && (
            <li className="svc-leg svc-leg-total">
              {t('catalog:services.card.slotTotal')} <b>{span(before + from + after, total)} {min}</b>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
