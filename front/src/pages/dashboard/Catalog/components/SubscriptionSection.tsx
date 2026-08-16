import { useState } from 'react';
import { useAiIntent } from '../../../../hooks/useAiIntent';
import { useTranslation } from 'react-i18next';
import { usePackageList, useSubscriptionConfig } from '../hooks/useSubscriptions';
import { useStudioCurrency } from '../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../components/UI';
import { useToast } from '../../../../components/ui/Toast';
import { ConfirmModal } from '../../../../components/ui/ConfirmModal';
import { CatalogListSkeleton, CatalogError } from './CatalogSkeleton';
import { errorMessage } from '../../../../api/errorMessage';
import { PackageModal } from './modals/EditPackage';
import type { SubscriptionPackage, SubscriptionProgramConfig } from '../../../../api/catalog/catalog.types';

const PUNCH_LIMIT = 14; // как в превью модалки: больше точек в пропуск не влезает

// allow_transfer/auto_renewal возвращены в V5-7 (Блок 4.1/4.2) — логика заведена.
const SETTINGS: { key: keyof Omit<SubscriptionProgramConfig, 'is_enabled'>; labelKey: string }[] = [
  { key: 'allow_freeze', labelKey: 'catalog:subscriptions.settings.allowFreeze' },
  { key: 'allow_transfer', labelKey: 'catalog:subscriptions.settings.allowTransfer' },
  { key: 'auto_renewal', labelKey: 'catalog:subscriptions.settings.autoRenewal' },
];

export function SubscriptionSection() {
  const { t } = useTranslation(['catalog', 'common']);
  const toast = useToast();
  const currency = getCurrencySymbol(useStudioCurrency());
  const { packages, isLoading, error, refetch, createPackage, updatePackage, deletePackage, restorePackage } = usePackageList();
  const { config, updateConfig } = useSubscriptionConfig();

  // null → нет модалки; { pkg: null } → создание; { pkg } → редактирование
  const [packageModal, setPackageModal] = useState<{ pkg: SubscriptionPackage | null } | null>(null);
  // Пакет, для которого спрашиваем подтверждение снятия с продажи (null → не спрашиваем).
  const [confirmDeactivate, setConfirmDeactivate] = useState<SubscriptionPackage | null>(null);

  // Ассистент: ?tab=subscriptions&ai=package.create (эпик AI-6, задача 9).
  useAiIntent('package.create', () => setPackageModal({ pkg: null }));

  const doDeactivate = async () => {
    if (!confirmDeactivate) return;
    try {
      await deletePackage(confirmDeactivate.id);
      toast.success(t('catalog:subscriptions.toasts.deactivated'));
    } catch (error) {
      toast.error(errorMessage(error, t));
      throw error; // держим модалку открытой
    }
  };

  const doRestore = async (pkg: SubscriptionPackage) => {
    try {
      await restorePackage(pkg.id);
      toast.success(t('catalog:subscriptions.toasts.restored'));
    } catch (error) {
      toast.error(errorMessage(error, t));
    }
  };

  if (error) return <CatalogError message={errorMessage(error, t)} onRetry={() => refetch()} />;
  if (isLoading && packages.length === 0) return <CatalogListSkeleton />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingBottom: '4px' }}>
        <span className="cat-panel-title">{t('catalog:subscriptions.title')}</span>
        
        <button 
          onClick={() => setPackageModal({ pkg: null })}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '6px 16px 6px 6px', 
            background: 'var(--bg-card)',
            border: '1px solid rgba(var(--ink),0.06)',
            borderRadius: '999px',
            color: 'var(--onyx)',
            fontSize: '13px', fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(26,26,26,0.03)',
            transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(var(--ink),0.15)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(var(--ink),0.08)';
            // Убрали translateY, кнопка визуально "приподнимается" только за счет глубокой тени
            e.currentTarget.style.transform = 'scale(1)'; 
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(var(--ink),0.06)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(26,26,26,0.03)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'} // Мягкое нажатие внутрь
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'} // Возврат в исходное положение без прыжка вверх
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '24px', height: '24px', borderRadius: '50%',
            background: 'rgba(252,174,145,0.18)',
            color: '#F07B60',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          
          {t('catalog:subscriptions.addPackage', { defaultValue: 'Добавить абонемент' })}
        </button>
      </div>

      {packages.length === 0 ? (
        <div className="cat-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#DDD" strokeWidth="1.2" style={{ marginBottom: '16px' }}>
            <rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/>
          </svg>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--onyx)' }}>{t('catalog:subscriptions.empty.title')}</div>
          <button className="cat-action-btn" style={{ marginTop: '16px' }} onClick={() => setPackageModal({ pkg: null })}>
            {t('catalog:subscriptions.empty.cta')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: '16px' }}>
          {packages.map(pkg => {
            const punches = Math.min(pkg.class_count, PUNCH_LIMIT);
            return (
              <div key={pkg.id} className="sub-card">
                <div
                  className={`cmod-pass${pkg.is_active ? '' : ' is-off'}`}
                  onClick={() => setPackageModal({ pkg })}
                >
                  <div className="cmod-pass-kind">
                    {pkg.is_active
                      ? t('catalog:modals.package.previewKind')
                      : t('catalog:subscriptions.card.inactiveBadge')}
                  </div>
                  <div className="cmod-pass-name">{pkg.name}</div>
                  <div className="cmod-pass-price">{currency}{pkg.price.toLocaleString()}</div>
                  <div className="cmod-punch">
                    {Array.from({ length: punches }, (_, i) => (
                      <b key={i} style={{ animationDelay: `${i * 28}ms` }} />
                    ))}
                    {pkg.class_count > PUNCH_LIMIT && <span>+{pkg.class_count - PUNCH_LIMIT}</span>}
                  </div>
                  <div className="cmod-pass-perf" />
                  <div className="cmod-pass-foot">
                    <div>
                      <small>{t('catalog:modals.package.perVisitPrice')}</small>
                      {pkg.per_visit_price > 0 ? `${currency}${pkg.per_visit_price.toLocaleString()}` : '—'}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <small>{t('catalog:modals.package.previewValid')}</small>
                      {t('catalog:subscriptions.card.duration', { count: pkg.duration_days })}
                    </div>
                  </div>
                </div>

                <div className="sub-card-foot">
                  <span className="cat-chip">
                    {pkg.service_ids == null || pkg.service_ids.length === 0
                      ? t('catalog:subscriptions.card.allServices')
                      : t('catalog:subscriptions.card.serviceCount', { count: pkg.service_ids.length })}
                  </span>
                  <button
                    className="cat-action-btn"
                    onClick={() => (pkg.is_active ? setConfirmDeactivate(pkg) : doRestore(pkg))}
                  >
                    {pkg.is_active ? t('catalog:subscriptions.deactivate') : t('catalog:subscriptions.restore')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div>
        <div className="cat-sec-title">{t('catalog:subscriptions.settings.title')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {SETTINGS.map(({ key, labelKey }) => {
            const checked = config?.[key] ?? false;
            return (
              <label
                key={key}
                onClick={() => updateConfig({ [key]: !checked } as Partial<SubscriptionProgramConfig>)}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{
                  width: '34px', height: '20px', borderRadius: '10px', flexShrink: 0, position: 'relative',
                  background: checked ? '#FCAE91' : 'rgba(var(--ink),0.15)', transition: 'background 0.18s',
                }}>
                  <span style={{
                    position: 'absolute', top: '2px', left: checked ? '16px' : '2px',
                    width: '16px', height: '16px', borderRadius: '50%', background: 'var(--bg-card)', transition: 'left 0.18s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--onyx)' }}>{t(labelKey)}</span>
              </label>
            );
          })}
        </div>
      </div>

      {packageModal && (
        <PackageModal
          key={packageModal.pkg?.id ?? 'new'}
          pkg={packageModal.pkg}
          onClose={() => setPackageModal(null)}
          onSubmit={async (data) => {
            try {
              if (packageModal.pkg) {
                await updatePackage(packageModal.pkg.id, data);
                toast.success(t('catalog:subscriptions.toasts.saved'));
              } else {
                await createPackage(data);
                toast.success(t('catalog:subscriptions.toasts.created'));
              }
            } catch (error) {
              toast.error(errorMessage(error, t));
              throw error;
            }
          }}
        />
      )}

      {confirmDeactivate && (
        <ConfirmModal
          danger
          title={t('catalog:subscriptions.confirmDeactivateTitle')}
          message={t('catalog:subscriptions.confirmDeactivate')}
          confirmText={t('catalog:subscriptions.deactivate')}
          onConfirm={doDeactivate}
          onClose={() => setConfirmDeactivate(null)}
        />
      )}
    </div>
  );
}
