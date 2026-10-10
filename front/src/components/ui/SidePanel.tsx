import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useDrawerSwipe } from './drawerSwipe';
import { useDrawerMotion } from './drawerMotion';
import { cascade } from './cascade';

// ─── ПАНЕЛЬ СПРАВА ──────────────────────────────────────────────────────────
// Та же панель, что «Ещё» на телефоне (MobileMore), но для работы, а не для
// навигации, и на любом экране: парящий лист из материала дока (токены
// --nv-*), выезжает справа пружиной, содержимое въезжает каскадом, под ним
// тёплое затемнение. Закрывается крестиком, тапом мимо, Esc и смахиванием
// вправо (drawerSwipe.ts — тот же жест, что у «Ещё»).
//
// В отличие от «Ещё» панель НЕ смонтирована заранее: её содержимое — форма,
// и держать его живым между открытиями незачем. Вход и уход — те же Web
// Animations (drawerMotion.ts), поэтому и закрытие доигрывает до конца, а
// содержимое снимается только после него (`onClosed`).
//
// Состав — три части сетки: SidePanelHead, SidePanelBody, SidePanelFoot.
// Что ещё должно въехать каскадом, помечается классом `spanel-cascade` с
// порядковым номером в `--i` (помощник `cascade(i)`).

type Phase = 'closed' | 'open' | 'leaving';

export interface SidePanelProps {
  /** true — панель показана; false — уезжает и затем снимается. */
  open: boolean;
  /** Просьба закрыть: крестик, затемнение, Esc, свайп. */
  onClose: () => void;
  /** Анимация ухода доиграла — можно снимать содержимое. */
  onClosed?: () => void;
  /** Ширина на большом экране, px. На телефоне панель во всю ширину. */
  width?: number;
  ariaLabel: string;
  children: ReactNode;
}

// Esc закрывает верхний слой, а не всё сразу: открытое поверх панели окно кита
// или список Select — их собственный Esc.
const ABOVE = '.v-overlay, .v-select-panel';

export function SidePanel({ open, onClose, onClosed, width = 440, ariaLabel, children }: SidePanelProps) {
  const [phase, setPhase] = useState<Phase>(open ? 'open' : 'closed');
  const [seen, setSeen] = useState(open);
  if (seen !== open) {
    setSeen(open);
    setPhase(open ? 'open' : phase === 'closed' ? 'closed' : 'leaving');
  }

  const layerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const swipe = useDrawerSwipe(onClose, '.spanel-scrim');

  // Открытие — с чистого листа: без следов прошлого свайпа; фокус — в панель
  // (Tab идёт по её полям), на закрытии — обратно туда, откуда открыли.
  // Объявлен раньше useDrawerMotion — следы стёрты до старта анимаций.
  useLayoutEffect(() => {
    if (phase !== 'open') return;
    const scrim = layerRef.current?.querySelector<HTMLElement>(':scope > .spanel-scrim');
    const panel = panelRef.current;
    if (scrim) {
      scrim.style.removeProperty('--swipe');
      delete scrim.dataset.dragging;
    }
    if (panel) {
      panel.style.removeProperty('--swipe-x');
      panel.style.transition = '';
      panel.style.transform = '';
      returnFocus.current ??= document.activeElement as HTMLElement | null;
      panel.focus({ preventScroll: true });
    }
  }, [phase]);

  useDrawerMotion(layerRef, panelRef, phase, () => {
    setPhase('closed');
    returnFocus.current?.focus?.({ preventScroll: true });
    returnFocus.current = null;
    onClosed?.();
  }, { scrim: '.spanel-scrim', cascade: '.spanel-cascade' });

  useEffect(() => {
    if (phase !== 'open') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector(ABOVE)) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [phase, onClose]);

  if (phase === 'closed') return null;

  return createPortal(
    // Затемнение и панель — соседи, а не родитель и ребёнок: затемнение гаснет
    // вслед за пальцем при свайпе, и панель гаснуть вместе с ним не должна.
    <div ref={layerRef} className={`spanel-layer is-${phase}`}>
      <div className="spanel-scrim" onClick={onClose} />
      <aside
        {...swipe}
        onClickCapture={e => {
          // Уходящая панель ещё под пальцем, но тап по ней уже ничего не делает.
          if (phase !== 'open') { e.preventDefault(); e.stopPropagation(); return; }
          swipe.onClickCapture(e);
        }}
        ref={panelRef}
        tabIndex={-1}
        className="spanel"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        style={{ '--spanel-w': `${width}px` } as CSSProperties}
      >
        {children}
      </aside>
    </div>,
    document.body,
  );
}

export interface SidePanelHeadProps {
  /** Плитка с иконкой слева; вместо неё может стоять `leading` (кнопка «назад»). */
  icon?: ReactNode;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Справа от заголовка, перед крестиком. */
  aside?: ReactNode;
  onClose: () => void;
}

export function SidePanelHead({ icon, leading, title, subtitle, aside, onClose }: SidePanelHeadProps) {
  const { t } = useTranslation('common');
  return (
    <header className="spanel-head spanel-cascade" style={cascade(0)}>
      {leading ?? (icon && <span className="spanel-glyph">{icon}</span>)}
      <div className="spanel-titles">
        <div className="spanel-title">{title}</div>
        {subtitle && <div className="spanel-sub">{subtitle}</div>}
      </div>
      {aside}
      <button type="button" className="spanel-close" onClick={onClose} aria-label={t('buttons.close')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </header>
  );
}

export function SidePanelBody({ children, bodyRef }: { children: ReactNode; bodyRef?: RefObject<HTMLDivElement | null> }) {
  return <div ref={bodyRef} className="spanel-body">{children}</div>;
}

export function SidePanelFoot({ children }: { children: ReactNode }) {
  return <footer className="spanel-foot spanel-cascade" style={cascade(2)}>{children}</footer>;
}
