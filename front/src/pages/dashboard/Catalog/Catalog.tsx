import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import './Catalog.css';
import type { CatalogTab } from './types';
import { StudioSection } from './components/StudioSection';
import { ServiceSection } from './components/ServiceSection';

export default function Catalog() {
  const { t } = useTranslation(['catalog']);
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<CatalogTab>(searchParams.get('tab') === 'services' ? 'services' : 'studios');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

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
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === 'studios'
          ? <StudioSection showToast={showToast} />
          : <ServiceSection showToast={showToast} />
        }
      </div>

      {/* Toast */}
      <div className={`cat-toast ${toastMsg ? 'show' : ''}`}>{toastMsg}</div>
    </div>
  );
}
