export type NavItem = {
  id: string;
  labelKey: string;
  /** Содержимое <svg viewBox="0 0 24 24"> — линейное, без заливки */
  icon: React.ReactNode;
};

/**
 * Разделы кабинета. Один список на два меню: нижнюю капсулу телефона
 * (BottomNav) и боковое меню десктопа (DesktopNav) — расходиться им нельзя,
 * это буквально одна и та же навигация в двух раскладках.
 *
 * Список полный; какие пункты показать, решает App — «Клуб» появляется
 * только у студий с включённой программой лояльности (см. `visibleNavItems`).
 */
export const NAV_ITEMS: NavItem[] = [
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
    icon: (
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    ),
  },
  {
    id: 'club',
    labelKey: 'nav.club',
    icon: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="3" />
        <path d="M2 10h20" />
        <circle cx="17" cy="14.5" r="1.6" />
      </>
    ),
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

/**
 * Пункты для текущей студии. «Клуб» скрыт, пока владелец не включил программу
 * лояльности: вкладка, за которой всегда пусто, — худший вид пустого состояния.
 */
export const visibleNavItems = (hasLoyalty: boolean): NavItem[] =>
  hasLoyalty ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.id !== 'club');
