import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePopoverPosition } from './popoverPosition';

export interface PillSelectOption<T extends string | number> {
  value: T;
  /** Крупно на плитке: «15». */
  label: string;
  /** Мелко под ним и после значения на кнопке: «мин». */
  hint?: string;
}

export interface PillSelectProps<T extends string | number> {
  /** Подпись на кнопке («Шаг») — она же заголовок панели, если нет title. */
  label: string;
  title?: string;
  value: T;
  options: PillSelectOption<T>[];
  onChange: (value: T) => void;
  icon?: ReactNode;
  disabled?: boolean;
}

/**
 * Компактный выбор из нескольких коротких значений (шаг сетки: 1, 2, 5, 15 мин):
 * капсула «иконка · подпись · значение», по нажатию — поповер с плитками в ряд,
 * выбранная плитка персиковая, подсветка переезжает между плитками.
 * Там, где Select — поле формы, эта — настройка рядом с полем, и выглядеть
 * полем ей не нужно. Список в портале: окно вокруг режет overflow.
 */
export function PillSelect<T extends string | number>({
  label, title, value, options, onChange, icon, disabled,
}: PillSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const highlightId = useId();
  const close = () => setOpen(false);
  const placement = usePopoverPosition(open, anchorRef, panelRef, 'bottom', close);
  const selected = options.find(o => o.value === value);

  // Клик мимо и Esc закрывают только поповер. Esc ловится на захвате: окно
  // вокруг (мастер записи, модалки кита) слушает его на window и закрылось бы
  // целиком вместе со всем выбранным.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setOpen(false);
      anchorRef.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // Фокус — на выбранную плитку, когда панель встала на место.
  useEffect(() => {
    if (open && placement) panelRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [open, placement]);

  // Панель закрывается не сразу: сначала подсветка доезжает до новой плитки —
  // иначе выбор не видно, окно просто пропадает.
  const closeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  const choose = (v: T) => {
    onChange(v);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      anchorRef.current?.focus();
    }, v === value || reduce ? 0 : 220);
  };
  const onTileKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const tiles = panelRef.current?.querySelectorAll<HTMLElement>('.vk-pill-tile');
    tiles?.[(i + d + options.length) % options.length]?.focus();
  };

  const origin = placement ? `${placement.arrowOffset}px ${placement.side === 'top' ? '100%' : '0'}` : '50% 0';

  return (
    <>
      <button ref={anchorRef} type="button" className={`vk-pill${open ? ' is-open' : ''}`} disabled={disabled}
              aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {icon && <span className="vk-pill-icon">{icon}</span>}
        <span className="vk-pill-label">{label}</span>
        <span className="vk-pill-value">
          {/* key — значение сменилось, и новое мягко въезжает снизу */}
          <span key={String(value)} className="vk-pill-value-in">
            {selected ? [selected.label, selected.hint].filter(Boolean).join(' ') : ''}
          </span>
        </span>
        <svg className="vk-pill-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-label={title ?? label}
              className="vk-pill-panel"
              style={{
                top: placement?.top ?? 0, left: placement?.left ?? 0,
                visibility: placement ? 'visible' : 'hidden', transformOrigin: origin,
              }}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: placement?.side === 'top' ? 6 : -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }}
            >
              <div className="vk-pill-title">{title ?? label}</div>
              <div className="vk-pill-tiles" role="radiogroup" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
                {options.map((o, i) => {
                  const on = o.value === value;
                  return (
                    <motion.button
                      key={String(o.value)}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      tabIndex={on ? 0 : -1}
                      className={`vk-pill-tile${on ? ' is-on' : ''}`}
                      onClick={() => choose(o.value)}
                      onKeyDown={e => onTileKey(e, i)}
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: reduce ? 0 : 0.03 + i * 0.035, duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      whileTap={reduce ? undefined : { scale: 0.94 }}
                    >
                      {on && (
                        <motion.span layoutId={highlightId} className="vk-pill-tile-bg"
                                     transition={{ type: 'spring', stiffness: 500, damping: 36 }} />
                      )}
                      <span className="vk-pill-tile-num">{o.label}</span>
                      {o.hint && <span className="vk-pill-tile-hint">{o.hint}</span>}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
