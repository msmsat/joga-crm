import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Globe2, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const popup = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);
  const search = query.trim().toLocaleLowerCase();
  const matching = options.filter(o => !search || `${o.label} ${o.value}`.toLocaleLowerCase().includes(search));
  const filtered = !search && selected ? [selected, ...matching.filter(o => o.value !== value)] : matching;
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  const choose = (code: string) => { onChange(code); close(); };
  useLayoutEffect(() => {
    if (open && list.current) list.current.scrollTop = 0;
  }, [open, query]);
  useLayoutEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const panel = popup.current;
    const resize = () => {
      if (viewport && Math.abs(viewport.scale - 1) > .01) return;
      panel?.style.setProperty('--country-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      panel?.style.setProperty('--country-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    };
    resize();
    input.current?.focus({ preventScroll: true });
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      panel?.style.removeProperty('--country-viewport-height');
      panel?.style.removeProperty('--country-viewport-top');
      window.removeEventListener('resize', resize);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
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
      onClick={() => { setQuery(''); setActive(0); setOpen(!open); }}>
      <Globe2 size={16} /><span>{selected?.label ?? t('profile.fields.countryPlaceholder')}</span>
      {selected && <small>{selected.value}</small>}<ChevronDown size={15} data-open={open || undefined} />
    </button>
    {open && <>
      <button type="button" className={styles.backdrop} tabIndex={-1} aria-label={t('checkout.closeCountries')} onClick={close} />
      <div ref={popup} id={id} className={styles.popup} role="dialog" aria-label={t('profile.fields.country')}>
        <div className={styles.top}><span>{t('profile.fields.country')}</span>
          <button type="button" aria-label={t('checkout.closeCountries')} onClick={close}><X size={16} /></button></div>
        <div className={styles.search}><Search size={16} />
          <input ref={input} value={query} placeholder={t('profile.fields.countrySearch')}
            aria-label={t('profile.fields.countrySearch')} role="combobox" aria-autocomplete="list"
            aria-expanded="true" aria-controls={`${id}-list`}
            aria-activedescendant={filtered[active] ? `${id}-${filtered[active].value}` : undefined}
            onKeyDown={keyDown} onChange={e => { setQuery(e.target.value); setActive(0); }} />
        </div>
        <div ref={list} className={styles.list} role="listbox" id={`${id}-list`} aria-label={t('profile.fields.country')}>
          {filtered.map((country, index) => <button key={country.value} id={`${id}-${country.value}`}
            type="button" role="option" aria-selected={country.value === value} tabIndex={-1}
            data-active={index === active || undefined} data-option-index={index}
            onPointerMove={() => setActive(index)} onClick={() => choose(country.value)}>
            <span className={styles.code}>{country.value}</span><span>{country.label}</span>
            {country.value === value && <Check size={15} />}
          </button>)}
          {!filtered.length && <p className={styles.empty}>{t('profile.fields.countryNotFound')}</p>}
        </div>
      </div>
    </>}
  </div>;
}
