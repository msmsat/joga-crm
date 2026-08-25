import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { NavItem } from './navItems';
import AccountMenu from './AccountMenu';
import LanguagePopover from './profile/LanguagePopover';
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
  /** Вход ещё одним аккаунтом — экран входа поднимает App. */
  onAddAccount: () => void;
  /** Человек без аккаунта. Ему сюда добавляется выбор языка: профиля, где эта
   *  настройка живёт у вошедшего, у него нет. */
  isGuest?: boolean;
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
export default function DesktopNav({
  active,
  onSelect,
  items,
  studioName,
  logoUrl,
  userName,
  onAddAccount,
  isGuest,
}: Props) {
  const { t } = useTranslation();

  return (
    /* sticky вместо собственной области прокрутки: страница листается целиком,
       а меню просто остаётся на экране.
       Колонка внутри разрезана надвое. Прокручивается только верх — марки и
       разделы; аккаунт с языком закреплён у нижнего края и в прокрутке не
       участвует. Раньше прокруткой заведовала сама колонка, и на низком окне
       низ уезжал вместе со всем остальным: чтобы дотянуться до профиля,
       приходилось сначала догадаться, что меню вообще листается. Выход из
       аккаунта и смена языка — не то, что ищут прокруткой. */
    <aside className="sticky top-0 z-20 flex h-screen w-[272px] shrink-0 flex-col overflow-hidden py-10">
      {/* min-h-0 обязателен: flex-элемент по умолчанию не сжимается меньше
          своего содержимого, и без него блок распирал бы колонку изнутри,
          вытесняя закреплённый низ за край экрана вместо того, чтобы отдать
          прокрутку себе. Поля колонки — здесь, а не на <aside>: иначе полоса
          прокрутки (там, где система её рисует) встала бы в 24px от края. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6">
        {/* Две марки, одна под другой: сверху продукт, снизу студия, чей это
            кабинет. Знак Velora — те же четыре окошка, что в меню CRM: клиент и
            владелец должны узнавать один продукт. */}
        <div className="flex min-w-0 shrink-0 items-center gap-2.5 px-3.5">
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
  
        <div className="mt-9 flex min-w-0 shrink-0 items-center gap-3 px-3.5">
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
  
        <nav className="mt-12 flex shrink-0 flex-col gap-1.5 pb-2">
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
      </div>

      {/* Клиент внизу колонки: на телефоне его инициал стоит в шапке главной,
          на десктопе шапка от неё скрыта — иначе имя дублируется дважды.
          В профиль карточка не ведёт: он и так стоит пунктом меню выше, а
          здесь у неё своя работа — аккаунты устройства (см. AccountMenu).
          Блок вынесен из прокручиваемой части и держится у нижнего края сам:
          `mt-auto` тут больше не нужен — над ним стоит flex-1, который и
          съедает всю свободную высоту. `shrink-0` — чтобы низкое окно сжимало
          не аккаунт, а область прокрутки над ним. Отступ сверху отделяет его
          от разделов, когда последний из них обрезан краем прокрутки. */}
      <div className="flex shrink-0 flex-col gap-2.5 px-6 pt-4">
        {isGuest && <LanguagePopover variant="card" />}
        <AccountMenu userName={userName} onAddAccount={onAddAccount} />
      </div>
    </aside>
  );
}
