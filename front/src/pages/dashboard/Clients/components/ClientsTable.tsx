import type { ClientData } from '../types';
import { getInitials } from '../utils/mapClient';
import { formatDate, STATUS_TO_LABEL } from '../utils/mapClient';

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `₽${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 1_000)     return `₽${Math.round(n / 1_000)}K`;
  return `₽${n}`;
}

function getTierLabel(points: number): { label: string; color: string } {
  if (points >= 8000) return { label: 'Platinum', color: '#8b8fa8' };
  if (points >= 3000) return { label: 'Gold',     color: '#c8a84b' };
  if (points >= 1000) return { label: 'Silver',   color: '#8c959e' };
  return { label: 'Bronze', color: '#b07b5a' };
}

function getStatusBadgeClass(status: string, frozen?: boolean): string {
  if (frozen)              return 'ct2-badge-frozen';
  if (status === 'vip')    return 'ct2-badge-vip';
  if (status === 'new')    return 'ct2-badge-new';
  return 'ct2-badge-active';
}

export interface ClientsTableProps {
  clients: ClientData[];
  activeClientId: number | null;
  isPanelOpen: boolean;
  onSelect: (cl: ClientData) => void;
  removingId?: number | null;
}

export function ClientsTable({ clients, activeClientId, isPanelOpen, onSelect, removingId }: ClientsTableProps) {
  return (
    <>
      <style>{`
        @keyframes cardRemove {
          to { opacity: 0; transform: scale(0.95) translateX(-8px); }
        }
        .ct2-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 12px;
          min-width: 0;
          width: 100%;
        }
        .ct2-card {
          background: var(--card);
          border-radius: 16px;
          padding: 18px 18px 16px;
          cursor: pointer;
          border: 1.5px solid rgba(26,26,26,0.06);
          box-shadow: 0 2px 12px -4px rgba(26,26,26,0.07), 0 1px 3px rgba(26,26,26,0.03);
          transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1);
          min-width: 0;
          overflow: hidden;
          position: relative;
          display: flex;
          flex-direction: column;
        }
        .ct2-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: transparent;
          transition: background 0.22s ease;
          border-radius: 16px 16px 0 0;
        }
        .ct2-card:hover::before {
          background: linear-gradient(90deg, var(--peach), #F5866E);
        }
        .ct2-card:hover {
          transform: translateY(-2px);
          border-color: rgba(249,160,139,0.2);
          box-shadow: 0 10px 28px -8px rgba(26,26,26,0.10), 0 2px 8px -2px rgba(249,160,139,0.08);
        }
        .ct2-card.ct2-selected::before {
          background: linear-gradient(90deg, var(--peach), #F5866E);
        }
        .ct2-card.ct2-selected {
          border-color: rgba(249,160,139,0.35);
          box-shadow: 0 8px 24px -4px rgba(249,160,139,0.18), 0 2px 8px -2px rgba(249,160,139,0.12);
        }
        .ct2-card.ct2-removing {
          animation: cardRemove 0.3s ease forwards;
          pointer-events: none;
        }

        .ct2-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
        }
        .ct2-avatar {
          width: 48px; height: 48px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; font-weight: 800;
          color: rgba(255,255,255,0.95);
          flex-shrink: 0;
          letter-spacing: 0.3px;
        }
        .ct2-info { flex: 1; min-width: 0; }
        .ct2-name {
          font-size: 14px; font-weight: 700;
          color: #1A1A1A; line-height: 1.25;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          margin-bottom: 4px;
        }
        .ct2-meta {
          display: flex; align-items: center; gap: 5px;
          font-size: 11px; color: var(--text3); font-weight: 500;
        }
        .ct2-badge {
          flex-shrink: 0;
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.5px;
          padding: 3px 8px;
          border-radius: 20px;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .ct2-badge-active  { background: rgba(163,201,168,0.18); color: #4a8f55; border: 1px solid rgba(163,201,168,0.3); }
        .ct2-badge-vip     { background: rgba(200,168,75,0.14);  color: #9a7d2e; border: 1px solid rgba(200,168,75,0.25); }
        .ct2-badge-new     { background: rgba(107,140,196,0.14); color: #3a6aad; border: 1px solid rgba(107,140,196,0.25); }
        .ct2-badge-frozen  { background: rgba(147,181,216,0.18); color: #4a7ca8; border: 1px solid rgba(147,181,216,0.3); }

        .ct2-spent-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 10px;
          background: rgba(26,26,26,0.025);
          border-radius: 10px;
          margin-bottom: 12px;
        }
        .ct2-spent-lbl { font-size: 11px; color: var(--text3); font-weight: 500; }
        .ct2-spent-val { font-size: 14px; font-weight: 800; color: #1A1A1A; letter-spacing: -0.3px; }

        .ct2-ab-row {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 6px;
        }
        .ct2-ab-lbl { font-size: 11px; color: var(--text3); font-weight: 500; }
        .ct2-ab-val { font-size: 11px; font-weight: 700; }
        .ct2-bar {
          height: 4px; border-radius: 999px;
          background: rgba(26,26,26,0.06);
          margin-bottom: 14px;
        }
        .ct2-bar-fill {
          height: 100%; border-radius: 999px;
          transition: width 0.4s ease;
        }

        .ct2-footer {
          display: flex; align-items: center; gap: 6px;
        }
        .ct2-tier-dot {
          width: 6px; height: 6px;
          border-radius: 50%; flex-shrink: 0;
        }
        .ct2-tier-lbl {
          font-size: 11px; color: var(--text3); font-weight: 500;
        }
        .ct2-visits {
          margin-left: auto;
          font-size: 11px; color: var(--text3); font-weight: 500;
        }
      `}</style>

      <div className="client-grid-wrap" style={{ minWidth: 0 }}>
        <div className="ct2-grid">
          {clients.map(cl => {
            const color    = cl.avatar_color ?? '#999';
            const abUsed   = cl.active_subscription?.used ?? 0;
            const abTotal  = cl.active_subscription?.total ?? 0;
            const tier     = getTierLabel(cl.loyalty_points);
            const fillPct  = abTotal > 0 ? (abUsed / abTotal) * 100 : 0;
            const isLow    = fillPct <= 30;
            const isFrozen = cl.frozen;
            const isSelected  = isPanelOpen && activeClientId === cl.id;
            const isRemoving  = removingId === cl.id;
            const badgeClass  = getStatusBadgeClass(cl.status, cl.frozen);

            const barColor = isFrozen
              ? 'linear-gradient(90deg,#93b5d8,#6d9ec4)'
              : isLow
                ? 'linear-gradient(90deg,#D88C9A,#cc7a8a)'
                : `linear-gradient(90deg,${color},${color}cc)`;

            return (
              <div
                key={cl.id}
                className={`ct2-card${isSelected ? ' ct2-selected' : ''}${isRemoving ? ' ct2-removing' : ''}`}
                onClick={() => onSelect(cl)}
              >
                <div className="ct2-header">
                  <div
                    className="ct2-avatar"
                    style={{
                      background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                      boxShadow: `0 4px 12px -4px ${color}60`,
                    }}
                  >
                    {getInitials(cl.name, cl.last_name)}
                  </div>
                  <div className="ct2-info">
                    <div className="ct2-name">{cl.name}{cl.last_name ? ' ' + cl.last_name : ''}</div>
                    <div className="ct2-meta">
                      <span>{cl.visit_count} визитов</span>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <span>{formatDate(cl.last_visit_date)}</span>
                    </div>
                  </div>
                  <div className={`ct2-badge ${badgeClass}`}>
                    {isFrozen ? '❄ заморожен' : (STATUS_TO_LABEL[cl.status] ?? cl.status)}
                  </div>
                </div>

                <div style={{ flex: 1 }}/>

                <div className="ct2-spent-row">
                  <span className="ct2-spent-lbl">Потрачено всего</span>
                  <span className="ct2-spent-val">{formatCurrency(cl.total_spent)}</span>
                </div>

                <div className="ct2-ab-row">
                  <span className="ct2-ab-lbl">Абонемент</span>
                  <span className="ct2-ab-val" style={{ color: isLow ? '#D88C9A' : isFrozen ? '#4a7ca8' : color }}>
                    {abUsed} из {abTotal}
                  </span>
                </div>
                <div className="ct2-bar">
                  <div className="ct2-bar-fill" style={{ width: `${fillPct}%`, background: barColor }}/>
                </div>

                <div className="ct2-footer">
                  <div className="ct2-tier-dot" style={{ background: tier.color }}/>
                  <span className="ct2-tier-lbl">{tier.label}</span>
                  <span className="ct2-visits">{cl.loyalty_points.toLocaleString()} pts</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
