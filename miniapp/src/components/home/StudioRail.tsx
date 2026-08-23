import { useEffect, useRef } from 'react';
import StudioCard from './StudioCard';
import { useIsDesktop } from '../../hooks/useIsDesktop';
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
 * Мягкий край ленты: последняя видимая карточка растворяется в фоне вместо
 * того, чтобы обрываться по линии отреза. Слева туман начинается в зоне
 * поля (24px), поэтому первую карточку в начале прокрутки он не трогает;
 * справа гаснет 44px — как раз хвост, за которым лежит продолжение.
 */
const FADE =
  'linear-gradient(to right, transparent 0, #000 24px, #000 calc(100% - 44px), transparent 100%)';

/**
 * Студия студии рознь: филиал один — это место, филиалов несколько — это выбор.
 *
 * Один: карточка во всю колонку, без прокрутки и примагничивания.
 *
 * Несколько на телефоне: прокрутка вбок с примагничиванием (scroll-snap),
 * активной считается карточка, чей центр ближе всего к центру экрана — поэтому
 * она подсвечивается и во время листания, а не только по тапу. Замер идёт в
 * rAF: событие scroll на телефоне летит десятками кадров, и без throttle это
 * лишние layout-чтения на каждый пиксель.
 *
 * Несколько на десктопе: сетка по два в ряд, никакой прокрутки вбок. Мышь
 * листать ленту не умеет — колесо крутит страницу, полос прокрутки внутри
 * экранов у приложения нет (index.css), — и третий филиал оказывался за краем
 * без единого способа до него добраться. Тот же приём, что у направлений:
 * места на широком экране хватает, чтобы показать всё сразу.
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
  const isDesktop = useIsDesktop();
  const solo = studios.length === 1;

  useEffect(() => {
    const rail = railRef.current;
    // На десктопе прокрутки нет вовсе — карточки разложены сеткой, и мерить
    // нечего: активной там ничего не считается (см. подсветку в StudioCard).
    if (!rail || solo || isDesktop) return;

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
  }, [studios, activeId, onSelect, solo, isDesktop]);

  return (
    <div
      ref={railRef}
      className={
        solo
          ? 'px-5'
          : 'flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 dt:flex-wrap dt:gap-4 dt:overflow-visible dt:pb-0'
      }
      // Туман только там, где есть что скрывать: в разложенной сетке десктопа
      // гасить нечего, а маска съедала бы края крайних карточек ни за что.
      style={!solo && !isDesktop ? { maskImage: FADE, WebkitMaskImage: FADE } : undefined}
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
          solo={solo}
          dim={!isDesktop}
        />
      ))}
      {/* Хвост, чтобы последняя карточка доезжала до центра экрана. На
          десктопе центрировать нечего — ряд стоит от левого края. */}
      {!solo && <div className="w-[10vw] shrink-0 dt:hidden" aria-hidden="true" />}
    </div>
  );
}
