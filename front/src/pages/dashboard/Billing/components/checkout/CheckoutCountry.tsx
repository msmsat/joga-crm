import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
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
  const selected = options.find(o => o.value === value);
  const search = query.trim().toLocaleLowerCase();
  const matching = options.filter(o => !search || `${o.label} ${o.value}`.toLocaleLowerCase().includes(search));
  const filtered = !search && selected ? [selected, ...matching.filter(o => o.value !== value)] : matching;
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const choose = (code: string) => { onChange(code); close(); };
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
      root.current?.querySelector(`[data-option-index="${next}"]`)?.scrollIntoView({ block: 'nearest' });
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
      <div id={id} className={styles.popup} role="dialog" aria-label={t('profile.fields.country')}>
        <div className={styles.top}><span>{t('profile.fields.country')}</span>
          <button type="button" aria-label={t('checkout.closeCountries')} onClick={close}><X size={16} /></button></div>
        <div className={styles.search}><Search size={16} />
          <input autoFocus value={query} placeholder={t('profile.fields.countrySearch')}
            aria-label={t('profile.fields.countrySearch')} role="combobox" aria-autocomplete="list"
            aria-expanded="true" aria-controls={`${id}-list`}
            aria-activedescendant={filtered[active] ? `${id}-${filtered[active].value}` : undefined}
            onKeyDown={keyDown} onChange={e => { setQuery(e.target.value); setActive(0); }} />
        </div>
        <div className={styles.list} role="listbox" id={`${id}-list`} aria-label={t('profile.fields.country')}>
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
