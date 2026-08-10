import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { NavItem } from './navItems';
import { cn } from '../lib/utils';

type Props = {
  active: string;
  onSelect: (tab: string) => void;
  /** Разделы для этой студии — решает App (см. `visibleNavItems`). */
  items: NavItem[];
  /** Кабинет принадлежит студии, а не Velora — её марка стоит первой. */
  studioName?: string;
  logoUrl?: string | null;
  userName?: string;
};

/**
 * Боковое меню десктопа — замена нижней капсулы, а не её растянутая копия.
 *
 * Колонка сидит прямо на жемчужном фоне без разделительной линии: границу
 * держит воздух, как и во всём остальном продукте. Единственная поверхность
 * здесь — активный пункт: белая карточка с мягкой тенью, которая переезжает
 * между разделами (layoutId). Тот же приём, что у «таблетки» переключателей,
 * поэтому переход читается как перемещение предмета, а не как перекраска.
 *
 * Ширина постоянная (260px): сворачиваемое меню — это состояние, которое надо
 * хранить, объяснять иконкой и восстанавливать между сессиями, ради четырёх
 * пунктов.
 */
export default function DesktopNav({ active, onSelect, items, studioName, logoUrl, userName }: Props) {
  const { t } = useTranslation();

  return (
    /* sticky вместо собственной области прокрутки: страница листается целиком,
       а меню просто остаётся на экране. overflow-y на случай низкого окна —
       иначе профиль внизу колонки становится недосягаем. */
    <aside className="sticky top-0 z-20 flex h-screen w-[272px] shrink-0 flex-col overflow-y-auto px-6 py-10">
      {/* Две марки, одна под другой: сверху продукт, снизу студия, чей это
          кабинет. Знак Velora — те же четыре окошка, что в меню CRM: клиент и
          владелец должны узнавать один продукт. */}
      <div className="flex min-w-0 items-center gap-2.5 px-3.5">
        <span className="shrink-0 text-brand">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-[18px] w-[18px]">
            <rect width="9" height="9" rx="2.6" />
            <rect x="11" width="9" height="9" rx="2.6" opacity="0.55" />
            <rect y="11" width="9" height="9" rx="2.6" opacity="0.55" />
            <rect x="11" y="11" width="9" height="9" rx="2.6" />
          </svg>
        </span>
        <span className="truncate text-[13px] font-extrabold uppercase tracking-[0.24em] text-foreground">
          Velora
        </span>
      </div>

      <div className="mt-9 flex min-w-0 items-center gap-3 px-3.5">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-[13px] object-cover shadow-soft" />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-brand shadow-brand">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--v-brand-foreground)"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M12 21c-4-2.5-6-5.6-6-9a6 6 0 0112 0c0 3.4-2 6.5-6 9z" />
              <circle cx="12" cy="11" r="2" />
            </svg>
          </span>
        )}

        <div className="min-w-0">
          <div className="truncate text-[14px] font-extrabold tracking-[-0.02em] text-foreground">
            {studioName || 'Velora'}
          </div>
          <div className="mt-1 truncate text-[9px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">
            {t('nav.client_area')}
          </div>
        </div>
      </div>

      <nav className="mt-12 flex flex-col gap-1.5">
        {items.map((item) => {
          const isActive = active === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group relative flex h-[50px] items-center gap-3.5 rounded-[16px] px-3.5 text-left transition-colors duration-200',
                // Подсветка наведения только у неактивных: под активным уже
                // лежит белая карточка, второй слой её бы только замутил.
                !isActive && 'hover:bg-foreground/[0.04]',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-active-dt"
                  transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                  className="absolute inset-0 rounded-[16px] bg-card shadow-soft"
                />
              )}

              <svg
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(
                  'relative h-[19px] w-[19px] shrink-0 transition-colors duration-200',
                  isActive
                    ? 'stroke-brand'
                    : 'stroke-muted-foreground group-hover:stroke-foreground',
                )}
              >
                {item.icon}
              </svg>

              <span
                className={cn(
                  'relative truncate text-[13.5px] tracking-[-0.01em] transition-colors duration-200',
                  isActive
                    ? 'font-extrabold text-foreground'
                    : 'font-bold text-muted-foreground group-hover:text-foreground',
                )}
              >
                {t(item.labelKey)}
              </span>

              {/* Персиковая засечка у активного: метка «вы здесь», которую
                  видно и краем глаза, когда взгляд уже в контенте. */}
              {isActive && (
                <motion.span
                  layoutId="nav-active-tick"
                  transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                  className="absolute right-3.5 h-4 w-1 rounded-full bg-brand"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Клиент внизу колонки: на телефоне его инициал стоит в шапке главной,
          на десктопе шапка от неё скрыта — иначе имя дублируется дважды. */}
      <button
        type="button"
        onClick={() => onSelect('prof')}
        className="group mt-auto flex min-w-0 items-center gap-3 rounded-[18px] bg-card px-3.5 py-3.5 text-left shadow-soft transition-shadow duration-200 hover:shadow-lift"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-extrabold text-brand-foreground">
          {(userName || 'A').charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-[-0.01em] text-card-foreground">
          {userName || t('profile.guest')}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--v-muted-foreground)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </aside>
  );
}
