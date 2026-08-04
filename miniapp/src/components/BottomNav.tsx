import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';

type NavItem = { id: string; labelKey: string; icon: React.ReactNode };

const ITEMS: NavItem[] = [
  {
    id: 'home',
    labelKey: 'nav.home',
    icon: (
      <>
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </>
    ),
  },
  {
    id: 'sched',
    labelKey: 'nav.schedule',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </>
    ),
  },
  {
    id: 'my',
    labelKey: 'nav.my_lessons',
    icon: <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />,
  },
  {
    id: 'prof',
    labelKey: 'nav.profile',
    icon: (
      <>
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
  },
];

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
        {ITEMS.map((item) => {
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
