// Время «Времени студии» — как удобно: набрать руками («930», «9.30», «9:30»)
// или выбрать из списка. Стрелки ↑/↓ двигают время на шаг списка, Enter
// принимает набранное. Неразборчивое или отвергнутое окном время не
// принимается: поле возвращает прежнее и коротко вздрагивает.
//
// На телефоне — системный выбор времени (колесо iOS, циферблат Android): он
// даёт любую минуту, а экранная клавиатура над списком закрыла бы сам список.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { usePhone } from '../../../../../hooks/usePhone';
import { parseClock } from '../../studioTimeModel';

export interface ClockOption {
  time: string;
  /** Приглушённая приписка справа — длительность у списка конца. */
  hint?: string;
  /** Время уже следующего дня (конец за полночью). */
  nextDay?: boolean;
}

interface Placement { left: number; width: number; top?: number; bottom?: number; maxH: number }

const GAP = 6;
const PAD = 12;

export function ClockField({ label, value, options, icon, onCommit }: {
  label: string;
  value: string;
  options: ClockOption[];
  icon: ReactNode;
  /** false — окно время не приняло (конец совпал с началом и т.п.). */
  onCommit: (time: string) => boolean;
}) {
  const isPhone = usePhone();
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (synced !== value) { setSynced(value); setDraft(value); }
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Placement | null>(null);
  const [shake, setShake] = useState(0);
  const boxRef = useRef<HTMLLabelElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const active = options.findIndex(option => option.time === value);

  const reject = () => { setDraft(value); setShake(n => n + 1); };
  const commit = (raw: string) => {
    setOpen(false);
    if (raw.trim() === value) { setDraft(value); return; }
    const time = parseClock(raw);
    if (!time || !onCommit(time)) reject();
    else setDraft(time);
  };
  const pick = (time: string) => {
    if (!onCommit(time)) reject();
    setOpen(false);
  };

  // Список — порталом на <body>: тело окна прокручивается и обрезало бы его.
  // Сторона и высота — по свободному месту, как у списка кита (Select).
  useLayoutEffect(() => {
    if (!open) return;
    const recalc = (e?: Event) => {
      if (e && listRef.current?.contains(e.target as Node)) return;
      const r = boxRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom - GAP - PAD;
      const above = r.top - GAP - PAD;
      const up = below < Math.min(240, above);
      const next: Placement = {
        left: r.left, width: Math.max(r.width, 156), maxH: Math.max(140, Math.min(240, up ? above : below)),
        ...(up ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
      };
      setPlace(prev => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    recalc();
    window.addEventListener('scroll', recalc, { passive: true, capture: true });
    window.addEventListener('resize', recalc, { passive: true });
    return () => {
      window.removeEventListener('scroll', recalc, true);
      window.removeEventListener('resize', recalc);
    };
  }, [open]);

  // Открылся список — выбранное время посередине, а не где-то за краем.
  useLayoutEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('.is-on');
    if (list && el) list.scrollTop = el.offsetTop - (list.clientHeight - el.offsetHeight) / 2;
  }, [place, value]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!boxRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const field = `st-clock${shake % 2 ? ' is-shake-a' : shake ? ' is-shake-b' : ''}`;

  if (isPhone) {
    return (
      <label className={`${field} is-native`}>
        {icon}
        <input type="time" aria-label={label} value={value} step={300}
               onChange={e => { const time = parseClock(e.target.value); if (time && time !== value && !onCommit(time)) reject(); }} />
      </label>
    );
  }

  return (
    <label ref={boxRef} className={`${field}${open ? ' is-open' : ''}`}>
      {icon}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        aria-label={label}
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
        value={draft}
        onFocus={e => { e.target.select(); setOpen(true); }}
        onChange={e => { setDraft(e.target.value); setOpen(true); }}
        onBlur={() => { if (draft !== value) commit(draft); }}
        onKeyDown={e => {
          if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setDraft(value); setOpen(false); return; }
          if (e.key === 'Enter' && (open || draft !== value)) { e.preventDefault(); commit(draft); return; }
          const shift = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
          if (!shift || !options.length) return;
          e.preventDefault();
          const from = active >= 0 ? active : options.findIndex(option => option.time > value) - (shift > 0 ? 1 : 0);
          const next = options[Math.min(options.length - 1, Math.max(0, from + shift))];
          if (next) pick(next.time);
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.select());
        }}
      />
      <button type="button" className="st-clock-caret" tabIndex={-1} aria-hidden
              onMouseDown={e => { e.preventDefault(); if (open) setOpen(false); else inputRef.current?.focus(); }}>
        <ChevronDown size={15} strokeWidth={2} />
      </button>
      {open && place && createPortal(
        <div ref={listRef} className="v-select-panel st-clock-panel ms-scroll" role="listbox" aria-label={label}
             style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxH }}
             onMouseDown={e => e.preventDefault()}>
          {options.map(option => (
            <button key={option.time + (option.hint ?? '')} type="button" role="option" tabIndex={-1}
                    aria-selected={option.time === value}
                    className={`st-clock-opt${option.time === value ? ' is-on' : ''}`}
                    onClick={() => pick(option.time)}>
              <strong>{option.time}{option.nextDay && <sup>+1</sup>}</strong>
              {option.hint && <span>{option.hint}</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </label>
  );
}
