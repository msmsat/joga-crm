import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Globe2, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSheetDrag } from '../../../../../components/ui/modal/sheetDrag';
import { useCountrySheet } from '../../hooks/useCountrySheet';
import styles from './CheckoutCountry.module.css';

export default function CheckoutCountry({ value, options, onChange, disabled, invalid }: {
  value: string; options: { value: string; label: string }[];
  onChange: (value: string) => void; disabled: boolean; invalid: boolean;
}) {
  const { t } = useTranslation('billing');
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const backdrop = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);
  const search = query.trim().toLocaleLowerCase();
  const matching = options.filter(o => !search || `${o.label} ${o.value}`.toLocaleLowerCase().includes(search));
  // «ger» — это Germany, а не Algeria: код и начало названия выше вхождения в середину.
  // Первая строка — та, что выберет Enter («Готово» на клавиатуре телефона).
  const rank = (o: { value: string; label: string }) => {
    const label = o.label.toLocaleLowerCase();
    if (o.value.toLocaleLowerCase() === search) return 0;
    if (label.startsWith(search)) return 1;
    return label.split(/[\s(-]+/).some(word => word.startsWith(search)) ? 2 : 3;
  };
  const filtered = !search
    ? (selected ? [selected, ...matching.filter(o => o.value !== value)] : matching)
    : matching.map(o => ({ o, r: rank(o) })).sort((a, b) => a.r - b.r).map(({ o }) => o);
  const closed = useCallback(() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }, []);
  const { leaving, close } = useCountrySheet({ open, popup, backdrop, list, input, onClosed: closed });
  // Лист смахивается вниз за шапку; поле и строки списка жест не начинают.
  useSheetDrag(popup, close, open);
  const choose = (code: string) => { onChange(code); close(); };
  const clear = () => { setQuery(''); setActive(0); input.current?.focus({ preventScroll: true }); };
  useLayoutEffect(() => {
    if (open && list.current) list.current.scrollTop = 0;
  }, [open, query]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = Math.max(0, Math.min(filtered.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)));
      setActive(next);
      const option = list.current?.querySelector<HTMLElement>(`[data-option-index="${next}"]`);
      if (list.current && option) {
        const area = list.current.getBoundingClientRect();
        const item = option.getBoundingClientRect();
        if (item.top < area.top) list.current.scrollTop += item.top - area.top;
        else if (item.bottom > area.bottom) list.current.scrollTop += item.bottom - area.bottom;
      }
    } else if (event.key === 'Enter') {
      event.preventDefault(); if (filtered[active]) choose(filtered[active].value);
    } else if (event.key === 'Tab') setOpen(false);
  };
  return <div className={styles.root} ref={root}>
    <button ref={trigger} type="button" className={styles.trigger} disabled={disabled}
      aria-label={t('profile.fields.country')} aria-invalid={invalid || undefined}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { if (open) { close(); return; } setQuery(''); setActive(0); setOpen(true); }}>
      <Globe2 size={16} /><span>{selected?.label ?? t('profile.fields.countryPlaceholder')}</span>
      {selected && <small>{selected.value}</small>}<ChevronDown size={15} data-open={open || undefined} />
    </button>
    {open && <>
      <button ref={backdrop} type="button" className={styles.backdrop} data-leaving={leaving || undefined}
        tabIndex={-1} aria-label={t('checkout.closeCountries')} onClick={close} />
      <div ref={popup} id={id} className={styles.popup} data-leaving={leaving || undefined}
        role="dialog" aria-label={t('profile.fields.country')}>
        <span className={styles.grabber} aria-hidden="true" />
        <div className={styles.top}><span>{t('profile.fields.country')}</span>
          <button type="button" aria-label={t('checkout.closeCountries')} onClick={close}><X size={16} /></button></div>
        <div className={styles.search}><Search size={16} />
          <input ref={input} value={query} placeholder={t('profile.fields.countrySearch')}
            aria-label={t('profile.fields.countrySearch')} role="combobox" aria-autocomplete="list"
            aria-expanded="true" aria-controls={`${id}-list`}
            aria-activedescendant={filtered[active] ? `${id}-${filtered[active].value}` : undefined}
            autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="done"
            onKeyDown={keyDown} onChange={e => { setQuery(e.target.value); setActive(0); }} />
          {query && <button type="button" className={styles.clear} aria-label={t('checkout.clearCountrySearch')}
            onPointerDown={e => e.preventDefault()} onClick={clear}><X size={13} strokeWidth={2.4} /></button>}
        </div>
        <div ref={list} className={styles.list} role="listbox" id={`${id}-list`} aria-label={t('profile.fields.country')}>
          {filtered.map((country, index) => <button key={country.value} id={`${id}-${country.value}`}
            type="button" role="option" aria-selected={country.value === value} tabIndex={-1}
            data-active={index === active || undefined} data-option-index={index}
            onPointerMove={e => { if (e.pointerType === 'mouse') setActive(index); }}
            onClick={() => choose(country.value)}>
            <span className={styles.code}>{country.value}</span><span>{country.label}</span>
            {country.value === value && <Check size={15} />}
          </button>)}
          {!filtered.length && <p className={styles.empty}>{t('profile.fields.countryNotFound')}</p>}
        </div>
      </div>
    </>}
  </div>;
}
