import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { NAV_ITEMS } from './navItems';
import { cn } from '../lib/utils';

type Props = {
  active: string;
  onSelect: (tab: string) => void;
};

/**
 * Плавающая светлая капсула навигации.
 *
 * ПРОИЗВОДИТЕЛЬНОСТЬ — почему сделано именно так:
 *
 * 1. Анимируется РОВНО ОДИН элемент — персиковая подложка, и только трансформой
 *    (layoutId переносит её с места на место через translate). Предыдущая версия
 *    гнала `width: 0 → auto` у подписи плюс `layout` у капсулы и у каждой кнопки:
 *    три слоя пересчёта раскладки на кадр, и всё это в момент, когда React
 *    монтирует целый экран. Отсюда и был лаг.
 * 2. Ширины кнопок постоянные — подписи видны у всех пунктов сразу, поэтому
 *    менять раскладку при переключении вообще не нужно.
 * 3. Никакого backdrop-filter: у закреплённого элемента над прокруткой размытие
 *    перерисовывается каждый кадр прокрутки. «Лёгкость» здесь даёт светлая
 *    поверхность с мягкой тенью и волосяной обводкой, а не полупрозрачность.
 */
export default function BottomNav({ active, onSelect }: Props) {
  const { t } = useTranslation();

  return (
    <div className="pb-safe pointer-events-none absolute inset-x-0 bottom-0 z-30 px-4 pb-4">
      <nav className="pointer-events-auto flex items-stretch gap-1 rounded-full bg-card p-1.5 shadow-lift ring-1 ring-inset ring-border">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id;
          return (
            <motion.button
              key={item.id}
              type="button"
              aria-label={t(item.labelKey)}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelect(item.id)}
              whileTap={{ scale: 0.93 }}
              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              className="relative flex min-h-[54px] flex-1 flex-col items-center justify-center gap-1 rounded-full"
            >
              {isActive && (
                <motion.span
                  layoutId="nav-active"
                  transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                  className="absolute inset-0 rounded-full bg-brand/14"
                />
              )}

              <svg
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(
                  'relative h-[19px] w-[19px] transition-colors duration-200',
                  isActive ? 'stroke-brand' : 'stroke-muted-foreground',
                )}
              >
                {item.icon}
              </svg>

              <span
                className={cn(
                  'relative max-w-full truncate px-1 text-[9.5px] leading-none tracking-[-0.005em] transition-colors duration-200',
                  isActive ? 'font-extrabold text-brand' : 'font-semibold text-muted-foreground',
                )}
              >
                {t(item.labelKey)}
              </span>
            </motion.button>
          );
        })}
      </nav>
    </div>
  );
}
