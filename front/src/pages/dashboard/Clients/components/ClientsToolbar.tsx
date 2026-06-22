import type { ClientData } from '../types';

export interface ClientsToolbarProps {
  categories: string[];
  activeCat: string;
  onCatChange: (cat: string) => void;
  searchQuery: string;
  onSearch: (q: string) => void;
  onAddClick: () => void;
}

export function ClientsToolbar({
  categories, activeCat, onCatChange,
  searchQuery, onSearch, onAddClick,
}: ClientsToolbarProps) {
  return (
    <>
      <style>{`
        .search-chip {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 14px; background: var(--card);
          border: 1px solid var(--border2); border-radius: 20px;
          width: 260px; transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }
        .search-chip:focus-within {
          border-color: var(--peach);
          box-shadow: 0 0 0 3px rgba(249,160,139,0.15);
          width: 280px;
        }
        .search-chip input {
          border: none; background: transparent; outline: none;
          font-size: 12px; font-weight: 600; color: var(--text);
          width: 100%; font-family: 'Manrope', sans-serif;
        }
        .search-chip input::placeholder { color: var(--text3); font-weight: 500; }
        .ct-add-btn { transition: all 0.2s ease; }
        .ct-add-btn:hover { transform: translateY(-1px); filter: brightness(1.05); box-shadow: 0 8px 20px rgba(249,160,139,0.4) !important; }
      `}</style>

      <div className="category-chips" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        {categories.map((cat, i) => (
          <div
            key={i}
            className={`cat-chip ${activeCat === cat ? 'active' : ''}`}
            onClick={() => onCatChange(cat)}
          >
            {cat}
          </div>
        ))}

        <div className="search-chip">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearch(e.target.value)}
            placeholder="Поиск по имени, номеру или тегу..."
          />
        </div>

        <button
          className="ct-add-btn"
          onClick={onAddClick}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px',
            background: 'linear-gradient(135deg, #FCAE91, #F9A08B)',
            border: 'none', borderRadius: '20px',
            fontSize: '12px', fontWeight: 700, color: '#fff',
            cursor: 'pointer', fontFamily: "'Manrope', sans-serif",
            boxShadow: '0 4px 14px rgba(249,160,139,0.3)',
            whiteSpace: 'nowrap',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Добавить клиента
        </button>
      </div>
    </>
  );
}

// Suppress unused import warning — ClientData is re-exported for tree-shaking
export type { ClientData };
