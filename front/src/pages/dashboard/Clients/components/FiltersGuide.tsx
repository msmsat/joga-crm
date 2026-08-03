import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { usePopoverPosition } from '../../../../components/ui/index';
import { useSegmentRules } from '../hooks/useClientsList';
import { CATEGORY_ICONS, CATEGORY_COLORS } from './categoryIcons';
import { RuleStepper, type RuleField } from './RuleStepper';
import type { CategoryStat, SegmentRules } from '../../../../api/clients/clients.types';

export interface FiltersGuideProps {
  categories: CategoryStat[];
  activeCatKey: string;
  onCatChange: (key: string) => void;
}

/** Какие пороги настраиваются на карточке категории. */
const TUNABLE: Record<string, RuleField[]> = {
  new:      [{ key: 'new_client_days',    unit: 'days', step: 1,    min: 1, max: 365 }],
  active:   [{ key: 'active_within_days', unit: 'days', step: 5,    min: 1, max: 365 }],
  inactive: [{ key: 'active_within_days', unit: 'days', step: 5,    min: 1, max: 365 }],
  vip:      [
    { key: 'vip_min_spent',  unit: 'money',  step: 5000, min: 0, max: 100_000_000 },
    { key: 'vip_min_visits', unit: 'visits', step: 5,    min: 1, max: 10_000 },
  ],
};

/**
 * Одна кнопка вместо восьми «i» у каждого таба: открывает панель, где по каждому
 * фильтру видно, как он считается, и его же можно применить одним кликом.
 * Панель — в портале с position: fixed, иначе её режет overflow таблицы клиентов.
 */
export function FiltersGuide({ categories, activeCatKey, onCatChange }: FiltersGuideProps) {
  const { t } = useTranslation('clients');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  const placement = usePopoverPosition(open, buttonRef, panelRef, 'bottom', close);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const pick = (key: string) => { onCatChange(key); setOpen(false); };

  const { rules, save } = useSegmentRules();
  // Правила меняет только владелец — админу показываем их, но не даём трогать.
  const canEdit = rules !== null;

  const commit = (key: keyof SegmentRules, value: number) => {
    if (!rules) return;
    save({ ...rules, [key]: value }).catch(() => { /* тост поднимет вызывающий слой */ });
  };

  return (
    // flexShrink: 0 — на узком экране ряд категорий не переносится, и кнопка
    // «Фильтры» становится единственным доступом к спрятанным категориям:
    // сжиматься ей нельзя (см. .ct-tabs в ClientsToolbar).
    <div ref={rootRef} style={{ display: 'inline-flex', flexShrink: 0 }}>
      <style>{`
        .fg-trigger {
          display: flex; align-items: center; gap: 6px;
          padding: 7px 12px; border-radius: 10px;
          font-size: 12px; font-weight: 700;
          font-family: var(--font); white-space: nowrap;
          cursor: pointer;
          border: 1px solid var(--border2);
          background: var(--card);
          color: var(--text2);
          transition: all 0.22s cubic-bezier(0.16,1,0.3,1);
        }
        .fg-trigger:hover {
          color: var(--text);
          border-color: rgba(249,160,139,0.45);
          transform: translateY(-1px);
          box-shadow: 0 6px 16px -6px rgba(26,26,26,0.14);
        }
        .fg-trigger.open {
          color: var(--peach);
          border-color: rgba(249,160,139,0.6);
          background: rgba(249,160,139,0.07);
          box-shadow: 0 0 0 3px rgba(252,174,145,0.14);
        }
        .fg-trigger svg { flex-shrink: 0; }
        .fg-chev { transition: transform 0.22s cubic-bezier(0.16,1,0.3,1); }
        .fg-trigger.open .fg-chev { transform: rotate(180deg); }

        .fg-panel {
          width: min(660px, calc(100vw - 24px));
          max-height: min(600px, calc(100vh - 100px));
          overflow-y: auto;
          background: var(--bg-card, #FFFFFF);
          border: 1px solid rgba(var(--ink),0.08);
          border-radius: 20px;
          box-shadow: 0 28px 64px -12px rgba(26,26,26,0.24), 0 8px 20px -8px rgba(26,26,26,0.1);
          padding: 20px;
          box-sizing: border-box;
          font-family: var(--font, 'Manrope', sans-serif);
          animation: fg-panel-in 0.3s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes fg-panel-in {
          from { opacity: 0; transform: translateY(8px) scale(0.985); }
          to   { opacity: 1; transform: none; }
        }

        .fg-head {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 16px; margin-bottom: 16px; padding: 0 4px;
        }
        .fg-title {
          font-size: 15px; font-weight: 800; color: var(--onyx);
          letter-spacing: -0.2px; margin-bottom: 3px;
        }
        .fg-sub { font-size: 12px; font-weight: 500; color: var(--text3); line-height: 1.45; }
        .fg-close {
          width: 28px; height: 28px; flex-shrink: 0;
          border: none; border-radius: 9px; cursor: pointer;
          background: rgba(var(--ink),0.05); color: var(--text3);
          display: flex; align-items: center; justify-content: center;
          transition: all 0.18s;
        }
        .fg-close:hover { background: rgba(var(--ink),0.09); color: var(--text); }

        .fg-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        @media (max-width: 620px) { .fg-grid { grid-template-columns: minmax(0, 1fr); } }

        .fg-card {
          padding: 13px 14px; border-radius: 14px;
          border: 1.5px solid transparent;
          background: rgba(var(--ink),0.025);
          font-family: inherit;
          transition: transform 0.22s cubic-bezier(0.16,1,0.3,1),
                      box-shadow 0.22s cubic-bezier(0.16,1,0.3,1),
                      border-color 0.22s, background 0.22s;
          animation: fg-card-in 0.42s cubic-bezier(0.16,1,0.3,1) both;
        }
        .fg-pick {
          display: flex; align-items: flex-start; gap: 11px;
          width: 100%; padding: 0; border: none; background: none;
          text-align: left; cursor: pointer; font-family: inherit;
        }
        @keyframes fg-card-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: none; }
        }
        .fg-card:hover {
          transform: translateY(-2px);
          background: var(--bg-card, #FFFFFF);
          border-color: rgba(var(--ink),0.1);
          box-shadow: 0 10px 24px -10px rgba(26,26,26,0.18);
        }
        .fg-card.active {
          background: rgba(249,160,139,0.07);
          border-color: rgba(249,160,139,0.55);
        }
        .fg-card.active:hover { box-shadow: 0 10px 24px -10px rgba(249,160,139,0.4); }

        .fg-ico {
          width: 30px; height: 30px; flex-shrink: 0;
          border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
        }
        .fg-body { flex: 1; min-width: 0; }
        .fg-row { display: flex; align-items: center; gap: 7px; margin-bottom: 4px; }
        .fg-name {
          font-size: 12.5px; font-weight: 800; color: var(--onyx);
          letter-spacing: -0.1px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .fg-count {
          font-size: 10px; font-weight: 800; flex-shrink: 0;
          padding: 2px 7px; border-radius: 999px;
          background: rgba(var(--ink),0.06); color: var(--text3);
        }
        .fg-card.active .fg-count { background: rgba(249,160,139,0.18); color: var(--peach); }
        .fg-check { margin-left: auto; flex-shrink: 0; color: var(--peach); }
        .fg-desc { font-size: 11.5px; font-weight: 500; line-height: 1.5; color: var(--text3); }

        /* ── Настройка порога ─────────────────────────────────────────────── */
        .fg-tune {
          display: flex; flex-wrap: wrap; gap: 10px 14px;
          margin: 11px 0 0 41px;
          padding-top: 10px;
          border-top: 1px dashed rgba(var(--ink),0.1);
        }
        .fg-rule { display: inline-flex; align-items: center; gap: 6px; }
        .fg-rule-label {
          font-size: 10px; font-weight: 700; color: var(--text3);
          text-transform: uppercase; letter-spacing: 0.4px;
        }
        .fg-step {
          display: inline-flex; align-items: center; gap: 1px;
          padding: 2px; border-radius: 9px;
          background: var(--bg-card, #FFFFFF);
          border: 1.5px solid rgba(var(--ink),0.1);
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .fg-step:focus-within {
          border-color: rgba(249,160,139,0.6);
          box-shadow: 0 0 0 3px rgba(252,174,145,0.14);
        }
        .fg-step.is-off { opacity: 0.5; }
        .fg-step button {
          width: 20px; height: 20px; flex-shrink: 0;
          border: none; border-radius: 6px; background: transparent;
          color: var(--text3); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s, color 0.15s;
        }
        .fg-step button:hover:not(:disabled) { background: rgba(249,160,139,0.16); color: var(--peach); }
        .fg-step button:disabled { cursor: not-allowed; }
        .fg-step input {
          border: none; background: transparent; outline: none;
          text-align: center; font-family: inherit;
          font-size: 12px; font-weight: 800; color: var(--onyx);
          padding: 0;
        }
        .fg-step input:disabled { cursor: not-allowed; }
        .fg-unit { font-size: 10.5px; font-weight: 600; color: var(--text3); }
        .fg-saved {
          display: inline-flex; color: var(--peach);
          opacity: 0; transform: scale(0.6);
          transition: opacity 0.2s, transform 0.28s cubic-bezier(0.34,1.56,0.64,1);
        }
        .fg-saved.on { opacity: 1; transform: scale(1); }

        /* Телефон: от кнопки остаётся одна иконка — подпись и шеврон съедали
           60px первого ряда, а иконка фильтров читается однозначно.
           font-size: 0 гасит текстовый узел, не трогая svg (у него свои
           width/height) — обходимся без обёртки-спана в разметке. */
        @media (max-width: 767px) {
          .fg-trigger { font-size: 0; gap: 0; padding: 8px 9px; }
          .fg-chev { display: none; }
          .fg-panel { padding: 14px; border-radius: 16px; }
          .fg-card { padding: 11px 12px; }
          .fg-tune { margin-left: 0; }
        }
      `}</style>

      <button
        ref={buttonRef}
        type="button"
        className={`fg-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
          <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
          <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>
          <line x1="17" y1="16" x2="23" y2="16"/>
        </svg>
        {t('filtersGuide.trigger')}
        <svg className="fg-chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          className="fg-panel"
          role="dialog"
          aria-label={t('filtersGuide.title')}
          style={{
            position: 'fixed',
            top: placement ? `${placement.top}px` : 0,
            left: placement ? `${placement.left}px` : 0,
            visibility: placement ? 'visible' : 'hidden',
            zIndex: 1200,
          }}
        >
          <div className="fg-head">
            <div>
              <div className="fg-title">{t('filtersGuide.title')}</div>
              <div className="fg-sub">{t('filtersGuide.subtitle')}</div>
            </div>
            <button type="button" className="fg-close" onClick={close} aria-label={t('filtersGuide.close')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div className="fg-grid">
            {categories.map((cat, i) => {
              const color = CATEGORY_COLORS[cat.key] ?? 'var(--peach)';
              const isActive = activeCatKey === cat.key;
              const fields = TUNABLE[cat.key];
              return (
                <div
                  key={cat.key}
                  className={`fg-card${isActive ? ' active' : ''}`}
                  style={{ animationDelay: `${i * 35}ms` }}
                >
                  {/* Кнопка — только шапка: степперы ниже сами интерактивны,
                      вложить их в кнопку нельзя (невалидный HTML, ломает клики). */}
                  <button type="button" className="fg-pick" onClick={() => pick(cat.key)}>
                    <span className="fg-ico" style={{ color, background: `${color}1f` }}>
                      {CATEGORY_ICONS[cat.key]}
                    </span>
                    <span className="fg-body">
                      <span className="fg-row">
                        <span className="fg-name">
                          {t(`categories.${cat.key}`, { defaultValue: cat.label })}
                        </span>
                        <span className="fg-count">{cat.count}</span>
                        {isActive && (
                          <svg className="fg-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </span>
                      <span className="fg-desc">
                        {t(`categoriesInfo.${cat.key}.text`, { defaultValue: '' })}
                      </span>
                    </span>
                  </button>

                  {fields && (
                    <div className="fg-tune">
                      {fields.map(f => (
                        <RuleStepper
                          key={f.key}
                          field={f}
                          value={rules?.[f.key] ?? 0}
                          disabled={!canEdit}
                          onCommit={commit}
                        />
                      ))}
                    </div>
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
