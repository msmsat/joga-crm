import { useState } from 'react';
import type { Tab } from './types';
import { FINANCE_TABS } from './types';
import { useToast } from './hooks/useToast';
import { Toast } from './components/ui/Toast';
import { Ico } from './components/ui/FinanceIcons';
import AccountsTab from './components/tabs/AccountsTab';
import OperationsTab from './components/tabs/OperationsTab';
import CounterpartiesTab from './components/tabs/CounterpartiesTab';
import DocumentsTab from './components/tabs/DocumentsTab';
import OnlinePaymentsTab from './components/tabs/OnlinePaymentsTab';
import PaymentMethodsTab from './components/tabs/PaymentMethodsTab';
import ReportsTab from './components/tabs/ReportsTab';
import GoalsTab from './components/tabs/GoalsTab';

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  'Счета и кассы': <Ico.Dollar />,
  'Операции': <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  'Контрагенты': <Ico.Building />,
  'Документы': <Ico.Doc />,
  'Онлайн-платежи': <Ico.World />,
  'Методы оплаты': <Ico.Card />,
  'Отчёты': <Ico.Bar />,
  'Цели': <Ico.Target />,
};

export default function Finances() {
  const [activeTab, setActiveTab] = useState<Tab>('Счета и кассы');
  const [operationsSearch, setOperationsSearch] = useState('');
  const { toast, show: showToast } = useToast();

  const handleTabClick = (t: Tab) => {
    if (t === 'Операции' && activeTab !== 'Операции') setOperationsSearch('');
    setActiveTab(t);
  };

  const renderTab = () => {
    const props = { showToast };
    switch (activeTab) {
      case 'Счета и кассы':
        return <AccountsTab showToast={showToast} onNavigateToOperations={(name) => { setOperationsSearch(name); setActiveTab('Операции'); }} />;
      case 'Операции':
        return <OperationsTab showToast={showToast} initialSearch={operationsSearch} />;
      case 'Контрагенты': return <CounterpartiesTab {...props} />;
      case 'Документы': return <DocumentsTab {...props} />;
      case 'Онлайн-платежи': return <OnlinePaymentsTab {...props} />;
      case 'Методы оплаты': return <PaymentMethodsTab {...props} />;
      case 'Отчёты': return <ReportsTab {...props} />;
      case 'Цели': return <GoalsTab {...props} />;
      default: return null;
    }
  };

  return (
    // Враппер занимает весь flex-слот .content, сам является flex-колонкой
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* Таббар — ВНЕ скролл-контейнера, никогда не исчезает */}
      <div className="finance-tabs-big" style={{ flexShrink: 0 }}>
        {FINANCE_TABS.map(t => (
          <div
            key={t}
            className={`ftab ${activeTab === t ? 'active' : ''}`}
            onClick={() => handleTabClick(t)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <span style={{ opacity: activeTab === t ? 1 : 0.5, transition: 'opacity 0.18s' }}>{TAB_ICONS[t]}</span>
            {t}
          </div>
        ))}
      </div>

      {/* Контент — собственный скролл-контейнер; key сбрасывает скролл при смене таба */}
      <div
        key={activeTab}
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
          paddingBottom: '28px',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--border2) transparent',
          animation: 'fadeSlide 0.22s ease both',
        }}
      >
        {renderTab()}
      </div>

      <Toast msg={toast.msg} type={toast.type} visible={toast.visible} />
    </div>
  );
}
