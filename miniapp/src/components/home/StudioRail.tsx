import { useEffect, useRef } from 'react';
import StudioCard from './StudioCard';
import type { Studio } from '../../api/studio';

type Props = {
  studios: Studio[];
  activeId: number;
  onSelect: (id: number) => void;
  /** id студий в избранном */
  liked: number[];
  onOpen: (studio: Studio) => void;
  onToggleLike: (id: number) => void;
  accentColor: string;
};

/**
 * Лента выбора студии. Прокрутка вбок с примагничиванием (scroll-snap),
 * активной считается карточка, чей центр ближе всего к центру экрана —
 * поэтому она подсвечивается и во время листания, а не только по тапу.
 *
 * Замер идёт в rAF: событие scroll на телефоне летит десятками кадров,
 * и без throttle это лишние layout-чтения на каждый пиксель.
 */
export default function StudioRail({
  studios,
  activeId,
  onSelect,
  liked,
  onOpen,
  onToggleLike,
  accentColor,
}: Props) {
  const railRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const measure = () => {
      const railCenter = rail.scrollLeft + rail.clientWidth / 2;

      let nearestIndex = 0;
      let nearestDistance = Infinity;

      Array.from(rail.children).forEach((child, index) => {
        const el = child as HTMLElement;
        const cardCenter = el.offsetLeft + el.offsetWidth / 2;
        const distance = Math.abs(cardCenter - railCenter);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      const nearest = studios[nearestIndex];
      if (nearest && nearest.id !== activeId) onSelect(nearest.id);
    };

    const onScroll = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(measure);
    };

    rail.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      rail.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame.current);
    };
  }, [studios, activeId, onSelect]);

  return (
    <div
      ref={railRef}
      className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2"
    >
      {studios.map((studio) => (
        <StudioCard
          key={studio.id}
          studio={studio}
          isActive={studio.id === activeId}
          isLiked={liked.includes(studio.id)}
          onOpen={() => {
            onSelect(studio.id);
            onOpen(studio);
          }}
          onToggleLike={() => onToggleLike(studio.id)}
          accentColor={accentColor}
        />
      ))}
      {/* Хвост, чтобы последняя карточка доезжала до центра экрана */}
      <div className="w-[12vw] shrink-0" aria-hidden="true" />
    </div>
  );
}
