import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Поле поиска над списком. Для длинных перечней (страны — 250 строк), где
   *  прокрутка перестаёт быть способом что-то найти. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Что показать, когда под запрос ничего не подошло. Без него — пустая панель. */
  emptyText?: string;
}

interface TriggerRect { top: number; left: number; width: number; up: boolean; offset: number; maxH: number; }

const GAP = 6;   // просвет между триггером и панелью
const PAD = 8;   // не прижимать панель вплотную к краю экрана

// Общий выпадающий список: минимализм, glow-фокус, клавиатура (стрелки + Enter),
// закрытие по Esc и клику мимо. Мультивыбора нет (YAGNI), поиск — по флагу
// `searchable`: он появился ради списка стран, где 250 строк листать бессмысленно.
// Список рендерится в портал с position: fixed — иначе его обрезает overflow:hidden
// родителя (карточка, модалка), как у Tooltip/InfoHint.
export function Select({
  value, options, onChange, placeholder, disabled,
  searchable, searchPlaceholder, emptyText,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [query, setQuery] = useState('');
  const [trigger, setTrigger] = useState<TriggerRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const listBoxRef = useRef<HTMLDivElement>(null);
  // Куда поставить прокрутку списка: 'center' — при открытии (выбранное значение
  // сразу на виду), 'nearest' — при ходьбе стрелками. null — не трогать (мышь).
  const scrollTo = useRef<'center' | 'nearest' | null>('center');

  const selected = options.find(o => o.value === value) ?? null;

  // Отфильтрованный список — единственный, по которому идут и стрелки, и Enter,
  // и отрисовка: разойдись они, Enter выбирал бы не ту строку, что подсвечена.
  // Поиск по подстроке в любом месте названия, регистр не важен: «корея» должна
  // находить и «Северную», и «Южную».
  const visible = searchable && query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  // Клик мимо — закрыть (список теперь в портале вне ref, проверяем и его).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Позиция триггера в viewport — список больше не в потоке родителя, поэтому
  // пересчитываем при открытии и на scroll/resize (capture — ловит скролл вложенных карточек).
  // Сторона выбирается сама: под нижними полями страницы (часовой пояс, валюта,
  // язык в Настройках) места вниз не остаётся, и список уезжал за край экрана.
  // Высота тоже режется по свободному месту — панель не должна вылезать за экран.
  useLayoutEffect(() => {
    if (!open) return;
    const recalc = (e?: Event) => {
      // Скролл внутри самой панели её не двигает: пересчёт на каждый тик колеса
      // перерисовывал весь список (до 250 строк) и был тем самым лагом.
      if (e && listRef.current?.contains(e.target as Node)) return;
      if (!buttonRef.current) return;
      const r = buttonRef.current.getBoundingClientRect();
      const wanted = searchable ? 296 : 240;
      const below = window.innerHeight - r.bottom - GAP - PAD;
      const above = r.top - GAP - PAD;
      const up = below < Math.min(wanted, above);
      const next: TriggerRect = {
        top: r.top, left: r.left, width: r.width, up,
        offset: up ? window.innerHeight - r.top + GAP : r.bottom + GAP,
        maxH: Math.max(140, Math.min(wanted, up ? above : below)),
      };
      // Ничего не сдвинулось — не создавать новый объект: иначе каждый событие
      // скролла даёт лишний рендер портала.
      setTrigger(prev => prev && prev.top === next.top && prev.left === next.left
        && prev.width === next.width && prev.offset === next.offset && prev.maxH === next.maxH
        ? prev : next);
    };
    recalc();
    window.addEventListener('scroll', recalc, { passive: true, capture: true });
    window.addEventListener('resize', recalc, { passive: true });
    return () => {
      window.removeEventListener('scroll', recalc, true);
      window.removeEventListener('resize', recalc);
    };
  }, [open, searchable]);

  // При открытии подсветить текущий выбор. Правка состояния прямо в рендере —
  // документированный способ синхронизации с пропсами: React отбрасывает
  // незакоммиченный кадр и рисует сразу с нужной подсветкой, без лишнего эффекта.
  const [prevSync, setPrevSync] = useState({ open, value, query });
  if (prevSync.open !== open || prevSync.value !== value || prevSync.query !== query) {
    setPrevSync({ open, value, query });
    // Запрос сменился — подсветка встаёт на первую подходящую строку: прежний
    // индекс указывал в другой список и после фильтрации попадал мимо.
    if (prevSync.query !== query) setHighlight(0);
    else if (open) setHighlight(Math.max(0, visible.findIndex(o => o.value === value)));
    // Закрыли — забываем запрос, чтобы следующее открытие начиналось с полного
    // списка, а не с хвоста прошлого поиска.
    if (!open && query) setQuery('');
  }

  // Фокус в поле поиска сразу при открытии: иначе до него надо доехать мышью, и
  // весь смысл поиска теряется — быстрее было бы листать.
  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  // Прокрутку ставим сами, через scrollTop контейнера. scrollIntoView здесь не
  // годится: он листает ВСЕ прокручиваемые предки, и вместо списка уезжала вниз
  // сама страница. Через layout-эффект — до кадра, чтобы список появлялся уже на
  // нужном месте, а не дёргался после отрисовки. От мыши прокрутка не двигается.
  useLayoutEffect(() => {
    const mode = scrollTo.current;
    const el = highlightRef.current;
    const box = listBoxRef.current;
    if (!open || !mode || !el || !box) return;   // портала ещё нет — режим не тратим
    scrollTo.current = null;
    const top = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
    if (mode === 'center') box.scrollTop = top;
    else if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight;
    }
    // trigger в зависимостях: при самом первом открытии позиция ещё не посчитана,
    // портала в кадре нет — эффект должен повториться, когда он появится.
  }, [open, highlight, trigger]);

  const choose = (v: string) => { onChange(v); setOpen(false); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Escape') { setOpen(false); return; }
    // Пробел открывает список, только пока фокус на кнопке: в поле поиска он —
    // обычный символ, и «Южная Корея» иначе было бы не набрать.
    if (!open && (e.key === 'Enter' || e.key === 'ArrowDown' || (e.key === ' ' && !searchable))) {
      e.preventDefault(); scrollTo.current = 'center'; setOpen(true); return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); scrollTo.current = 'nearest'; setHighlight(h => Math.min(h + 1, visible.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); scrollTo.current = 'nearest'; setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const opt = visible[highlight]; if (opt) choose(opt.value); }
  };

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => { if (disabled) return; scrollTo.current = 'center'; setOpen(o => !o); }}
        onKeyDown={onKeyDown}
        style={{
          width: '100%', padding: '12px 15px', textAlign: 'left',
          background: open ? 'var(--bg-card, #FFFFFF)' : 'rgba(var(--ink),0.025)',
          border: `1.5px solid ${open ? 'var(--peach-light, #FCAE91)' : 'rgba(var(--ink),0.09)'}`,
          boxShadow: open ? '0 0 0 3px rgba(252,174,145,0.15)' : 'none',
          borderRadius: '12px', fontSize: '14px', fontWeight: 500,
          color: selected ? 'var(--text, #1A1A1A)' : '#AAAAAA',
          outline: 'none', fontFamily: 'Manrope, sans-serif', boxSizing: 'border-box',
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
          transition: 'border-color 0.18s, box-shadow 0.18s',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : (placeholder ?? '')}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#AAAAAA" strokeWidth="2.4"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && trigger && createPortal(
        <div
          ref={listRef}
          style={{
            position: 'fixed',
            ...(trigger.up ? { bottom: `${trigger.offset}px` } : { top: `${trigger.offset}px` }),
            left: `${trigger.left}px`, width: `${trigger.width}px`, zIndex: 1200,
            background: 'var(--bg-card, #FFFFFF)', borderRadius: '12px',
            border: '1px solid rgba(var(--ink),0.08)',
            boxShadow: '0 12px 32px -8px rgba(26,26,26,0.18), 0 4px 12px -4px rgba(26,26,26,0.08)',
            // Колонка, а не один скролл-контейнер: поле поиска обязано стоять на
            // месте, пока список под ним листается. Потолок (240px, с поиском —
            // 296px) режется по свободному месту в recalc.
            maxHeight: `${trigger.maxH}px`,
            display: 'flex', flexDirection: 'column',
            boxSizing: 'border-box', animation: 'sel-in 0.16s ease',
          }}
        >
          <style>{`@keyframes sel-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>

          {searchable && (
            <div style={{ padding: '8px 8px 4px', flexShrink: 0 }}>
              <input
                ref={searchRef}
                value={query}
                onChange={e => { scrollTo.current = 'center'; setQuery(e.target.value); }}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                style={{
                  width: '100%', padding: '9px 12px', boxSizing: 'border-box',
                  background: 'rgba(var(--ink),0.035)', border: '1.5px solid transparent',
                  borderRadius: '9px', outline: 'none',
                  fontSize: '13.5px', fontWeight: 500, fontFamily: 'Manrope, sans-serif',
                  color: 'var(--text, #1A1A1A)',
                }}
              />
            </div>
          )}

          <div
            ref={listBoxRef}
            role="listbox"
            style={{
              // position: relative — чтобы offsetTop строк считался от контейнера;
              // overscrollBehavior: contain — колесо над списком не прокручивает
              // страницу под ним (иначе панель ехала вслед за триггером).
              padding: '6px', overflowY: 'auto', minHeight: 0,
              position: 'relative', overscrollBehavior: 'contain',
            }}
          >
          {emptyText && visible.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: '13.5px', color: 'var(--text3, #AAA)', fontFamily: 'Manrope, sans-serif' }}>
              {emptyText}
            </div>
          )}
          {visible.map((o, i) => {
            const active = o.value === value;
            const hl = i === highlight;
            return (
              <div
                key={o.value}
                ref={hl ? highlightRef : undefined}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(o.value)}
                style={{
                  padding: '10px 12px', borderRadius: '9px', cursor: 'pointer',
                  fontSize: '14px', fontWeight: active ? 700 : 500,
                  color: active ? 'var(--peach, #F9A08B)' : 'var(--text, #1A1A1A)',
                  background: hl ? 'rgba(252,174,145,0.1)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontFamily: 'Manrope, sans-serif',
                }}
              >
                {o.label}
                {active && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            );
          })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
