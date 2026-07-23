import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudioList, useBranchDetail } from '../hooks/useCatalogList';
import { useStudioCurrency } from '../../../../hooks/useStudioCurrency';
import { useToast } from '../../../../components/ui/Toast';
import { ConfirmModal } from '../../../../components/ui/ConfirmModal';
import { errorMessage } from '../../../../api/errorMessage';
import { resolveImageUrl } from '../../../../api/client';
import { getCurrencySymbol } from '../../../../components/UI';
import AddStudioModal from './modals/AddStudioModal';
import { HallModal } from './modals/EditStudio'; // Оставляем модалку зала
import { EditBranchModal } from './modals/EditBranch'; // Подключаем твою новую крутую модалку
import { CatalogListSkeleton, CatalogRightSkeleton, CatalogError } from './CatalogSkeleton';
import type { HallBrief } from '../../../../api/studio/studio.types';

// Кросс-фейд фото шапки при смене филиал↔зал: старое фото остаётся видимым слоем
// снизу, новое проявляется сверху через CSS-анимацию входа (без второго слоя
// opacity не с чем анимировать — background-image не переходит плавно).
function HeroPhoto({ src }: { src: string | null }) {
  if (!src) return null;
  return <div key={src} className="cat-hero-photo" style={{ backgroundImage: `url(${src})` }} />;
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function StudioSection() {
  const { t } = useTranslation(['catalog', 'common']);
  const toast = useToast();
  const studioCurrency = useStudioCurrency();
  const currency = getCurrencySymbol(studioCurrency);
  const { studios, isLoading, error: listError, refetch: refetchList, createBranch, updateBranch, deleteBranch } = useStudioList();

  const copyToClipboard = (value: string, successMsg: string) => {
    navigator.clipboard.writeText(value)
      .then(() => toast.success(successMsg))
      .catch(() => toast.error(t('common:toasts.copyFailed')));
  };

  const [activeStudioId, setActiveStudioId] = useState<number | null>(null);
  const [activeHallId, setActiveHallId] = useState<number | null>(null);

  useEffect(() => {
    if (studios.length > 0 && activeStudioId === null) {
      setActiveStudioId(studios[0].id);
    }
  }, [studios, activeStudioId]);

  const { branch: activeStudio, isLoading: isBranchLoading, error: branchError, refetch: refetchBranch, createHall, updateHall, deleteHall } = useBranchDetail(activeStudioId);
  const activeHall = activeStudio?.halls.find(h => h.id === activeHallId) ?? null;

  // Ошибка загрузки списка/детали — тост (панель ниже покажет «Повторить»).
  const loadError = listError ?? branchError;
  useEffect(() => {
    if (loadError) toast.error(errorMessage(loadError, t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadError]);

  const [isEditStudioOpen, setIsEditStudioOpen] = useState(false);
  // null → нет модалки зала; { hall: null } → создание; { hall } → редактирование
  const [hallModal, setHallModal] = useState<{ hall: HallBrief | null } | null>(null);

  const groups = useMemo(() => {
    const countries = [...new Set(studios.map(s => s.country).filter((c): c is string => Boolean(c)))];
    if (countries.length > 1) {
      return countries.map(country => ({ label: country, items: studios.filter(s => s.country === country) }));
    }
    const cities = [...new Set(studios.map(s => s.city).filter((c): c is string => Boolean(c)))];
    return cities.map(city => ({ label: city, items: studios.filter(s => s.city === city) }));
  }, [studios]);

  const handleSelectStudio = (id: number) => {
    setActiveStudioId(id);
    setActiveHallId(null);
  };

  // Что подтверждаем на удаление (null → модалки нет).
  const [confirmDelete, setConfirmDelete] = useState<'studio' | 'hall' | null>(null);

  const doDeleteStudio = async () => {
    if (!activeStudio) return;
    try {
      await deleteBranch(activeStudio.id);
      setActiveStudioId(null);
      toast.success(t('catalog:studios.toasts.deleted'));
    } catch (error) {
      toast.error(errorMessage(error, t));
      throw error; // держим модалку открытой
    }
  };

  const doDeleteHall = async () => {
    if (!activeHall) return;
    try {
      await deleteHall(activeHall.id);
      setActiveHallId(null);
      toast.success(t('catalog:studios.toasts.hallDeleted'));
    } catch (error) {
      toast.error(errorMessage(error, t));
      throw error;
    }
  };

  const [hoverAdd, setHoverAdd] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const minHourlyRate = activeStudio?.halls.length
    ? Math.min(...activeStudio.halls.map(h => h.hourly_rate ?? 0))
    : null;

  // Fallback-цепочка: зал → филиал → нет фото (заливка). Нет фото зала — не значит нет фото вовсе.
  const heroPhotoUrl = resolveImageUrl(activeHall?.photo_url ?? activeStudio?.photo_url) ?? null;

  return (
    <>
    <div className="cat-layout">
      {/* ── LEFT PANEL ───────────────────────────────────────────────────── */}
      <div className="cat-list-panel">
        <div className="cat-panel-hdr">
          <span className="cat-panel-title">{t('catalog:studios.title')}</span>
          <button className="cat-add-btn" title={t('catalog:studios.addStudio')} onClick={() => setIsAddModalOpen(true)}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        {isLoading && studios.length === 0 ? <CatalogListSkeleton /> : (
        <div className="cat-list">
          {groups.map(group => (
            <div key={group.label}>
              <div className="cat-sep">{group.label}</div>
              {group.items.map(studio => (
                <div
                  key={studio.id}
                  className={`cat-item ${studio.id === activeStudioId ? 'active' : ''}`}
                  onClick={() => handleSelectStudio(studio.id)}
                >
                  <div className="cat-item-icon" style={{ background: 'rgba(252,174,145,0.1)', color: '#FCAE91' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  </div>
                  <div className="cat-item-info">
                    <div className="cat-item-name">{studio.name}</div>
                    <div className="cat-item-sub">
                      {t('catalog:studios.hallCount', { count: studio.hall_count })} · {studio.address}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        )}
      </div>

      {/* ── RIGHT PANEL ──────────────────────────────────────────────────── */}
      <div className="cat-right">
        {activeStudio ? (
          <>
            <div className={`cat-hero ${heroPhotoUrl ? 'has-photo' : ''}`}>
              <div className="cat-hero-bg" />
              <HeroPhoto src={heroPhotoUrl} />
              <div className="cat-hero-scrim" />
              <div className="cat-hero-actions">
                <button
                  className="cat-h-btn"
                  onClick={() => (activeHall ? setHallModal({ hall: activeHall }) : setIsEditStudioOpen(true))}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  {activeHall ? t('catalog:studios.hall.edit') : t('catalog:studios.editBranch')}
                </button>
                <button
                  className="cat-h-btn del"
                  onClick={() => setConfirmDelete(activeHall ? 'hall' : 'studio')}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  {activeHall ? t('catalog:studios.hall.delete') : t('catalog:studios.deleteBranch')}
                </button>
              </div>
              <div className="cat-hero-info">
                <div className="cat-hero-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                </div>
                <div>
                  <div className="cat-hero-name">{activeStudio.name}</div>
                  <div className="cat-hero-sub">{activeStudio.city} · {activeStudio.address}</div>
                </div>
              </div>
            </div>

            <div className="cat-body cat-fade" key={activeStudioId}>
              {/* Hall selector tabs */}
              <div className="cat-hall-tabs">
                <button
                  className={`cat-hall-btn ${activeHallId === null ? 'active' : ''}`}
                  onClick={() => setActiveHallId(null)}
                >
                  {t('catalog:studios.infoTab')}
                </button>
                {activeStudio.halls.map(hall => (
                  <button
                    key={hall.id}
                    className={`cat-hall-btn ${activeHallId === hall.id ? 'active' : ''}`}
                    style={activeHallId === hall.id ? { background: hall.color ?? '#FCAE91', borderColor: 'transparent', color: '#fff' } : {}}
                    onClick={() => setActiveHallId(hall.id)}
                  >
                    <span className="cat-hall-dot" style={{ background: activeHallId === hall.id ? 'rgba(255,255,255,0.7)' : (hall.color ?? '#FCAE91') }} />
                    {hall.name}
                    {hall.is_online && <span className="cat-online-badge">{t('common:status.online')}</span>}
                  </button>
                ))}
                <button className="cat-hall-btn cat-add-hall" onClick={() => setHallModal({ hall: null })}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  {t('catalog:studios.addHall')}
                </button>
              </div>

              {activeHall === null ? (
                /* Studio overview */
                <>
                  {/* Contacts */}
                  <div className="cat-info-row">
                    {activeStudio.phone && (
                      <div className="cat-chip clickable" onClick={() => copyToClipboard(activeStudio.phone!, t('common:toasts.phoneCopied'))}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.92 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                        {activeStudio.phone}
                      </div>
                    )}
                    {activeStudio.email && (
                      <div className="cat-chip clickable" onClick={() => copyToClipboard(activeStudio.email!, t('common:toasts.emailCopied'))}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        {activeStudio.email}
                      </div>
                    )}
                    <div className="cat-chip">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      {activeStudio.address}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="cat-stats-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: '16px' }}>
                    <div className="cat-stat-card">
                      <div className="cat-stat-v">{activeStudio.halls.length}</div>
                      <div className="cat-stat-l">{t('catalog:studios.stats.halls')}</div>
                    </div>
                    <div className="cat-stat-card">
                      <div className="cat-stat-v">{activeStudio.halls.reduce((s, h) => s + h.capacity, 0)}</div>
                      <div className="cat-stat-l">{t('catalog:studios.stats.totalSeats')}</div>
                    </div>
                    <div className="cat-stat-card">
                      <div className="cat-stat-v">
                        {minHourlyRate != null ? `${currency}${(minHourlyRate / 1000).toFixed(1)}K` : '—'}
                      </div>
                      <div className="cat-stat-l">{t('catalog:studios.stats.fromPerHour')}</div>
                    </div>
                  </div>

                  {/* Halls list */}
                  <div className="cat-sec-title" style={{ marginTop: '20px' }}>{t('catalog:studios.hallsTitle')}</div>
                  <div className="cat-halls-list">
                    {activeStudio.halls.map(hall => (
                      <div key={hall.id} className="cat-hall-card" onClick={() => setActiveHallId(hall.id)}>
                        <div className="cat-hall-color" style={{ background: hall.color ?? '#FCAE91' }} />
                        <div className="cat-hall-info">
                          <div className="cat-hall-name">{hall.name}</div>
                          <div className="cat-hall-meta">{hall.capacity} {t('catalog:studios.hall.seats')} · {hall.area} {t('common:units.sqm')}</div>
                        </div>
                        <div className="cat-hall-price">
                          {hall.hourly_rate != null ? `${currency}${hall.hourly_rate.toLocaleString()}${t('common:units.perHour')}` : '—'}
                        </div>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#CCC" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                      </div>
                    ))}
                  </div>

                  {/* Working hours */}
                  <div className="cat-sec-title">{t('catalog:studios.hall.schedule')}</div>
                  <div className="cat-hours-grid">
                    {activeStudio.working_hours.map(wh => (
                      <div key={wh.day_of_week} className={`cat-hours-cell ${wh.is_open ? 'open' : 'closed'}`}>
                        <div className="cat-hours-day">{t(`common:days.short.${DAY_KEYS[wh.day_of_week]}`)}</div>
                        {wh.is_open
                          ? <div className="cat-hours-time">{wh.open_time}<br/>{wh.close_time}</div>
                          : <div className="cat-hours-time closed-txt">{t('catalog:studios.hall.closed')}</div>
                        }
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                /* Hall detail */
                <div className="cat-fade" key={activeHallId}>
                  {activeHall.is_online && (
                    <span className="cat-online-badge" style={{ marginBottom: '12px' }}>{t('common:status.online')}</span>
                  )}
                  <div className="cat-stats-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    <div className="cat-stat-card">
                      <div className="cat-stat-v" style={{ color: activeHall.color ?? '#FCAE91' }}>{activeHall.capacity}</div>
                      <div className="cat-stat-l">{t('catalog:studios.hall.stats.seats')}</div>
                    </div>
                    <div className="cat-stat-card">
                      <div className="cat-stat-v">
                        {activeHall.area != null ? `${activeHall.area} ${t('common:units.sqm')}` : '—'}
                      </div>
                      <div className="cat-stat-l">{t('catalog:studios.hall.stats.area')}</div>
                    </div>
                    <div className="cat-stat-card">
                      <div className="cat-stat-v">
                        {activeHall.hourly_rate != null ? `${currency}${activeHall.hourly_rate.toLocaleString()}` : '—'}
                      </div>
                      <div className="cat-stat-l">{t('catalog:studios.hall.stats.perHour')}</div>
                    </div>
                  </div>

                  <div className="cat-sec-title">{t('catalog:studios.hall.equipment')}</div>
                  <div className="cat-info-row">
                    {(activeHall.equipment ?? []).map(eq => (
                      <div key={eq} className="cat-chip">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={activeHall.color ?? '#FCAE91'} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        {eq}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : branchError ? (
          <CatalogError message={errorMessage(branchError, t)} onRetry={() => refetchBranch()} />
        ) : listError ? (
          <CatalogError message={errorMessage(listError, t)} onRetry={() => refetchList()} />
        ) : (isBranchLoading || (isLoading && studios.length === 0)) ? (
          <CatalogRightSkeleton />
        ) : (
          <div className="cat-empty">
            <div
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                cursor: 'pointer',
                transform: hoverAdd ? 'scale(1.18)' : 'scale(1)',
                transition: 'transform 0.2s ease',
              }}
              onClick={() => setIsAddModalOpen(true)}
              onMouseEnter={() => setHoverAdd(true)}
              onMouseLeave={() => setHoverAdd(false)}
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={hoverAdd ? '#FCAE91' : '#DDD'} strokeWidth="1.2" style={{ transition: 'stroke 0.2s ease', display: 'block' }}>
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              {hoverAdd && (
                <div style={{
                  position: 'absolute',
                  width: '18px',
                  height: '18px',
                  background: '#FCAE91',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 700,
                  lineHeight: 1,
                  boxShadow: '0 2px 8px rgba(252,174,145,0.4)',
                }}>+</div>
              )}
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#1A1A1A' }}>{t('catalog:studios.empty.title')}</div>
            <div style={{ fontSize: '13px', color: '#AAAAAA', marginTop: '4px' }}>{t('catalog:studios.empty.subtitle')}</div>
          </div>
        )}
      </div>
    </div>

    <AddStudioModal
      isOpen={isAddModalOpen}
      onClose={() => setIsAddModalOpen(false)}
      onSuccess={async (data) => {
        try {
          await createBranch({
            name: data.name,
            phone: data.phone || null,
            email: data.email || null,
            country: data.country || null,
            city: data.city || null,
            address: data.address || null,
            photo_url: data.photo_url,
          });
        } catch (error) {
          toast.error(errorMessage(error, t));
          throw error;
        }
        setIsAddModalOpen(false);
        toast.success(t('catalog:studios.toasts.created'));
      }}
    />

    {isEditStudioOpen && activeStudio && (
      <EditBranchModal
        branch={activeStudio}
        onClose={() => setIsEditStudioOpen(false)}
        // Передаем сохранение — эндпоинт updateBranch остается тем же и работает корректно
        onSubmit={async (data) => {
          try {
            await updateBranch(activeStudio.id, data);
            toast.success(t('catalog:studios.toasts.saved'));
          } catch (error) {
            toast.error(errorMessage(error, t));
            throw error; // Бросаем ошибку, чтобы модалка не закрылась и сняла лоадер
          }
        }}
        // Прокидываем удаление: закрываем форму редактирования и открываем окно подтверждения
        onDelete={() => {
          setIsEditStudioOpen(false);
          setConfirmDelete('studio');
        }}
      />
    )}

    {hallModal && (
      <HallModal
        key={hallModal.hall?.id ?? 'new'}
        hall={hallModal.hall}
        onClose={() => setHallModal(null)}
        onSubmit={async (data) => {
          try {
            if (hallModal.hall) {
              await updateHall(hallModal.hall.id, data);
            } else {
              await createHall(data);
            }
            toast.success(t('catalog:studios.toasts.saved'));
          } catch (error) {
            toast.error(errorMessage(error, t));
            throw error;
          }
        }}
      />
    )}

    {confirmDelete === 'studio' && activeStudio && (
      <ConfirmModal
        danger
        title={t('catalog:studios.confirmDeleteTitle')}
        message={t('catalog:studios.confirmDelete', { name: activeStudio.name })}
        onConfirm={doDeleteStudio}
        onClose={() => setConfirmDelete(null)}
      />
    )}

    {confirmDelete === 'hall' && activeHall && (
      <ConfirmModal
        danger
        title={t('catalog:studios.confirmDeleteHallTitle')}
        message={t('catalog:studios.confirmDeleteHall', { name: activeHall.name })}
        onConfirm={doDeleteHall}
        onClose={() => setConfirmDelete(null)}
      />
    )}
    </>
  );
}
