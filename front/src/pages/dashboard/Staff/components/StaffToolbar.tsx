
export interface StaffToolbarProps {
  count: number;
  searchQuery: string;
  onSearch: (query: string) => void;
  activeGroup: string;
  onGroupChange: (group: string) => void;
  availableGroups: string[];
  onAddClick: () => void;
}

export function StaffToolbar({
  count,
  searchQuery,
  onSearch,
  activeGroup,
  onGroupChange,
  availableGroups,
  onAddClick,
}: StaffToolbarProps) {
  return (
    <>
      <div className="panel-hdr">
        <span className="panel-title">Команда · {count} чел.</span>
        <button className="add-btn" onClick={onAddClick} title="Добавить сотрудника">+</button>
      </div>

      <div style={{ padding: '8px 10px 0' }}>
        <div style={{ position: 'relative' }}>
          <svg
            width="12" height="12" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5"
            style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Поиск..."
            value={searchQuery}
            onChange={e => onSearch(e.target.value)}
            style={{
              width: '100%', padding: '6px 8px 6px 28px',
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: '8px', fontSize: '11px', color: 'var(--text)',
              outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          />
        </div>
      </div>

      {availableGroups.length > 2 && (
        <div style={{ padding: '8px 10px 6px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {availableGroups.map(g => (
            <button
              key={g}
              onClick={() => onGroupChange(g)}
              style={{
                padding: '5px 10px', borderRadius: '20px',
                border: activeGroup === g ? '1.5px solid rgba(252,174,145,0.5)' : '1.5px solid transparent',
                background: activeGroup === g ? 'rgba(252,174,145,0.14)' : 'rgba(26,26,26,0.04)',
                color: activeGroup === g ? '#C07060' : 'var(--text3)',
                fontSize: '11px', fontWeight: activeGroup === g ? 700 : 500,
                cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', fontFamily: 'inherit',
              }}
            >
              {g === 'ALL' ? 'Все' : g}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
