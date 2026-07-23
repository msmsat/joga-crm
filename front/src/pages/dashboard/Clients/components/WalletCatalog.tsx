import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { loyaltyApi } from '../../../../api/loyalty/loyalty.api';
import { checkoutApi } from '../../../../api/checkout';
import { catalogApi } from '../../../../api/catalog/catalog.api';
import { queryKeys } from '../../../../api/queryKeys';
import { Card, Button } from '../../../../components/ui/index';
import { useStudioCurrency } from '../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../components/UI';
import type { CheckoutProductType } from '../../../../api/checkout';
import type { SubscriptionPackage } from '../../../../api/loyalty/loyalty.types';
import s from './WalletTab.module.css';

function SubscriptionIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M2 6.5H14" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5 9.5H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function SingleVisitIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 2.5H11L13 4.5V13.5H3V2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M5.5 7H10.5M5.5 9.5H10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 2"/>
    </svg>
  );
}

const VISIBLE_THRESHOLD = 4;

type CatalogTab = 'subscriptions' | 'singles';

// Каталог кассы (CL-6.8, CL-7.4): выбор продукта открывает POS (WalletPOS).
// Абонементы и разовые — те же пакеты каталога, разница только в цене
// (price/per_visit_price), разложены по верхним табам вместо двух секций.
export function WalletCatalog({ onBack, onSelect }: {
  onBack: () => void;
  onSelect: (productId: number, type: CheckoutProductType) => void;
}) {
  const { t } = useTranslation('clients');
  const currency = getCurrencySymbol(useStudioCurrency());

  const [catalogTab, setCatalogTab] = useState<CatalogTab>('subscriptions');
  const [showAll, setShowAll] = useState(false);
  const isSubs = catalogTab === 'subscriptions';

  const { data: packages = [], isLoading: packagesLoading } = useQuery({
    queryKey: queryKeys.packages,
    queryFn: () => loyaltyApi.getSubscriptionPackages(),
    enabled: isSubs,
  });
  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: queryKeys.checkoutServices,
    queryFn: () => checkoutApi.getServices(),
    enabled: !isSubs,
  });
  const { data: subscriptionConfig, isLoading: configLoading } = useQuery({
    queryKey: queryKeys.subscriptionConfig,
    queryFn: () => catalogApi.getSubscriptionConfig(),
    enabled: isSubs,
  });
  const isLoading = isSubs ? (packagesLoading || configLoading) : servicesLoading;
  const subscriptionsDisabled = isSubs && !subscriptionConfig?.is_enabled;

  // «Абонементы» — пакеты лояльности (владелец настраивает в Лояльность →
  // Абонементы). «Разовые визиты» — реальные услуги Каталога, не пакеты.
  const subsFiltered = packages.filter((p: SubscriptionPackage) => p.is_active && p.sold_as_subscription);
  const tabFiltered = isSubs ? subsFiltered : services;
  const listEmpty = subscriptionsDisabled || (isSubs ? subsFiltered.length === 0 : services.length === 0);
  const visible = showAll ? tabFiltered : tabFiltered.slice(0, VISIBLE_THRESHOLD);

  return (
    <div style={{ animation: 'fadeSlide 0.2s ease both' }}>
      <div className={s.backRow}>
        <Button size="sm" variant="ghost" onClick={onBack}>{t('panel.wallet.back')}</Button>
        <div className={s.sectionLabel}>{t('panel.wallet.catalogTitle')}</div>
      </div>

      <div className={s.tabRow}>
        <button type="button" className={isSubs ? s.tabActive : s.tab}
          onClick={() => { setCatalogTab('subscriptions'); setShowAll(false); }}>
          {t('panel.wallet.subscriptions')}
        </button>
        <button type="button" className={!isSubs ? s.tabActive : s.tab}
          onClick={() => { setCatalogTab('singles'); setShowAll(false); }}>
          {t('panel.wallet.singles')}
        </button>
      </div>

      {isLoading && <CatalogSkeleton/>}

      {!isLoading && (
        <>
          {listEmpty ? (
            <Card padding={0}>
              <div className={s.emptyCard}>
                <div className={s.emptyCardIcon}><EmptyIcon/></div>
                <div className={s.emptyCardText}>
                  {t(subscriptionsDisabled ? 'panel.wallet.subscriptionsDisabled' : isSubs ? 'panel.wallet.emptyCatalog' : 'panel.wallet.noSingles')}
                </div>
              </div>
            </Card>
          ) : isSubs ? (
            <div className={s.list}>
              {(visible as SubscriptionPackage[]).map(pkg => (
                <ProductCard key={`sub-${pkg.id}`} name={pkg.name} priceLabel={`${currency}${pkg.price}`}
                  subLabel={t('panel.wallet.lessonsCount', { count: pkg.class_count })}
                  icon={<SubscriptionIcon/>}
                  onClick={() => onSelect(pkg.id, 'subscription')}/>
              ))}
            </div>
          ) : (
            <div className={s.list}>
              {(visible as typeof services).map(svc => (
                <ProductCard key={`single-${svc.id}`} name={svc.name} priceLabel={`${currency}${svc.price}`}
                  subLabel={t('panel.wallet.perVisit')}
                  icon={<SingleVisitIcon/>}
                  onClick={() => onSelect(svc.id, 'single')}/>
              ))}
            </div>
          )}

          {!showAll && tabFiltered.length > VISIBLE_THRESHOLD && (
            <Button variant="ghost" fullWidth style={{ marginTop: '10px' }} onClick={() => setShowAll(true)}>
              {t('panel.wallet.showAll')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div>
      <div className={s.skeletonCard}/>
      <div className={s.skeletonCard}/>
      <div className={s.skeletonCard}/>
    </div>
  );
}

function ProductCard({ name, priceLabel, subLabel, icon, onClick }: {
  name: string; priceLabel: string; subLabel: string; icon: React.ReactNode; onClick: () => void;
}) {
  return (
    <Card padding={14} hover onClick={onClick}>
      <div className={s.productCard}>
        <div className={s.productIcon}>{icon}</div>
        <div className={s.productCardRow}>
          <div className={s.productCardInfo}>
            <div className={s.productCardTitle}>{name}</div>
            <div className={s.productCardMeta}>{subLabel}</div>
          </div>
          <div className={s.productCardPrice}>{priceLabel}</div>
        </div>
      </div>
    </Card>
  );
}
