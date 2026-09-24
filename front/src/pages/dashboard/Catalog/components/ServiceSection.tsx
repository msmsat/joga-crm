import { useState, useMemo, useCallback, useEffect, Fragment } from 'react';
import { useAiIntent } from '../../../../hooks/useAiIntent';
import { useTranslation } from 'react-i18next';
import type { Service } from '../types';
import { SCH_TIMES } from '../constants';
import { groupServicesByCategory, serviceCategories } from '../serviceCategories';
import { useServiceList, useServiceWeek } from '../hooks/useCatalogList';
import { useStudioCurrency, useStudioSettings } from '../../../../hooks/useStudioCurrency';
import * as Icons from '../../../../components/Icons';
import { useToast } from '../../../../components/ui/Toast';
import { ConfirmModal } from '../../../../components/ui/ConfirmModal';
import { Button, QrShareModal } from '../../../../components/ui/index';
import { miniappLink } from '../../../../lib/miniapp';
import { usePriceLabel } from '../../../../hooks/usePriceLabel';
import { useDurationLabel } from '../../../../hooks/useDurationLabel';
import { errorMessage } from '../../../../api/errorMessage';
import { getCurrencySymbol } from '../../../../components/UI';
import { ServiceModal } from './modals/EditService';
import { CatalogListSkeleton, CatalogRightSkeleton, CatalogError } from './CatalogSkeleton';

import { ModalShell, ModalHeader, ModalBody } from '../../../../components/ui/modal';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function ServiceSection() {
  const { t } = useTranslation(['catalog', 'common']);
  const toast = useToast();
  // Старые значения-ключи ('yoga') переводятся по ключу, свои категории студии
  // («Стрижка») показываются как есть.
  const tCat = useCallback(
    (cat: string) => t(`catalog:services.categories.${cat}`, { defaultValue: cat }),
    [t]
  );
  const studioCurrency = useStudioCurrency();
  const currency = getCurrencySymbol(studioCurrency);
  // «от–до», пока услугу ведут мастера с разными ценами. Правило записи одно на
  // весь кабинет и живёт в хуке — Каталог его не переизобретает.
  const priceLabel = usePriceLabel();
  const durationLabel = useDurationLabel();
  const { services, isLoading, error: loadError, refetch, createService, updateService, deleteService } = useServiceList();
  // Что выбрал пользователь; пока не выбрал (или выбранная услуга исчезла) —
  // открыта первая. Считаем при рендере, а не эффектом: иначе первый кадр
  // уходил бы пустым.
  const [pickedServiceId, setPickedServiceId] = useState<number>(0);

  useEffect(() => {
    if (loadError) toast.error(errorMessage(loadError, t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadError]);

  const activeService = services.find(s => s.id === pickedServiceId) ?? services[0] ?? null;
  const activeServiceId = activeService?.id ?? 0;
  const { slots: weekSlots } = useServiceWeek(activeService?.id ?? null);

  // null → нет модалки; { service: null } → создание; { service } → редактирование
  const [serviceModal, setServiceModal] = useState<{ service: Service | null; bundle?: boolean } | null>(null);

  // QR услуги ведёт в мини-приложение на раздел записи с уже выбранной услугой:
  // групповая — расписание, отфильтрованное по ней; индивидуальная — список
  // мастеров, которые её делают. Куда именно, решает само приложение по своему
  // каталогу (miniapp/src/pages/shedule.tsx) — печатный код переживёт смену
  // механики услуги, потому что механика в нём не зашита.
  const [showQr, setShowQr] = useState(false);
  const { data: studio } = useStudioSettings();
  // Кода нет у услуги, на которую всё равно нельзя записаться: он вёл бы в
  // пустой список.
  const canShareQr = Boolean(studio?.miniapp_url) && Boolean(activeService?.is_bookable);

  // Группы — по фактическим категориям услуг, «Без категории» последней
  // (порядок и сортировка — serviceCategories.ts, там же тесты). Зашитого
  // перечня направлений больше нет: услуга с любой категорией попадает в левую
  // панель, иначе она исчезала из списка, оставаясь выбранной справа
  // (activeService падает на services[0] без фильтра).
  const groups = useMemo(() => {
    const bundles = services.filter(s => s.bundle_items.length > 0);
    const ordinary = groupServicesByCategory(services.filter(s => !s.bundle_items.length), tCat);
    return [...(bundles.length ? [{ label: 'bundles', items: bundles, bundle: true }] : []),
      ...ordinary.map(g => ({ ...g, bundle: false }))];
  }, [services, tCat]);
  // Тот же набор — в форму услуги: выбор категории строится по тому, что
  // студия уже использует.
  const categories = useMemo(() => serviceCategories(services, tCat), [services, tCat]);

  const [chooseKind, setChooseKind] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Ассистент: ?tab=services&ai=service.create (эпик AI-6, задача 9).
  useAiIntent('service.create', () => setServiceModal({ service: null }));

  const doDeleteService = async () => {
    if (!activeService) return;
    try {
      await deleteService(activeService.id);
      toast.success(t('catalog:services.toasts.deleted'));
    } catch (error) {
      toast.error(errorMessage(error, t));
      throw error; // держим модалку открытой
    }
  };

  // Множество занятых слотов «час:день» реальных занятий этой недели — быстрый lookup для сетки.
  const bookedSlots = useMemo(
    () => new Set(weekSlots.map(s => `${s.hour}:${s.day_of_week}`)),
    [weekSlots]
  );

  return (
    <div className="cat-layout">
      {/* ── LEFT PANEL ───────────────────────────────────────────────────── */}
      <div className="cat-list-panel">
        <div className="cat-panel-hdr">
          <span className="cat-panel-title">{t('catalog:services.title')}</span>
          <button className="cat-add-btn" title={t('catalog:services.addService')} aria-label={t('catalog:services.addService')} onClick={() => setChooseKind(true)}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        {isLoading && services.length === 0 ? <CatalogListSkeleton /> : (
        <div className="cat-list">
          {groups.map(group => (
            <div key={`${group.bundle}:${group.label}`}>
              <div className="cat-sep">{group.bundle ? t("catalog:bundles.title") : tCat(group.label)}</div>
              {group.items.map(svc => (
                <div
                  key={svc.id}
                  className={`cat-item ${svc.id === activeServiceId ? 'active' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={svc.id === activeServiceId}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPickedServiceId(svc.id); } }}
                  onClick={() => setPickedServiceId(svc.id)}
                >
                  <div className="cat-item-dot" style={{ background: svc.color }} />
                  <div className="cat-item-info">
                    <div className="cat-item-name">{svc.name}</div>
                    <div className="cat-item-sub">{priceLabel(svc.price_min, svc.price_max, true)} · {durationLabel(svc.duration_from, svc.duration_to)}</div>
                  </div>
                  <span className={`cat-type-badge ${svc.type}`}>
                    {svc.bundle_items.length ? t('catalog:bundles.badge') : svc.type === 'group' ? t('catalog:services.types.group') : t('catalog:services.types.individual')}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        )}
      </div>

      {/* ── RIGHT PANEL ──────────────────────────────────────────────────── */}
      <div className="cat-right">
        {activeService ? (
          <>
            <div className="cat-hero" style={{ background: `linear-gradient(135deg, ${activeService.color}12, transparent 70%)` }}>
              <div className="cat-hero-actions">
                {canShareQr && (
                  <button
                    className="cat-h-btn"
                    style={{ padding: '8px', gap: 0 }}
                    title={t('common:qr.serviceAction')}
                    aria-label={t('common:qr.serviceAction')}
                    onClick={() => setShowQr(true)}
                  >
                    <Icons.QrCode />
                  </button>
                )}
                <button className="cat-h-btn" onClick={() => setServiceModal({ service: activeService })}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  {t('common:buttons.edit')}
                </button>
                <button className="cat-h-btn del" onClick={() => setConfirmDelete(true)}>
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
                    {activeService.bundle_items.length ? t("catalog:bundles.title") : tCat(activeService.category)}
                    <span className={`cat-hero-type ${activeService.type}`}>
                      {activeService.bundle_items.length ? t('catalog:bundles.badge') : activeService.type === 'group' ? t('catalog:services.types.groupFull') : t('catalog:services.types.individualFull')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="cat-body cat-fade" key={activeServiceId}>
              {/* Stats */}
              <div className="cat-stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))' }}>
                <div className="cat-stat-card">
                  <div className="cat-stat-v">{priceLabel(activeService.price_min, activeService.price_max, true)}</div>
                  {activeService.bundle_full_price != null && <del className="cat-bundle-muted">{priceLabel(activeService.bundle_full_price, activeService.bundle_full_price, true)}</del>}
                  <div className="cat-stat-l">{t('catalog:services.stats.price')}</div>
                </div>
                <div className="cat-stat-card">
                  <div className="cat-stat-v">{durationLabel(activeService.duration_from, activeService.duration_to)}</div>
                  <div className="cat-stat-l">{t('catalog:services.stats.duration')}</div>
                </div>
                <div className="cat-stat-card">
                  <div className="cat-stat-v">{activeService.bookings_total}</div>
                  <div className="cat-stat-l">{t('catalog:services.stats.bookings')}</div>
                </div>
                <div className="cat-stat-card">
                  <div className="cat-stat-v">{currency}{(activeService.revenue_total / 1000).toFixed(0)}K</div>
                  <div className="cat-stat-l">{t('catalog:services.stats.revenue')}</div>
                </div>
              </div>

              {activeService.bundle_items.length > 0 && <>
                <div className="cat-sec-title">{t('catalog:bundles.parts')}</div>
                <div className="cat-bundle-parts">
                  {activeService.bundle_items.map((part, index) => <Button key={part.service_id} variant="ghost" fullWidth onClick={() => setPickedServiceId(part.service_id)}>
                    <span className="cat-bundle-part-name">{index + 1}. {part.name}</span>
                    <span className="cat-bundle-muted">{part.duration_min} {t('common:units.min')} · {priceLabel(part.price_min, part.price_max, true)}</span>
                  </Button>)}
                </div>
                <p className="cat-bundle-muted">{t('catalog:bundles.hint')}</p>
              </>}
              {activeService.in_bundles.length > 0 && <>
                <div className="cat-sec-title">{t('catalog:bundles.inBundles')}</div>
                <div className="cat-info-row">{activeService.in_bundles.map(bundle => <Button key={bundle.id} size="sm" variant="ghost" onClick={() => setPickedServiceId(bundle.id)}>{bundle.name}</Button>)}</div>
              </>}
              {activeService.masters.length > 0 && <>
                <div className="cat-sec-title">{t('catalog:bundles.masters')}</div>
                <div className="cat-info-row">{activeService.masters.map(master => <div className="cat-chip" key={master.user_id}>{master.name} · {priceLabel(master.price, master.price, true)} · {durationLabel(master.duration_min ?? activeService.duration_min)}</div>)}</div>
              </>}
              {activeService.bundle_items.length > 0 && activeService.masters.length === 0 && <p className="cat-bundle-muted">{t('catalog:bundles.noMasters')}</p>}
              {/* Description */}
              <div className="cat-sec-title">{t('catalog:services.details.description')}</div>
              <p className="cat-description">{activeService.description}</p>

              {/* Details chips */}
              <div className="cat-sec-title">{t('catalog:services.details.details')}</div>
              <div className="cat-info-row">
                <div className="cat-chip">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  {activeService.duration_to > activeService.duration_from
                    ? durationLabel(activeService.duration_from, activeService.duration_to)
                    : `${activeService.duration_min} ${t('catalog:services.details.minutes')}`}
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
                  {activeService.bookings_last_30d} {t('catalog:services.details.bookingsPerMonth')}
                </div>
                <div className="cat-chip" style={{ background: `${activeService.color}10`, borderColor: `${activeService.color}30`, color: activeService.color }}>
                  {activeService.bundle_items.length ? t("catalog:bundles.title") : tCat(activeService.category)}
                </div>
              </div>

              {/* Schedule grid — реальные занятия текущей недели; нет занятий — секции нет */}
              {weekSlots.length > 0 && (
                <>
                  <div className="cat-sec-title">{t('catalog:services.details.schedule')}</div>
                  <div className="cat-sch-wrap">
                    <div className="cat-sch-grid">
                      <div className="cat-sch-head" />
                      {DAY_KEYS.map(dk => <div key={dk} className="cat-sch-head">{t(`common:days.short.${dk}`)}</div>)}
                      {SCH_TIMES.map((time, ti) => {
                        const hour = Number(time.split(':')[0]);
                        return (
                          // Fragment, а не <>: ключ строки нужен самому элементу
                          // списка, короткий синтаксис его не принимает.
                          <Fragment key={time}>
                            <div className="cat-sch-time">{time}</div>
                            {[0,1,2,3,4,5,6].map(di => {
                              const booked = bookedSlots.has(`${hour}:${di}`);
                              return (
                                <div
                                  key={`${ti}-${di}`}
                                  className={`cat-sch-cell ${booked ? 'booked' : ''}`}
                                  style={booked ? { background: activeService.color } : undefined}
                                />
                              );
                            })}
                          </Fragment>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        ) : loadError ? (
          <CatalogError message={errorMessage(loadError, t)} onRetry={() => refetch()} />
        ) : isLoading && services.length === 0 ? (
          <CatalogRightSkeleton />
        ) : (
          <div className="cat-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#DDD" strokeWidth="1.2" style={{ marginBottom: '16px' }}><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--onyx)' }}>{t('catalog:services.empty.title')}</div>
            <div style={{ fontSize: '13px', color: '#AAAAAA', marginTop: '4px' }}>{t('catalog:services.empty.subtitle')}</div>
          </div>
        )}
      </div>

      {chooseKind && <ModalShell onClose={() => setChooseKind(false)}>
        <ModalHeader title={t('catalog:services.addService')} />
        <ModalBody><div className="cat-bundle-parts">
          <Button variant="ghost" fullWidth onClick={() => { setChooseKind(false); setServiceModal({ service: null }); }}>{t('catalog:modals.service.titleNew')}</Button>
          <Button fullWidth onClick={() => { setChooseKind(false); setServiceModal({ service: null, bundle: true }); }}>{t('catalog:bundles.create')}</Button>
          <p className="cat-bundle-muted">{t('catalog:bundles.hint')}</p>
        </div></ModalBody>
      </ModalShell>}
      {serviceModal && (
        <ServiceModal
          key={serviceModal.service?.id ?? 'new'}
          service={serviceModal.service}
          categories={categories}
          services={services}
          bundle={serviceModal.bundle}
          onClose={() => setServiceModal(null)}
          onSubmit={async (data) => {
            try {
              if (serviceModal.service) {
                await updateService(serviceModal.service.id, data);
              } else {
                const created = await createService(data);
                setPickedServiceId(created.id);
              }
              toast.success(t('catalog:services.toasts.saved'));
            } catch (error) {
              toast.error(errorMessage(error, t));
              throw error;
            }
          }}
        />
      )}

      {showQr && activeService && (
        <QrShareModal
          url={miniappLink(studio?.miniapp_url ?? '', { tab: 'sched', service: activeService.id })}
          kicker={studio?.name}
          title={activeService.name}
          subtitle={[
            activeService.type === 'group'
              ? t('catalog:services.types.groupFull')
              : t('catalog:services.types.individualFull'),
            durationLabel(activeService.duration_from, activeService.duration_to),
            priceLabel(activeService.price_min, activeService.price_max),
          ].join(' · ')}
          caption={t('common:qr.scanHint')}
          fileName={activeService.name}
          onClose={() => setShowQr(false)}
        />
      )}

      {confirmDelete && activeService && (
        <ConfirmModal
          danger
          title={t('catalog:services.confirmDeleteTitle')}
          message={t('catalog:services.confirmDelete', { name: activeService.name })}
          onConfirm={doDeleteService}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
