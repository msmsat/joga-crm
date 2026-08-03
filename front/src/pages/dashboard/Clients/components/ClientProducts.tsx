import { useTranslation } from 'react-i18next';
import type { ClientProduct } from '../types';

interface ClientProductsProps {
  products: ClientProduct[];
  color: string;
  frozen: boolean;
  /** null — роль не вправе слать напоминание (тренер): кнопку не рисуем. */
  onRemind: (() => void) | null;
}

const LOW_RATIO = 0.25;
/** Больше — точки превращаются в кашу, показываем только полосу. */
const MAX_DOTS = 12;

function fmtDate(iso: string, locale: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/**
 * Все живые продукты клиента: абонементы, разовые занятия и купленные «в запас».
 * Порядок задаёт бэкенд — ровно тот, в котором они будут тратиться.
 */
export function ClientProducts({ products, color, frozen, onRemind }: ClientProductsProps) {
  const { t, i18n } = useTranslation('clients');

  if (products.length === 0) return <EmptyProducts onRemind={onRemind} />;

  return (
    <div style={{ marginBottom: 12 }}>
      <style>{`
        .cp-item {
          position: relative;
          padding: 12px 14px 12px 16px;
          border-radius: 12px;
          background: rgba(var(--ink),0.02);
          border: 1px solid var(--border);
          overflow: hidden;
        }
        .cp-item + .cp-item { margin-top: 8px; }
        .cp-item.pending { border-style: dashed; background: transparent; }
        /* Цветная засечка слева — по ней взгляд считывает границы карточек в стопке */
        .cp-accent { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; }
        .cp-head { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
        .cp-name {
          font-size: 12px; font-weight: 800; color: var(--text);
          letter-spacing: -0.1px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .cp-chip {
          flex-shrink: 0; font-size: 9px; font-weight: 800;
          padding: 2px 6px; border-radius: 5px;
          text-transform: uppercase; letter-spacing: 0.3px;
        }
        .cp-count { margin-left: auto; flex-shrink: 0; font-size: 11px; font-weight: 800; }
        .cp-bar { position: relative; height: 7px; background: rgba(var(--ink),0.06); border-radius: 10px; overflow: hidden; }
        .cp-fill { height: 100%; border-radius: 10px; transition: width 0.6s cubic-bezier(0.16,1,0.3,1); }
        .cp-dots { display: flex; justify-content: space-between; gap: 3px; margin-top: 7px; }
        .cp-dot { width: 5px; height: 5px; border-radius: 50%; transition: background 0.3s; }
        .cp-foot {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          margin-top: 8px; font-size: 10.5px; font-weight: 600; color: var(--text3);
        }
        .cp-remind {
          padding: 5px 9px; border: 1px solid rgba(216,140,154,0.45); border-radius: 7px;
          background: var(--bg-card); color: #B5677A;
          font-size: 10px; font-weight: 700; cursor: pointer; font-family: Manrope;
          flex-shrink: 0; transition: background 0.15s;
        }
        .cp-remind:hover { background: rgba(216,140,154,0.08); }
      `}</style>

      {products.map(p => {
        const remaining = Math.max(0, p.total - p.used);
        const pct = p.total > 0 ? (remaining / p.total) * 100 : 0;
        const isLow = !p.is_pending && remaining / p.total <= LOW_RATIO;
        const isSingle = p.total === 1;
        // Замороженный и ждущий — «на паузе», их не красим тревожным цветом.
        const paused = p.is_pending || p.is_frozen || frozen;
        const accent = paused ? '#93b5d8' : isLow ? '#D88C9A' : color;

        return (
          <div key={p.id} className={`cp-item${p.is_pending ? ' pending' : ''}`}>
            <span className="cp-accent" style={{ background: accent }} />

            <div className="cp-head">
              <span className="cp-name">{p.type}</span>
              {isSingle && (
                <span className="cp-chip" style={{ background: 'rgba(var(--ink),0.06)', color: 'var(--text3)' }}>
                  {t('panel.products.single')}
                </span>
              )}
              {p.is_pending && (
                <span className="cp-chip" style={{ background: 'rgba(249,160,139,0.16)', color: '#D9825F' }}>
                  {t('panel.products.pending')}
                </span>
              )}
              {p.is_frozen && (
                <span className="cp-chip" style={{ background: 'rgba(147,181,216,0.18)', color: '#4a7ca8' }}>
                  {t('panel.products.frozen')}
                </span>
              )}
              <span className="cp-count" style={{ color: accent }}>
                {remaining}/{p.total}
              </span>
            </div>

            <div className="cp-bar">
              <div
                className="cp-fill"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accent}, ${accent}bb)` }}
              />
            </div>

            {p.total <= MAX_DOTS && (
              <div className="cp-dots">
                {Array.from({ length: p.total }).map((_, i) => (
                  <span
                    key={i}
                    className="cp-dot"
                    style={{ background: i < remaining ? accent : 'rgba(var(--ink),0.12)' }}
                  />
                ))}
              </div>
            )}

            <div className="cp-foot">
              <span>
                {p.is_pending
                  ? t('panel.products.startsOnFirstVisit')
                  : t('panel.products.until', { date: fmtDate(p.expires_at, i18n.language) })}
              </span>
              {isLow && onRemind && (
                <button className="cp-remind" onClick={onRemind}>
                  {t('panel.abonement.remind')}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyProducts({ onRemind }: { onRemind: (() => void) | null }) {
  const { t } = useTranslation('clients');
  return (
    <div style={{
      padding: '14px 16px', marginBottom: 12, borderRadius: 12,
      background: 'rgba(216,140,154,0.06)', border: '1px solid rgba(216,140,154,0.2)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{t('panel.abonement.title')}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#D88C9A' }}>{t('panel.abonement.noSubscription')}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#D88C9A', fontSize: 11, fontWeight: 600 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        {t('panel.abonement.noSubscriptionWarning')}
      </div>
      {onRemind && (
        <button
          onClick={onRemind}
          style={{
            marginTop: 8, padding: '6px 9px', border: '1px solid rgba(216,140,154,0.45)',
            borderRadius: 7, background: 'var(--bg-card)', color: '#B5677A',
            fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'Manrope',
          }}
        >
          {t('panel.abonement.remind')}
        </button>
      )}
    </div>
  );
}
