import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { CategoryStat } from '../../../../api/clients/clients.types';

const CATEGORY_ICONS: Record<string, JSX.Element> = {
  all: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  vip: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  active: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  new: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="16"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  ),
  has_subscription: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  ),
  inactive: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="10" y1="15" x2="10" y2="9"/>
      <line x1="14" y1="15" x2="14" y2="9"/>
    </svg>
  ),
  frozen: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="22"/>
      <path d="M17 7l-5 5-5-5"/>
      <path d="M17 17l-5-5-5 5"/>
      <path d="M2 12h20"/>
    </svg>
  ),
  birthday: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/>
      <path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/>
      <path d="M2 21h20"/>
      <path d="M7 8v2"/>
      <path d="M12 8v2"/>
      <path d="M17 8v2"/>
      <path d="M7 4s0-2 2.5-2 2.5 2 5 2 2.5-2 2.5-2"/>
    </svg>
  ),
};

export interface ClientsToolbarProps {
  categories: CategoryStat[];
  activeCatKey: string;
  onCatChange: (key: string) => void;
  searchQuery: string;
  onSearch: (q: string) => void;
  onAddClick: () => void;
}

export function ClientsToolbar({
  categories, activeCatKey, onCatChange,
  searchQuery, onSearch, onAddClick,
}: ClientsToolbarProps) {
  const { t } = useTranslation('clients');
  return (
    <>
      <style>{`
        .ct-row {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .ct-tab {
          display: flex; align-items: center; gap: 5px;
          padding: 7px 12px; border-radius: 10px;
          font-size: 12px; font-weight: 600; color: var(--text2);
          border: none; background: transparent;
          cursor: pointer;
          transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1);
          font-family: var(--font); white-space: nowrap;
          position: relative;
        }
        .ct-tab:hover {
          background: rgba(26,26,26,0.04);
          color: var(--text);
          transform: translateY(-1px);
        }
        .ct-tab.active {
          color: var(--peach);
          background: rgba(249,160,139,0.08);
        }
        .ct-tab.active::after {
          content: '';
          position: absolute;
          bottom: 0; left: 10px; right: 10px;
          height: 2px;
          background: var(--peach);
          border-radius: 999px;
        }
        .ct-count {
          font-size: 10px; font-weight: 600;
          color: inherit; opacity: 0.5;
        }
        .ct-divider {
          width: 1px; height: 20px;
          background: var(--border2);
          margin: 0 4px; flex-shrink: 0;
        }
        .ct-search {
          display: flex; align-items: center; gap: 7px;
          padding: 7px 13px; background: var(--card);
          border: 1px solid var(--border2); border-radius: 10px;
          transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1);
          flex-shrink: 0;
        }
        .ct-search:focus-within {
          border-color: rgba(249,160,139,0.5);
          box-shadow: 0 0 0 3px rgba(249,160,139,0.12);
        }
        .ct-search input {
          border: none; background: transparent; outline: none;
          font-size: 12px; font-weight: 500; color: var(--text);
          width: 190px; font-family: var(--font);
        }
        .ct-search input::placeholder { color: var(--text3); }
        .ct-add-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 16px;
          background: linear-gradient(135deg, #FCAE91, #F9A08B);
          border: none; border-radius: 10px;
          font-size: 12px; font-weight: 700; color: #fff;
          cursor: pointer; font-family: var(--font);
          box-shadow: 0 4px 14px rgba(249,160,139,0.3);
          white-space: nowrap; flex-shrink: 0;
          transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1);
        }
        .ct-add-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(249,160,139,0.4);
        }
        .ct-add-btn:active { transform: scale(0.97); }
      `}</style>

      <div className="ct-row">
        {categories.map((cat) => {
          const icon = CATEGORY_ICONS[cat.key];
          const isActive = activeCatKey === cat.key;
          return (
            <button
              key={cat.key}
              className={`ct-tab${isActive ? ' active' : ''}`}
              onClick={() => onCatChange(cat.key)}
            >
              {icon}
              {t(`categories.${cat.key}`, { defaultValue: cat.label })}
              <span className="ct-count">{cat.count}</span>
            </button>
          );
        })}

        <div className="ct-divider" />

        <div className="ct-search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearch(e.target.value)}
            placeholder={t('toolbar.searchPlaceholder')}
          />
        </div>

        <button className="ct-add-btn" onClick={onAddClick}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {t('toolbar.addClient')}
        </button>
      </div>
    </>
  );
}
