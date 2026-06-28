import { useState } from 'react';
import type { Tab } from './types';
import { TABS } from './constants';
import { useDateRange } from './hooks/useDateRange';
import { useExport } from './hooks/useExport';
import { ReportsToolbar } from './components/ReportsToolbar';
import { TabOsnovnye } from './components/tabs/TabOsnovnye';
import { TabProdazhi } from './components/tabs/TabProdazhi';
import { TabTrenery } from './components/tabs/TabTrenery';
import { TabUslugi } from './components/tabs/TabUslugi';
import { TabAll } from './components/tabs/TabAll';
import { TabSobytiya } from './components/tabs/TabSobytiya';

export default function Reports() {
  const [activeTab, setActiveTab] = useState<Tab>('Основные');
  const { period, setPeriod } = useDateRange();
  const { exportCSV } = useExport();

  return (
    <>
      <style>{`
        @keyframes tooltipIn { from{opacity:0;transform:translateY(4px) scale(0.97)} to{opacity:1;transform:none} }
        @keyframes fadeSlide  { from{opacity:0;transform:translateY(6px)}            to{opacity:1;transform:none} }
        @keyframes rtDropIn   { from{opacity:0;transform:translateY(-6px)}           to{opacity:1;transform:none} }
      `}</style>

      <ReportsToolbar
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        period={period}
        onPeriodChange={setPeriod}
        showPeriod={true}
        onExport={exportCSV}
      />

      <div key={activeTab} style={{ animation: 'fadeSlide 0.22s ease' }}>
        {activeTab === 'Основные'    && <TabOsnovnye period={period}/>}
        {activeTab === 'По продажам' && <TabProdazhi period={period}/>}
        {activeTab === 'По тренерам' && <TabTrenery  period={period}/>}
        {activeTab === 'По услугам'  && <TabUslugi   period={period}/>}
        {activeTab === 'Все'         && <TabAll       period={period}/>}
        {activeTab === 'События'     && <TabSobytiya  period={period}/>}
      </div>
    </>
  );
}
