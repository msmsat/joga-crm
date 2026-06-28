import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Service } from '../types';
import { MOCK_SERVICES, SERVICE_CATEGORIES, SCH_TIMES } from '../constants';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

interface Props {
  showToast: (msg: string) => void;
}

export function ServiceSection({ showToast }: Props) {
  const { t } = useTranslation(['catalog', 'common']);
  const tCat = (cat: string) => t(`catalog:services.categories.${cat}`, { defaultValue: cat });
  const [services, setServices] = useState<Service[]>(MOCK_SERVICES);
  const [activeServiceId, setActiveServiceId] = useState<number>(MOCK_SERVICES[0]?.id ?? 0);

  const activeService = services.find(s => s.id === activeServiceId) ?? null;

  const groups = useMemo(() => {
    return SERVICE_CATEGORIES
      .filter(cat => services.some(s => s.category === cat))
      .map(cat => ({ label: cat, items: services.filter(s => s.category === cat) }));
  }, [services]);

  const handleDeleteService = () => {
    const remaining = services.filter(s => s.id !== activeServiceId);
    setServices(remaining);
    setActiveServiceId(remaining[0]?.id ?? 0);
    showToast(t('catalog:services.toasts.deleted'));
  };

  const avgPerMonth = activeService
    ? Math.round(activeService.bookings_total / 6)
    : 0;

  return (
    <div className="cat-layout">
      {/* ── LEFT PANEL ───────────────────────────────────────────────────── */}
      <div className="cat-list-panel">
        <div className="cat-panel-hdr">
          <span className="cat-panel-title">{t('catalog:services.title')}</span>
          <button className="cat-add-btn" title={t('catalog:services.addService')} onClick={() => showToast(t('catalog:services.addService'))}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        <div className="cat-list">
          {groups.map(group => (
            <div key={group.label}>
              <div className="cat-sep">{tCat(group.label)}</div>
              {group.items.map(svc => (
                <div
                  key={svc.id}
                  className={`cat-item ${svc.id === activeServiceId ? 'active' : ''}`}
                  onClick={() => setActiveServiceId(svc.id)}
                >
                  <div className="cat-item-dot" style={{ background: svc.color }} />
                  <div className="cat-item-info">
                    <div className="cat-item-name">{svc.name}</div>
                    <div className="cat-item-sub">₽{svc.price.toLocaleString()} · {svc.duration_min} {t('common:units.min')}</div>
                  </div>
                  <span className={`cat-type-badge ${svc.type}`}>
                    {svc.type === 'group' ? t('catalog:services.types.group') : t('catalog:services.types.individual')}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL ──────────────────────────────────────────────────── */}
      <div className="cat-right">
        {activeService ? (
          <>
            <div className="cat-hero" style={{ background: `linear-gradient(135deg, ${activeService.color}12, transparent 70%)` }}>
              <div className="cat-hero-actions">
                <button className="cat-h-btn" onClick={() => showToast(t('catalog:services.toasts.edit', { name: activeService.name }))}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  {t('common:buttons.edit')}
                </button>
                <button className="cat-h-btn del" onClick={handleDeleteService}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                  {t('common:buttons.delete')}
                </button>
              </div>
              <div className="cat-hero-info">
                <div className="cat-svc-icon" style={{ background: activeService.color }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                </div>
                <div>
                  <div className="cat-hero-name">{activeService.name}</div>
                  <div className="cat-hero-sub">
                    {tCat(activeService.category)}
                    <span className={`cat-hero-type ${activeService.type}`}>
                      {activeService.type === 'group' ? t('catalog:services.types.groupFull') : t('catalog:services.types.individualFull')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="cat-body cat-fade" key={activeServiceId}>
              {/* Stats */}
              <div className="cat-stats-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="cat-stat-card">
                  <div className="cat-stat-v">₽{activeService.price.toLocaleString()}</div>
                  <div className="cat-stat-l">{t('catalog:services.stats.price')}</div>
                </div>
                <div className="cat-stat-card">
                  <div className="cat-stat-v">{activeService.duration_min} {t('common:units.min')}</div>
                  <div className="cat-stat-l">{t('catalog:services.stats.duration')}</div>
                </div>
                <div className="cat-stat-card">
                  <div className="cat-stat-v">{activeService.bookings_total}</div>
                  <div className="cat-stat-l">{t('catalog:services.stats.bookings')}</div>
                </div>
                <div className="cat-stat-card">
                  <div className="cat-stat-v">₽{(activeService.revenue_total / 1000).toFixed(0)}K</div>
                  <div className="cat-stat-l">{t('catalog:services.stats.revenue')}</div>
                </div>
              </div>

              {/* Description */}
              <div className="cat-sec-title">{t('catalog:services.details.description')}</div>
              <p className="cat-description">{activeService.description}</p>

              {/* Details chips */}
              <div className="cat-sec-title">{t('catalog:services.details.details')}</div>
              <div className="cat-info-row">
                <div className="cat-chip">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  {activeService.duration_min} {t('catalog:services.details.minutes')}
                </div>
                {activeService.type === 'group' && activeService.max_clients && (
                  <div className="cat-chip">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.85"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    {t('catalog:services.details.upTo', { count: activeService.max_clients })}
                  </div>
                )}
                {activeService.type === 'individual' && (
                  <div className="cat-chip">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="5"/><path d="M3 21v-2a7 7 0 0 1 14 0v2"/></svg>
                    {t('catalog:services.details.personal')}
                  </div>
                )}
                <div className="cat-chip">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                  {avgPerMonth} {t('catalog:services.details.bookingsPerMonth')}
                </div>
                <div className="cat-chip" style={{ background: `${activeService.color}10`, borderColor: `${activeService.color}30`, color: activeService.color }}>
                  {tCat(activeService.category)}
                </div>
              </div>

              {/* Schedule grid */}
              <div className="cat-sec-title">{t('catalog:services.details.schedule')}</div>
              <div className="cat-sch-wrap">
                <div className="cat-sch-grid">
                  <div className="cat-sch-head" />
                  {DAY_KEYS.map(dk => <div key={dk} className="cat-sch-head">{t(`common:days.short.${dk}`)}</div>)}
                  {SCH_TIMES.map((time, ti) => (
                    <>
                      <div key={`t${ti}`} className="cat-sch-time">{time}</div>
                      {[0,1,2,3,4,5,6].map(di => {
                        const booked = activeService.schedule[ti]?.[di] === 1;
                        return (
                          <div
                            key={`${ti}-${di}`}
                            className={`cat-sch-cell ${booked ? 'booked' : ''}`}
                            style={booked ? { background: activeService.color } : undefined}
                          />
                        );
                      })}
                    </>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="cat-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#DDD" strokeWidth="1.2" style={{ marginBottom: '16px' }}><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#1A1A1A' }}>{t('catalog:services.empty.title')}</div>
            <div style={{ fontSize: '13px', color: '#AAAAAA', marginTop: '4px' }}>{t('catalog:services.empty.subtitle')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
