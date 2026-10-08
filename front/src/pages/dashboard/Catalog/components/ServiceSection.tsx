import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAiIntent } from '../../../../hooks/useAiIntent';
import { useTranslation } from 'react-i18next';
import type { Service } from '../types';
import { groupServicesByCategory, serviceCategories } from '../serviceCategories';
import { useServiceList, useServicesWeek } from '../hooks/useCatalogList';
import { useStudioSettings } from '../../../../hooks/useStudioCurrency';
import { useToast } from '../../../../components/ui/Toast';
import { ConfirmModal } from '../../../../components/ui/ConfirmModal';
import { Button, EmptyState, QrShareModal } from '../../../../components/ui/index';
import * as Icons from '../../../../components/Icons';
import { miniappLink } from '../../../../lib/miniapp';
import { usePriceLabel } from '../../../../hooks/usePriceLabel';
import { useDurationLabel } from '../../../../hooks/useDurationLabel';
import { errorMessage } from '../../../../api/errorMessage';
import { ServiceModal } from './modals/EditService';
import { CatalogListSkeleton, CatalogRightSkeleton, CatalogError } from './CatalogSkeleton';
import { ServiceCard } from './service/ServiceCard';
import { ServiceSwitcher, type ServiceGroup } from './service/ServiceSwitcher';

import { ModalShell, ModalHeader, ModalBody } from '../../../../components/ui/modal';

export function ServiceSection() {
  const { t } = useTranslation(['catalog', 'common']);
  const toast = useToast();
  // Старые значения-ключи ('yoga') переводятся по ключу, свои категории студии
  // («Стрижка») показываются как есть.
  const tCat = useCallback(
    (cat: string) => t(`catalog:services.categories.${cat}`, { defaultValue: cat }),
    [t]
  );
  // «от–до», пока услугу ведут мастера с разными ценами. Правило записи одно на
  // весь кабинет и живёт в хуке — Каталог его не переизобретает.
  const priceLabel = usePriceLabel();
  const durationLabel = useDurationLabel();
  const { services, isLoading, error: loadError, refetch, createService, updateService, deleteService } = useServiceList();
  const { slots: weekSlots, isLoading: weekLoading } = useServicesWeek();
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
  const activeWeek = useMemo(
    () => weekSlots.filter(slot => slot.service_id === activeServiceId),
    [weekSlots, activeServiceId]
  );
  // Доля услуги в записях студии считается от этой суммы (карточка, «Записи и выручка»).
  const studioBookings30 = useMemo(() => services.reduce((sum, s) => sum + s.bookings_last_30d, 0), [services]);

  // null → нет модалки; { service: null } → создание; { service } → редактирование
  const [serviceModal, setServiceModal] = useState<{ service: Service | null; bundle?: boolean } | null>(null);

  // QR услуги ведёт в мини-приложение на раздел записи с уже выбранной услугой:
  // групповая — расписание, отфильтрованное по ней; индивидуальная — список
  // мастеров, которые её делают. Куда именно, решает само приложение по своему
  // каталогу (miniapp/src/pages/shedule.tsx) — печатный код переживёт смену
  // механики услуги, потому что механика в нём не зашита.
  const [showQr, setShowQr] = useState(false);
  const { data: studio } = useStudioSettings();
  const hasMiniapp = Boolean(studio?.miniapp_url);
  // Кода нет у услуги, на которую всё равно нельзя записаться: он вёл бы в
  // пустой список.
  const canShareQr = hasMiniapp && Boolean(activeService?.is_bookable);

  // Группы — по фактическим категориям услуг, «Без категории» последней
  // (порядок и сортировка — serviceCategories.ts, там же тесты). Зашитого
  // перечня направлений больше нет: услуга с любой категорией попадает в левую
  // панель, иначе она исчезала из списка, оставаясь выбранной справа
  // (activeService падает на services[0] без фильтра).
  const groups = useMemo<(ServiceGroup & { bundle: boolean })[]>(() => {
    const bundles = services.filter(s => s.bundle_items.length > 0);
    const ordinary = groupServicesByCategory(services.filter(s => !s.bundle_items.length), tCat);
    return [
      ...(bundles.length ? [{ key: 'bundles', label: t('catalog:bundles.title'), items: bundles, bundle: true }] : []),
      ...ordinary.map(g => ({ key: `cat:${g.label}`, label: tCat(g.label), items: g.items, bundle: false })),
    ];
  }, [services, tCat, t]);
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

  const formatLabel = (svc: Service) => svc.bundle_items.length
    ? t('catalog:bundles.badge')
    : svc.type === 'group' ? t('catalog:services.card.group') : t('catalog:services.card.individual');
  const categoryLabel = (svc: Service) => svc.bundle_items.length ? t('catalog:bundles.title') : tCat(svc.category);

  return (
    <div className="cat-layout svc-layout">
      {/* ── LEFT PANEL (на ≤900px его место — переключатель в карточке) ───── */}
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
            <div key={group.key}>
              <div className="cat-sep">{group.label}</div>
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
      <div className="cat-right svc-right" style={activeService ? { ['--svc' as string]: activeService.color } : undefined}>
        {activeService ? (
          <>
            <div className="svc-switch-wrap">
              <ServiceSwitcher
                active={activeService}
                subtitle={`${categoryLabel(activeService)} · ${formatLabel(activeService)}`}
                groups={groups}
                onPick={setPickedServiceId}
                onAdd={() => setChooseKind(true)}
              />
            </div>
            <ServiceCard
              service={activeService}
              categoryLabel={categoryLabel(activeService)}
              studioBookings30={studioBookings30}
              hasMiniapp={hasMiniapp}
              canShareQr={canShareQr}
              weekSlots={activeWeek}
              weekLoading={weekLoading}
              onPick={setPickedServiceId}
              onEdit={() => setServiceModal({ service: activeService })}
              onDelete={() => setConfirmDelete(true)}
              onQr={() => setShowQr(true)}
            />
          </>
        ) : loadError ? (
          <CatalogError message={errorMessage(loadError, t)} onRetry={() => refetch()} />
        ) : isLoading && services.length === 0 ? (
          <CatalogRightSkeleton />
        ) : (
          // Кнопка здесь, а не только «+» списка: на телефоне списка нет.
          <div className="cat-empty">
            <EmptyState
              title={t('catalog:services.empty.title')}
              text={t('catalog:services.empty.subtitle')}
              action={<Button icon={<Icons.Plus />} onClick={() => setChooseKind(true)}>{t('catalog:services.addService')}</Button>}
            />
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
          // types.groupFull начинается с « · » (так он дописывается к категории),
          // и в этом списке давал двойной разделитель в начале строки плаката.
          subtitle={[
            formatLabel(activeService),
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
