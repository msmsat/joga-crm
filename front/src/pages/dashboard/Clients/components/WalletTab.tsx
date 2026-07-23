import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useClientWallet } from '../hooks/useClientsList';
import { formatDate } from '../utils/mapClient';
import { catalogApi } from '../../../../api/catalog/catalog.api';
import { queryKeys } from '../../../../api/queryKeys';
import { Card, Button } from '../../../../components/ui/index';
import { WalletCatalog } from './WalletCatalog';
import { WalletPOS } from './WalletPOS';
import { TransferSubscriptionModal } from './modals/TransferSubscriptionModal';
import type { WalletSubscription } from '../../../../api/clients/clients.types';
import type { CheckoutProductType } from '../../../../api/checkout';
import s from './WalletTab.module.css';

/** allow_transfer — тот же конфиг, что читает страница Каталог (owner-only, 403 для admin проглатывается). */
function useTransferEnabled() {
  const { data } = useQuery({
    queryKey: queryKeys.subscriptionConfig,
    queryFn: () => catalogApi.getSubscriptionConfig(),
    retry: false,
  });
  return data?.allow_transfer ?? false;
}

function SubscriptionIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M2 6.5H14" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5 9.5H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
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

type WalletMode = 'view' | 'catalog' | 'pos';

// Вкладка «Покупки» (CL-6.6/6.8, CL-7.3) — верхний ряд Активные/Архив/Купить,
// под ним один список. Купить → каталог → POS. Локальный стейт режима
// переключает панель между тремя экранами внутри одной вкладки, без роутинга.
export function WalletTab({ clientId, enabled }: { clientId: number; enabled: boolean }) {
  const { t } = useTranslation('clients');
  const { wallet, isLoading } = useClientWallet(clientId, enabled);

  const [mode, setMode] = useState<WalletMode>('view');
  const [selected, setSelected] = useState<{ productId: number; type: CheckoutProductType } | null>(null);
  const [activeList, setActiveList] = useState<'active' | 'archived'>('active');
  const [transferSub, setTransferSub] = useState<WalletSubscription | null>(null);
  const transferEnabled = useTransferEnabled();

  if (mode === 'catalog') {
    return (
      <WalletCatalog
        onBack={() => setMode('view')}
        onSelect={(productId, type) => { setSelected({ productId, type }); setMode('pos'); }}
      />
    );
  }

  if (mode === 'pos' && selected) {
    return (
      <WalletPOS
        clientId={clientId}
        productId={selected.productId}
        productType={selected.type}
        onBack={() => setMode('catalog')}
        onPaid={() => { setSelected(null); setMode('view'); }}
      />
    );
  }

  return (
    <div style={{ animation: 'fadeSlide 0.2s ease both' }}>
      <div className={s.sectionHeader}>
        <div className={s.tabRowInline}>
          <button type="button" className={activeList === 'active' ? s.tabActive : s.tab} onClick={() => setActiveList('active')}>
            {t('panel.wallet.active')}
          </button>
          <button type="button" className={activeList === 'archived' ? s.tabActive : s.tab} onClick={() => setActiveList('archived')}>
            {t('panel.wallet.archived')}
          </button>
        </div>
        <Button size="sm" variant="primary" onClick={() => setMode('catalog')}>{t('panel.wallet.buy')}</Button>
      </div>

      {isLoading && <WalletSkeleton/>}

      {!isLoading && wallet && (
        activeList === 'active'
          ? <WalletList items={wallet.active} emptyText={t('panel.wallet.emptyActive')} t={t}
                        onTransfer={transferEnabled ? setTransferSub : undefined}/>
          : <WalletList items={wallet.archived} emptyText={t('panel.wallet.emptyArchived')} t={t}/>
      )}

      {transferSub && (
        <TransferSubscriptionModal clientId={clientId} sub={transferSub} onClose={() => setTransferSub(null)}/>
      )}
    </div>
  );
}

function WalletSkeleton() {
  return (
    <div>
      <div className={s.skeletonCard}/>
      <div className={s.skeletonCard}/>
      <div className={s.skeletonCard}/>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <Card padding={0}>
      <div className={s.emptyCard}>
        <div className={s.emptyCardIcon}><EmptyIcon/></div>
        <div className={s.emptyCardText}>{text}</div>
      </div>
    </Card>
  );
}

function WalletList({ items, emptyText, t, onTransfer }: {
  items: WalletSubscription[];
  emptyText: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onTransfer?: (sub: WalletSubscription) => void;
}) {
  return items.length === 0 ? (
    <EmptyCard text={emptyText}/>
  ) : (
    <div className={s.list}>
      {items.map(sub => <WalletCard key={sub.id} sub={sub} t={t} onTransfer={onTransfer}/>)}
    </div>
  );
}

function WalletCard({ sub, t, onTransfer }: {
  sub: WalletSubscription;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onTransfer?: (sub: WalletSubscription) => void;
}) {
  const progress = sub.total_classes > 0 ? Math.min(100, Math.round((sub.used_classes / sub.total_classes) * 100)) : 0;
  return (
    <Card padding={14}>
      <div className={s.walletCard}>
        <div className={s.productIcon}><SubscriptionIcon/></div>
        <div className={s.walletCardRow}>
          <div className={s.walletCardInfo}>
            <div className={s.walletCardTitle}>{sub.type}</div>
            <div className={s.walletCardMeta}>
              {t('panel.wallet.lessons', { remaining: sub.remaining, total: sub.total_classes })} · {t('panel.wallet.until', { date: formatDate(sub.expires_at) })}
            </div>
            {sub.total_classes > 0 && (
              <div className={s.progressTrack}>
                <div className={s.progressFill} style={{ width: `${progress}%` }}/>
              </div>
            )}
          </div>
          {sub.is_frozen && <span className={s.badgeFrozen}>{t('panel.wallet.frozenBadge')}</span>}
        </div>
        {onTransfer && (
          <button type="button" className={s.transferBtn} onClick={() => onTransfer(sub)}>
            {t('panel.wallet.transfer')}
          </button>
        )}
      </div>
    </Card>
  );
}
