import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import './Catalog.css';
import type { CatalogTab } from './types';
import { StudioSection } from './components/StudioSection';
import { ServiceSection } from './components/ServiceSection';
import { SubscriptionSection } from './components/SubscriptionSection';

const VALID_TABS: CatalogTab[] = ['studios', 'services', 'subscriptions'];

export default function Catalog() {
  const { t } = useTranslation(['catalog']);
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') as CatalogTab | null;
  const [tab, setTab] = useState<CatalogTab>(initialTab && VALID_TABS.includes(initialTab) ? initialTab : 'studios');

  return (
    <div className="cat-page">
      {/* Tab switcher */}
      <div className="cat-tabs">
        <button className={`cat-tab ${tab === 'studios' ? 'active' : ''}`} onClick={() => setTab('studios')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          {t('catalog:tabs.studios')}
        </button>
        <button className={`cat-tab ${tab === 'services' ? 'active' : ''}`} onClick={() => setTab('services')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          {t('catalog:tabs.services')}
        </button>
        <button className={`cat-tab ${tab === 'subscriptions' ? 'active' : ''}`} onClick={() => setTab('subscriptions')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/>
          </svg>
          {t('catalog:tabs.subscriptions')}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === 'studios' && <StudioSection />}
        {tab === 'services' && <ServiceSection />}
        {tab === 'subscriptions' && <SubscriptionSection />}
      </div>
    </div>
  );
}
