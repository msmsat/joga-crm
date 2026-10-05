import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { DropdownMenu } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { fitFilters } from '../utils/fitFilters';
import styles from './AdaptiveFilters.module.css';

export interface FilterItem { key: string; label: string; icon: ReactNode; count?: number }

/** Radix supplies keyboard navigation, focus return, Escape and outside-click. */
export function AdaptiveFilters({ items, active, onChange, label }: {
  items: FilterItem[]; active: string; onChange: (key: string) => void; label: string;
}) {
  const { t } = useTranslation('clients');
  const root = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ compact: true, visible: [] as number[], moreLabel: false });
  useLayoutEffect(() => {
    const el = root.current, measurements = measure.current;
    if (!el || !measurements) return;
    let stopped = false;
    const fit = () => {
      if (stopped) return;
      const full = Array.from(measurements.querySelectorAll<HTMLElement>('[data-full]')).map(n => n.getBoundingClientRect().width);
      const compact = Array.from(measurements.querySelectorAll<HTMLElement>('[data-compact]')).map(n => n.getBoundingClientRect().width);
      const moreWidth = measurements.querySelector<HTMLElement>('[data-more]')?.getBoundingClientRect().width ?? 44;
      const moreLabel = el.clientWidth >= moreWidth;
      const next = { ...fitFilters(el.clientWidth, full, compact, moreLabel ? moreWidth : 44, items.findIndex(i => i.key === active)), moreLabel };
      setLayout(prev => prev.compact === next.compact && prev.moreLabel === next.moreLabel && prev.visible.join() === next.visible.join() ? prev : next);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el); observer.observe(measurements);
    document.fonts.ready.then(fit);
    return () => { stopped = true; observer.disconnect(); };
  }, [items, active, t]);
  const hidden = items.filter((_, i) => !layout.visible.includes(i));
  const content = (item: FilterItem, compact: boolean) => <>
    <span className={styles.icon} aria-hidden="true">{item.icon}</span>
    {!compact && <span>{item.label}</span>}
    {item.count !== undefined && <span className={styles.count}>{item.count}</span>}
  </>;
  return <div ref={root} className={styles.row} role="group" aria-label={label}>
    <div ref={measure} className={styles.measure} aria-hidden="true">
      {items.map(item => <span key={item.key} className={styles.pill} data-full>{content(item, false)}</span>)}
      {items.map(item => <span key={item.key} className={styles.pill} data-compact>{content(item, true)}</span>)}
      <span className={`${styles.more} ${styles.moreLabel}`} data-more>{t('toolbar.moreFilters')}<ChevronDown size={12}/></span>
    </div>
    {items.filter((_, i) => layout.visible.includes(i)).map(item => <button type="button" key={item.key}
      className={`${styles.pill} ${active === item.key ? styles.active : ''}`}
      aria-pressed={active === item.key} aria-label={item.label} title={item.label}
      onClick={() => onChange(item.key)}>{content(item, layout.compact)}</button>)}
    {hidden.length > 0 && <DropdownMenu.Root>
      <DropdownMenu.Trigger className={`${styles.more} ${layout.moreLabel ? styles.moreLabel : ''} ${hidden.some(i => i.key === active) ? styles.active : ''}`}
        aria-label={t('toolbar.moreFilters')} title={t('toolbar.moreFilters')}>
        {layout.moreLabel ? t('toolbar.moreFilters') : <span aria-hidden="true">···</span>}<ChevronDown size={12} aria-hidden="true"/>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="bottom" align="start" sideOffset={6} collisionPadding={12} className={styles.menu} aria-label={t('toolbar.moreFilters')}>
          <DropdownMenu.Label className={styles.menuLabel}>{t('toolbar.moreFilters')}</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={active} onValueChange={onChange}>
            {hidden.map(item => <DropdownMenu.RadioItem key={item.key} value={item.key} className={styles.menuItem}>
              {content(item, false)}<DropdownMenu.ItemIndicator className={styles.indicator}>✓</DropdownMenu.ItemIndicator>
            </DropdownMenu.RadioItem>)}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>}
  </div>;
}
