import type { NavItem } from './navItems';
import { cn } from '../lib/utils';

type Props = Pick<NavItem, 'icon' | 'solid'> & {
  /** Залитый вариант вместо контура. */
  filled: boolean;
  className?: string;
};

/**
 * Иконка раздела: контур или залитая фигура.
 *
 * Сама по себе иконка ничего не «наливает». В капсуле телефона (BottomNav)
 * заливку даёт линза: залитый ряд иконок лежит внутри неё и виден ровно там,
 * где она стоит, — поэтому здесь `filled` у каждого ряда постоянный. Плавная
 * смена варианта нужна только боковому меню десктопа: там два слоя
 * растворяются друг в друге, пока белая карточка подъезжает к пункту.
 *
 * Цвет — currentColor: какой цвет у пункта, такой у обоих слоёв (см. index.css,
 * блок «Навигация»).
 */
export default function NavGlyph({ icon, solid, filled, className }: Props) {
  return (
    <span className={cn('nav-glyph', className)} data-filled={filled || undefined} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="nav-glyph-line">
        {icon}
      </svg>
      <svg viewBox="0 0 24 24" className={cn('nav-glyph-solid', !solid && 'is-traced')}>
        {solid ?? icon}
      </svg>
    </span>
  );
}
