import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePackageList, useSubscriptionConfig } from '../hooks/useSubscriptions';
import { useStudioCurrency } from '../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../components/UI';
import { useToast } from '../../../../components/ui/Toast';
import { ConfirmModal } from '../../../../components/ui/ConfirmModal';
import { CatalogListSkeleton, CatalogError } from './CatalogSkeleton';
import { errorMessage } from '../../../../api/errorMessage';
import { PackageModal } from './modals/EditPackage';
import type { SubscriptionPackage, SubscriptionProgramConfig } from '../../../../api/catalog/catalog.types';

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="cat-panel-title">{t('catalog:subscriptions.title')}</span>
        <button className="cat-add-btn" title={t('catalog:subscriptions.addPackage')} onClick={() => setPackageModal({ pkg: null })}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      {packages.length === 0 ? (
        <div className="cat-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#DDD" strokeWidth="1.2" style={{ marginBottom: '16px' }}>
            <rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/>
          </svg>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#1A1A1A' }}>{t('catalog:subscriptions.empty.title')}</div>
          <button className="cat-action-btn" style={{ marginTop: '16px' }} onClick={() => setPackageModal({ pkg: null })}>
            {t('catalog:subscriptions.empty.cta')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
          {packages.map(pkg => (
            <div
              key={pkg.id}
              onClick={() => setPackageModal({ pkg })}
              style={{
                padding: '20px', borderRadius: '16px',
                border: '1px solid rgba(26,26,26,0.08)',
                background: pkg.is_active ? '#FFFFFF' : 'rgba(26,26,26,0.02)',
                opacity: pkg.is_active ? 1 : 0.7,
                display: 'flex', flexDirection: 'column', gap: '10px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#1A1A1A' }}>{pkg.name}</div>
                {!pkg.is_active && (
                  <span style={{
                    padding: '3px 9px', borderRadius: '20px', flexShrink: 0,
                    background: 'rgba(216,140,154,0.15)', color: '#B4677A',
                    fontSize: '10.5px', fontWeight: 700,
                  }}>
                    {t('catalog:subscriptions.card.inactiveBadge')}
                  </span>
                )}
              </div>

              <div style={{ fontSize: '22px', fontWeight: 800, color: '#FCAE91' }}>
                {currency}{pkg.price.toLocaleString()}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '12px', color: '#888' }}>
                <span className="cat-chip">{t('catalog:subscriptions.card.classCount', { count: pkg.class_count })}</span>
                <span className="cat-chip">{t('catalog:subscriptions.card.duration', { count: pkg.duration_days })}</span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {pkg.service_ids == null || pkg.service_ids.length === 0 ? (
                  <span className="cat-chip">{t('catalog:subscriptions.card.allServices')}</span>
                ) : (
                  <span className="cat-chip">{t('catalog:subscriptions.card.serviceCount', { count: pkg.service_ids.length })}</span>
                )}
              </div>

              <button
                className="cat-action-btn"
                style={{ marginTop: '4px' }}
                onClick={e => {
                  e.stopPropagation();
                  if (pkg.is_active) setConfirmDeactivate(pkg);
                  else doRestore(pkg);
                }}
              >
                {pkg.is_active ? t('catalog:subscriptions.deactivate') : t('catalog:subscriptions.restore')}
              </button>
            </div>
          ))}
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
                  background: checked ? '#FCAE91' : 'rgba(26,26,26,0.15)', transition: 'background 0.18s',
                }}>
                  <span style={{
                    position: 'absolute', top: '2px', left: checked ? '16px' : '2px',
                    width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.18s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A1A1A' }}>{t(labelKey)}</span>
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
