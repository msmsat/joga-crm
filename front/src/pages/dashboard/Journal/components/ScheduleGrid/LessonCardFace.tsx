// Лицо карточки занятия: всё, что на ней написано и нарисовано.
//
// Разметка одна на все размеры — от 15-минутной записи в полоску до двухчасового
// занятия. Что из неё видно и где стоит, решают запросы к контейнеру в
// BookingCard.css по высоте и ширине самой карточки: так текст никогда не
// вываливается за край, а растягивание мышью перестраивает карточку на ходу.
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Booking } from '../../types';
import { CLOCK_STEP_MS, lessonSpan, useClock, type LessonPhase } from '../../hooks/useLessonPhase';
import { cardFace } from './lessonCardModel';

// Значки нарисованы под 12px-сетку: иконки набора при 9px расплываются.
const Glyph = {
  person: (
    <svg viewBox="0 0 12 12" aria-hidden><circle cx="6" cy="3.6" r="2.1" /><path d="M2 10.4c.5-2 2.1-3.1 4-3.1s3.5 1.1 4 3.1" /></svg>
  ),
  check: (
    <svg viewBox="0 0 12 12" aria-hidden><path d="M2.6 6.3l2.2 2.2 4.6-4.9" /></svg>
  ),
  cross: (
    <svg viewBox="0 0 12 12" aria-hidden><path d="M3.4 3.4l5.2 5.2M8.6 3.4L3.4 8.6" /></svg>
  ),
  // Купюра: долг читается как «деньги», а не как валюта конкретной студии.
  cash: (
    <svg viewBox="0 0 12 12" aria-hidden><rect x="1.4" y="3.2" width="9.2" height="5.6" rx="1.2" /><circle cx="6" cy="6" r="1.3" /></svg>
  ),
};

/** Ход идущего занятия: подкрашенная пройденная часть и рельс у левого края.
 *  Двигается тиками общих часов, между тиками — плавным переходом. */
function ElapsedFill({ booking }: { booking: Pick<Booking, 'date' | 'timeStart' | 'timeEnd'> }) {
  const now = useClock();
  const span = lessonSpan(booking);
  if (!span || span.end <= span.start) return null;
  const done = Math.min(Math.max((now - span.start) / (span.end - span.start), 0), 1);
  const transitionDuration = `${CLOCK_STEP_MS}ms`;
  return (
    <>
      <span className="jc-elapsed" aria-hidden
            style={{ transform: `translateY(${(done - 1) * 100}%)`, transitionDuration }} />
      <span className="jc-rail" aria-hidden>
        <i style={{ transform: `scaleY(${done})`, transitionDuration }} />
      </span>
    </>
  );
}

interface LessonCardFaceProps {
  booking: Booking;
  phase: LessonPhase;
  /** Колонка — не мастер этого занятия (залы, неделя на нескольких мастеров). */
  showMaster: boolean;
  /** Название из открытой формы правки — карточка повторяет его на лету. */
  title?: string;
}

export const LessonCardFace = React.memo(function LessonCardFace({
  booking: b, phase, showMaster, title,
}: LessonCardFaceProps) {
  const { t } = useTranslation('journal');
  const face = cardFace(b, phase, showMaster, title);
  const cancelled = b.status === 'cancelled';
  const live = phase === 'live' && !cancelled;
  const isGroup = face.kind === 'group';
  const full = face.max > 0 && face.booked >= face.max;
  // С начала занятия группа считает пришедших, до него — записанных.
  const counted = face.came !== null && face.booked > 0;
  const shown = Math.max(face.booked - face.missed, 0);

  return (
    <div className="jc-face" data-kind={face.kind}>
      {live && <ElapsedFill booking={b} />}

      {!isGroup && face.initials && (
        <span className="jc-avatar" style={{ '--av': face.avatarColor } as React.CSSProperties}>
          {face.initials}
          {face.visit && (
            <span className={`jc-badge ${face.visit === 'came' ? 'is-came' : 'is-miss'}`}
                  title={t(face.visit === 'came' ? 'clientCard.status.attended' : 'clientCard.status.missed')}>
              {face.visit === 'came' ? Glyph.check : Glyph.cross}
            </span>
          )}
        </span>
      )}

      <span className="jc-time">
        {live && <i className="jc-live" aria-hidden />}
        <span>{face.start}</span>
        <span className="jc-time-end">–{face.end}</span>
      </span>

      <span className="jc-title">{face.title}</span>
      {face.sub && <span className="jc-sub">{face.sub}</span>}
      {face.extra && <span className="jc-extra">{face.extra}</span>}

      <span className="jc-flags">
        {cancelled ? (
          <span className="jc-flag is-off">{t('grid.cancelled')}</span>
        ) : (
          <>
            {face.unpaid > 0 && (
              <span className="jc-flag is-due"
                    title={isGroup ? t('grid.card.unpaidCount', { n: face.unpaid }) : t('grid.card.unpaid')}>
                {Glyph.cash}{isGroup && <span>{face.unpaid}</span>}
              </span>
            )}
            {isGroup && face.missed > 0 && (
              <span className="jc-flag is-miss" title={t('grid.card.missedCount', { n: face.missed })}>
                {Glyph.cross}<span>{face.missed}</span>
              </span>
            )}
            {/* Посещение индивидуальной записи — значком на аватаре; этот —
                для карточек, где аватару нет места. */}
            {face.visit && (
              <span className={`jc-flag jc-visit ${face.visit === 'came' ? 'is-came' : 'is-miss'}`}
                    title={t(face.visit === 'came' ? 'clientCard.status.attended' : 'clientCard.status.missed')}>
                {face.visit === 'came' ? Glyph.check : Glyph.cross}
              </span>
            )}
          </>
        )}
      </span>

      {isGroup && !cancelled && (
        <>
          <span className={`jc-count${full ? ' is-full' : ''}`}
                title={counted ? t('grid.card.cameCount', { n: face.came ?? 0, total: face.booked })
                  : t('grid.card.spots', { n: face.booked, total: face.max })}>
            {counted ? Glyph.check : Glyph.person}
            <span>{counted ? face.came : face.booked}{counted ? `/${face.booked}` : face.max > 0 ? `/${face.max}` : ''}</span>
          </span>
          {face.max > 0 && (
            <span
              className={`jc-meter${face.max <= 24 ? ' is-seats' : ''}`}
              aria-hidden
              style={{
                '--fill': Math.min(shown / face.max, 1),
                '--miss': Math.min(face.missed / face.max, 1),
                '--seats': face.max,
              } as React.CSSProperties}
            />
          )}
        </>
      )}

      {!isGroup && !cancelled && (b.source || face.pay) && (
        <span className={`jc-pay${face.pay === 'unpaid' ? ' is-due' : face.pay === 'paid' ? ' is-paid' : ''}`}>
          {b.source ? (
            <>Bumpix · {t(`bumpix:status.${b.source.event.status}`)}</>
          ) : (
            <>{face.pay === 'unpaid' ? Glyph.cash : Glyph.check}{t(face.pay === 'unpaid' ? 'grid.card.unpaid' : 'grid.card.paid')}</>
          )}
        </span>
      )}
    </div>
  );
});
