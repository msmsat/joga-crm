import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NAV, NAV_BOTTOM, JOURNAL_ENTRY, type NavEntry } from './navItems';
import { UserMenu } from './UserMenu';

// ─── НИЖНЯЯ ПАНЕЛЬ (телефон, <768px) ─────────────────────────────────────────
// Колонка меню на экране в 375px съедает половину ширины, поэтому на телефоне
// навигация переезжает под большой палец. В панели — четыре раздела, которыми
// пользуются каждый день и которые видит любая роль, плюс «Ещё» со всем
// остальным. Разметка рендерится всегда, показывает её только медиазапрос
// (см. блок «ТЕЛЕФОН» в App.css) — так не нужен ни matchMedia, ни ресайз-хук.
// Порядок задан списком ключей, а не порядком NAV: в боковом меню Журнал —
// закреплённая внизу кнопка, здесь он второй вкладкой. filter вместо
// NAV.find(...)! — переименование ключа должно стоить одной пропавшей вкладки,
// а не undefined.to и белого экрана на всём телефоне.
//
// Velora AI вкладкой не занимает слот: ассистент открывается кнопкой AI в
// верхней панели с ЛЮБОЙ страницы, то есть до него и так один тап, а слотов
// внизу всего четыре. На освободившееся место — Настройки.
// Ключи здесь не проходят проверку роли (TABS рендерится без visible()),
// поэтому вкладкой может быть только раздел, доступный всем ролям: из
// оставшихся это Настройки — у тренера и администратора там свои личные
// вкладки. Любой owner-раздел на этом месте просто пропал бы у половины
// пользователей, оставив панель с тремя кнопками.
const TAB_KEYS = ['dashboard', 'journal', 'clients', 'settings'];
const BY_KEY = new Map([...NAV, ...NAV_BOTTOM, JOURNAL_ENTRY].map(item => [item.key, item]));
const TABS: NavEntry[] = TAB_KEYS.map(k => BY_KEY.get(k)).filter((i): i is NavEntry => !!i);
const TAB_KEY_SET = new Set(TAB_KEYS);

// ─── ПАНЕЛЬ «ЕЩЁ» ────────────────────────────────────────────────────────────
// Девять одинаковых плиток — девять одинаково важных действий: глазу не за что
// зацепиться, и меню приходится прочитывать целиком. Ищем среди ТРЁХ смысловых
// групп, а не среди девяти объектов; с ростом числа разделов сетка ломается, а
// группы — нет. Внутри первой — крупные плитки (в них ходят каждый день), в
// остальных компактные строки с пояснением из menu:subtitles.<key> — тех же
// слов, что и подзаголовок самого раздела. Пояснение заодно отвечает на «чем
// „искра“ в шапке отличается от Velora AI в меню»: там чат ассистента, здесь
// раздел с агентами и автоответами.
const GROUPS: { title: string; keys: string[]; tiles?: boolean }[] = [
  { title: 'more.business', keys: ['staff', 'catalog', 'finances', 'reports'], tiles: true },
  { title: 'more.comms', keys: ['loyalty', 'booking', 'notifications'] },
  { title: 'brand.product', keys: ['ai', 'billing'] },
];

const MoreIcon = (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);

export interface MobileNavProps {
  role: string | null;
  clientsCount: number | null;
}

export function MobileNav({ role, clientsCount }: MobileNavProps) {
  const { t } = useTranslation('menu');
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Свайп вправо закрывает панель — она оттуда и выехала. Вертикальный скролл
  // списка при этом жив: touch-action: pan-y отдаёт браузеру вертикаль, а
  // горизонталь оставляет нам (см. .mdrawer в App.css).
  const startX = useRef<number | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    // Панель идёт ровно за пальцем: собственный transition (.mdrawer) на время
    // жеста снимаем, иначе она догоняет его четверть секунды.
    if (panelRef.current) panelRef.current.style.transition = 'none';
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null || !panelRef.current) return;
    const dx = Math.max(0, e.touches[0].clientX - startX.current);
    panelRef.current.style.transform = `translateX(${dx}px)`;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null || !panelRef.current) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    panelRef.current.style.transition = '';
    panelRef.current.style.transform = '';
    startX.current = null;
    if (dx > 70) close();
  };

  const visible = (item: NavEntry) => !item.owner || role === 'owner';
  // «Ещё» — всё, чего нет в нижней панели: разделы владельца, тариф, ассистент.
  const rest = [...NAV, ...NAV_BOTTOM].filter(item => visible(item) && !TAB_KEY_SET.has(item.key));
  const byKey = new Map(rest.map(item => [item.key, item]));
  const listed = new Set(GROUPS.flatMap(g => g.keys));
  // Раздел, который завели в navItems и забыли расписать по группам, падает в
  // последнюю: строка не в той группе видна глазами, пропавший раздел — нет.
  // Группа без единого доступного роли раздела не рисуется вовсе — у тренера и
  // администратора от «Бизнеса» не остаётся ничего.
  const groups = GROUPS.map((g, i) => ({
    title: g.title,
    tiles: g.tiles,
    items: [
      ...g.keys.map(k => byKey.get(k)).filter((x): x is NavEntry => !!x),
      ...(i === GROUPS.length - 1 ? rest.filter(x => !listed.has(x.key)) : []),
    ],
  })).filter(g => g.items.length > 0);

  const badgeFor = (item: NavEntry) => {
    if (item.badge === 'clients' && clientsCount !== null) return String(clientsCount);
    if (item.badge === 'beta') return t('badge.beta');
    return null;
  };

  const tile = (item: NavEntry) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) => `mdrawer-tile${isActive ? ' active' : ''}`}
    >
      {item.icon}
      <span>{t(`nav.${item.key}`)}</span>
    </NavLink>
  );

  const row = (item: NavEntry) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) => `mdrawer-row${isActive ? ' active' : ''}`}
    >
      {item.icon}
      <span className="mdrawer-row-text">
        <span className="mdrawer-row-label">{t(`nav.${item.key}`)}</span>
        <span className="mdrawer-row-sub">{t(`subtitles.${item.key}`)}</span>
      </span>
    </NavLink>
  );

  return (
    <>
      <nav className="mnav" aria-label={t('nav.dashboard')}>
        {TABS.map(item => {
          const badge = badgeFor(item);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={close}
              className={({ isActive }) => `mnav-item${isActive ? ' active' : ''}`}
            >
              <span className="mnav-icon">
                {item.icon}
                {badge && <span className="mnav-badge">{badge}</span>}
              </span>
              <span className="mnav-label">{t(`nav.${item.key}`)}</span>
            </NavLink>
          );
        })}

        {/* Панель выезжает НЕ поверх нижней панели, поэтому «Ещё» остаётся под
            тем же пальцем: второй тап по той же кнопке закрывает. */}
        <button
          type="button"
          className={`mnav-item${open ? ' active' : ''}`}
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
        >
          <span className="mnav-icon">{MoreIcon}</span>
          <span className="mnav-label">{t('nav.more')}</span>
        </button>
      </nav>

      {open && (
        // Затемнение кончается над нижней панелью: полоса слева от панели —
        // тоже «закрыть», а сама навигация остаётся видимой и живой.
        <div className="mdrawer-scrim" onClick={close}>
          <aside
            ref={panelRef}
            className="mdrawer"
            role="dialog"
            aria-label={t('more.title')}
            onClick={e => e.stopPropagation()}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <div className="mdrawer-head">
              <span className="mdrawer-title">{t('more.title')}</span>
              <button type="button" className="mdrawer-close" onClick={close} aria-label={t('common:buttons.close')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="mdrawer-body">
              {/* Закрываем на всплытии клика, а не эффектом по смене пути: тап
                  по разделу должен убирать панель и когда путь тот же (человек
                  вернулся в раздел, из которого открыл «Ещё»). */}
              <div onClick={close}>
                {groups.map(g => (
                  <section key={g.title} className="mdrawer-group">
                    <h3 className="mdrawer-gtitle">{t(g.title)}</h3>
                    <div className={g.tiles ? 'mdrawer-tiles' : 'mdrawer-rows'}>
                      {g.items.map(g.tiles ? tile : row)}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            {/* Аккаунт закреплён у нижнего края и в прокрутку списка не уходит:
                профиль, смена студии и выход должны быть на одном месте, каким
                бы длинным ни стал список разделов. Кнопка остаётся внизу, меню
                раскрывается ВВЕРХ поверх разделов (.user-menu-panel и так
                absolute + bottom: 100% — блок вынесен из .mdrawer-body, чтобы
                его не срезал скролл).
                Панель закрывается вместе с меню аккаунтов: тап по «Профилю»
                уводит на страницу, а панель без этого оставалась бы висеть
                поверх неё (клик по группам сюда не доходит — соседний блок). */}
            <div className="mdrawer-account">
              <UserMenu onNavigate={close} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
