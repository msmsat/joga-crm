import type React from 'react';

/** Скругление карточки занятия и превью новой записи, px. */
export const CARD_RADIUS = 10;

// Скругление берётся из переменной карточки (.booking-card: --card-r): на
// телефоне в неделе оно меньше, и уголки полосы должны совпасть с дугой.
const R = `var(--card-r, ${CARD_RADIUS}px)`;

/**
 * Полоса буфера (подготовка / уборка), подложенная под край занятия.
 *
 * Полоса заходит под карточку на её радиус, а маска вырезает из этого нахлёста
 * силуэт карточки: остаются только уголки между дугой карточки и прямым краем
 * полосы — буфер закрывает их, и занятие с буфером читаются одной фигурой, а
 * карточка сохраняет свои скругления. Нахлёст вырезан, а не спрятан под
 * карточку: фон карточки полупрозрачный, и штриховка проступала бы сквозь неё.
 *
 * `visible` — видимая высота полосы в px, от края карточки.
 */
export const bufferStyle = (
  color: string, edge: 'before' | 'after', visible: number,
): React.CSSProperties => {
  const atTop = edge === 'after'; // у буфера «после» карточка сверху
  const y = atTop ? '0' : '100%';
  const corner = (cx: string, x: string) =>
    `radial-gradient(circle at ${cx} ${y}, transparent calc(${R} - 0.5px), #000 ${R}) ${x} ${y} / ${R} ${R} no-repeat`;
  const mask = [
    corner('100%', '0'),
    corner('0', '100%'),
    `linear-gradient(#000, #000) 0 ${atTop ? R : '0'} / 100% calc(100% - ${R}) no-repeat`,
  ].join(', ');

  return {
    position: 'absolute', pointerEvents: 'none', boxSizing: 'border-box',
    height: `calc(${visible}px + ${R})`,
    border: `1.5px dashed ${color}99`,
    ...(atTop ? { borderTop: 'none' } : { borderBottom: 'none' }),
    borderRadius: atTop ? `0 0 ${R} ${R}` : `${R} ${R} 0 0`,
    // Сплошная подложка под штриховкой: без неё уголки у дуги карточки
    // (10×10px) выходили почти прозрачными и казались пустыми.
    background: `repeating-linear-gradient(135deg, ${color}40 0 4px, transparent 4px 9px), ${color}1f`,
    WebkitMask: mask,
    mask,
  };
};
