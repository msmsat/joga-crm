import type { ClientData } from '../types';

export interface ClientsTableProps {
  clients: ClientData[];
  activeClientId: number | null;
  isPanelOpen: boolean;
  onSelect: (cl: ClientData) => void;
}

export function ClientsTable({ clients, activeClientId, isPanelOpen, onSelect }: ClientsTableProps) {
  return (
    <div className="client-grid-wrap">
      <div className="clients-grid" style={{ transition: 'all 0.38s cubic-bezier(0.16,1,0.3,1)' }}>
        {clients.map(cl => (
          <div
            key={cl.id}
            className={`client-card ${cl.type}${isPanelOpen && activeClientId === cl.id ? ' selected-card' : ''}`}
            onClick={() => onSelect(cl)}
            style={{ cursor: 'pointer' }}
          >
            <div className="client-card-top">
              <div
                className="client-ava"
                style={{ 
                  background: `linear-gradient(135deg,${cl.c},${cl.c}bb)`,
                  color: '#FFFFFF' /* 🔥 Принудительно задаем белоснежный цвет тексту */
                }}
              >
                {cl.i}
              </div>
              <div>
                <div className="client-name">{cl.n}</div>
                <div className="client-visits">{cl.v} визитов</div>
              </div>
              <div className={`client-badge ${cl.badge}`}>{cl.bl}</div>
            </div>

            <div className="client-stats">
              <div className="client-stat"><div className="v">{cl.v}</div><div className="l">Визиты</div></div>
              <div className="client-stat"><div className="v">{cl.spent}</div><div className="l">Итого</div></div>
              <div className="client-stat">
                <div className="v">{cl.ab}/{cl.abMax}</div>
                <div className="l">Абон.</div>
              </div>
            </div>

            <div className="abonement-label">
              <span>Абонемент</span><span>{cl.ab}/{cl.abMax} занятий</span>
            </div>
            <div className="abonement-bar">
              <div className="abonement-fill" style={{ width: `${(cl.ab / cl.abMax) * 100}%` }} />
            </div>

            <div className="loyalty-svg-chip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              {(cl.v * 12).toLocaleString()} баллов
              <span style={{ marginLeft: 'auto', fontSize: '9px', color: 'var(--text3)', fontWeight: 500 }}>
                {cl.v >= 50 ? 'Gold' : cl.v >= 20 ? 'Silver' : 'Bronze'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
