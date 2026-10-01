// Мини-окошко над кнопкой «Посещение» до начала занятия: «Пришёл» или «Не
// пришёл». Живёт в портале на <body> с фиксированной позицией: строка
// записанного сидит в прокручиваемом попапе, и окошко внутри него обрезалось
// бы верхним краем у первой же строки. Класс `lc-attend-pop` попап занятия
// знает и закрываться от клика по окошку не станет (Journal.tsx).
import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../components/Icons';
import type { Attendance } from '../../utils';
import './lessonCard.css';

const GAP = 8;
const EDGE = 8;

export function AttendChoice({ anchor, current, onPick, onClose }: {
  anchor: HTMLElement;
  current: Attendance;
  onPick: (attended: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('journal');
  const box = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);

  // Позиция — прямо в стиль, до первой отрисовки: над кнопкой по центру, у
  // края окна прижимается, сверху места нет — под кнопкой (и хвостик вверх).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = anchor.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = el;
    const left = Math.min(Math.max(EDGE, r.left + r.width / 2 - w / 2), window.innerWidth - w - EDGE);
    const above = r.top - h - GAP >= EDGE;
    el.style.left = `${left}px`;
    el.style.top = `${above ? r.top - h - GAP : r.bottom + GAP}px`;
    el.style.setProperty('--arrow-x', `${r.left + r.width / 2 - left}px`);
    el.classList.toggle('is-below', !above);
    first.current?.focus({ preventScroll: true });
  }, [anchor]);

  // Уходит от клика мимо, Escape, прокрутки и смены размера окна: позиция
  // посчитана один раз, и ехать за кнопкой окошко не умеет.
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!box.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); anchor.focus(); } };
    const move = () => onClose();
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('scroll', move, true);
    window.addEventListener('resize', move);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', move, true);
      window.removeEventListener('resize', move);
    };
  }, [anchor, onClose]);

  const option = (attended: boolean) => {
    const on = attended ? current === 'came' : current === 'missed';
    return (
      <button
        ref={attended ? first : undefined}
        type="button"
        role="menuitemradio"
        aria-checked={on}
        className={`lc-attend-opt ${attended ? 'is-came' : 'is-missed'}${on ? ' is-on' : ''}`}
        onClick={e => { e.stopPropagation(); onPick(attended); }}
      >
        <span className="lc-attend-dot">{attended ? <Icons.Check /> : <Icons.X />}</span>
        {attended ? t('clientCard.status.attended') : t('clientCard.status.missed')}
      </button>
    );
  };

  return createPortal(
    <div
      ref={box}
      className="lc-attend-pop"
      role="menu"
      aria-label={t('mark.choose')}
      // Клик внутри не должен дойти до строки клиента и сетки под попапом.
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {option(true)}
      {option(false)}
    </div>,
    document.body,
  );
}
