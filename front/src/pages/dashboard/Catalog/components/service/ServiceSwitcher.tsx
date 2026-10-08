import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Service } from '../../types';
import { Input } from '../../../../../components/ui/index';
import * as Icons from '../../../../../components/Icons';
import { usePriceLabel } from '../../../../../hooks/usePriceLabel';
import { useDurationLabel } from '../../../../../hooks/useDurationLabel';

export interface ServiceGroup {
  key: string;
  label: string;
  items: Service[];
}

interface Props {
  active: Service;
  subtitle: string;
  groups: ServiceGroup[];
  onPick: (id: number) => void;
  onAdd: () => void;
}

/** С какого числа услуг в окошке появляется поиск: короче список видно целиком. */
const SEARCH_FROM = 9;

/** Где стоит окошко: вплотную под кнопкой, на её ширину, до дока телефона. */
interface Box { top: number; left: number; width: number; maxHeight: number }

/**
 * Текущая услуга — сама кнопка смены услуги (там, где нет левого списка:
 * планшет и телефон). По нажатию кнопка раскрывается вниз списком: первой
 * строкой «+ Добавить услугу», ниже услуги по категориям, как в списке на
 * десктопе. Это продолжение кнопки, а не модалка: вплотную под ней, на её
 * ширину, одной рамкой и без затемнения страницы.
 * Ленту карточек над содержимым этот список заменил: она занимала строку
 * экрана и всё равно показывала полторы услуги.
 */
export function ServiceSwitcher({ active, subtitle, groups, onPick, onAdd }: Props) {
  const { t } = useTranslation(['catalog']);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  // Место окошка замеряется по кнопке в момент открытия и при повороте
  // экрана. Высота — до дока телефона: иначе низ списка уходил под панель.
  const [box, setBox] = useState<Box | null>(null);
  const open = box != null;
  const measure = useCallback((): Box | null => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    if (!anchor) return null;
    const dock = document.querySelector('.mnav-dock')?.getBoundingClientRect();
    const floor = dock && dock.height > 0 ? dock.top : window.innerHeight;
    return {
      // Верх — на нижнюю рамку кнопки: у открытой она прозрачная, и окошко
      // продолжает кнопку без шва.
      top: anchor.bottom - 1.5,
      left: anchor.left,
      width: anchor.width,
      maxHeight: Math.max(220, Math.min(540, floor - anchor.bottom - 12)),
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onResize = () => setBox(measure());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, measure]);

  return <>
    <button
      ref={anchorRef}
      type="button"
      className="svc-switch"
      data-svc-switch
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      onClick={() => setBox(open ? null : measure())}
    >
      <span className="svc-switch-mark" aria-hidden="true"><i /></span>
      <span className="svc-switch-text">
        <span className="svc-switch-name">{active.name}</span>
        <span className="svc-switch-sub">{subtitle}</span>
      </span>
      <span className="svc-switch-cta">
        {t('catalog:services.card.switch')}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
      </span>
    </button>
    {open && (
      <SwitcherPanel
        id={panelId}
        anchorRef={anchorRef}
        box={box}
        activeId={active.id}
        groups={groups}
        onClose={() => setBox(null)}
        onPick={id => { setBox(null); onPick(id); }}
        onAdd={() => { setBox(null); onAdd(); }}
      />
    )}
  </>;
}

interface PanelProps {
  id: string;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  box: Box;
  activeId: number;
  groups: ServiceGroup[];
  onClose: () => void;
  onPick: (id: number) => void;
  onAdd: () => void;
}

function SwitcherPanel({ id, anchorRef, box, activeId, groups, onClose, onPick, onAdd }: PanelProps) {
  const { t } = useTranslation(['catalog', 'common']);
  const priceLabel = usePriceLabel();
  const durationLabel = useDurationLabel();
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');

  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const needle = query.trim().toLocaleLowerCase();
  const shown = needle
    ? groups.map(group => ({ ...group, items: group.items.filter(s => s.name.toLocaleLowerCase().includes(needle)) }))
        .filter(group => group.items.length > 0)
    : groups;

  // Esc закрывает окошко, а не страницу вокруг; фокус — на текущую услугу,
  // при закрытии — обратно на кнопку.
  useEffect(() => {
    const anchor = anchorRef.current;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (anchor?.isConnected) anchor.focus({ preventScroll: true });
    };
  }, [anchorRef, onClose]);

  // Только при открытии: дальше фокус ведёт человек.
  useEffect(() => {
    const current = panelRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    current?.scrollIntoView({ block: 'center' });
    current?.focus({ preventScroll: true });
  }, []);

  return createPortal(<>
    {/* Прозрачная ловушка тапа: страница не затемняется, но тап мимо только
        закрывает список и не нажимает то, что под ним. Закрываем по click —
        по pointerdown ловушка исчезла бы до click, и тот достался бы кнопке
        под пальцем. */}
    <div className="svc-pop-catch" onClick={onClose} />
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label={t('catalog:services.card.switchTitle')}
      className="svc-pop"
      style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
    >
      <button type="button" className="svc-pop-add" onClick={onAdd}>
        <span className="svc-pop-plus" aria-hidden="true"><Icons.Plus width={15} height={15} /></span>
        {t('catalog:services.addService')}
      </button>
      {total >= SEARCH_FROM && (
        <div className="svc-pop-search">
          <Input value={query} onChange={setQuery} placeholder={t('catalog:services.card.search')} icon={<Icons.Search />} />
        </div>
      )}
      <div className="svc-pop-list">
        {shown.length === 0 && <div className="svc-pop-empty">{t('common:status.notFound')}</div>}
        {shown.map(group => (
          <div key={group.key} role="group" aria-label={group.label}>
            <div className="svc-pop-group" aria-hidden="true">{group.label}</div>
            {group.items.map(svc => (
              <button
                key={svc.id}
                type="button"
                className="svc-pop-item"
                aria-current={svc.id === activeId}
                onClick={() => onPick(svc.id)}
              >
                <span className="svc-pop-dot" style={{ background: svc.color }} />
                <span className="svc-pop-text">
                  <span className="svc-pop-name">{svc.name}</span>
                  <span className="svc-pop-sub">
                    {priceLabel(svc.price_min, svc.price_max, true)} · {durationLabel(svc.duration_from, svc.duration_to)}
                  </span>
                </span>
                <span className="svc-pop-check">{svc.id === activeId && <Icons.Check />}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  </>, document.body);
}
