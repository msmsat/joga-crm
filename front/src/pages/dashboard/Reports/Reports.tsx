import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { studioApi } from '../../../api/studio/studio.api';
import { scheduleApi } from '../../../api/schedule';
import { staffApi } from '../../../api/staff';
import { servicesApi } from '../../../api/studio/services.api';
import { queryKeys } from '../../../api/queryKeys';
import type { Tab, Period as MockPeriod } from './types';
import { TABS } from './constants';
import { useReportFilters } from './hooks/useReportFilters';
import { useExport } from './hooks/useExport';
import { ReportsToolbar } from './components/ReportsToolbar';
import { EmptyTab } from './components/EmptyTab';
import { OverviewTab } from './components/tabs/OverviewTab';
import { SalesTab } from './components/tabs/SalesTab';
import { TabTrenery } from './components/tabs/TabTrenery';

// Старые mock-вкладки принимают Period без 'custom' — свободный диапазон
// временно показывает как 'month' до собственных эпиков R1-R5.
function toMockPeriod(period: string): MockPeriod {
  return period === 'custom' ? 'month' : (period as MockPeriod);
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const { filters, params, paramsKey, comparisonRange, setPeriod, setCustomRange, setFilter } = useReportFilters();
  const { exportCSV } = useExport();
  const csvRowsRef = useRef<Record<string, unknown>[]>([]);
  const registerCsvExport = useCallback((rows: Record<string, unknown>[]) => {
    csvRowsRef.current = rows;
  }, []);

  const { data: branches = [] } = useQuery({ queryKey: queryKeys.branches, queryFn: () => studioApi.getBranches() });
  const { data: halls = [] } = useQuery({ queryKey: queryKeys.halls, queryFn: () => scheduleApi.getHalls() });
  const { data: staff = [] } = useQuery({ queryKey: queryKeys.staff, queryFn: () => staffApi.getList().then(res => res.staff.items) });
  const { data: services = [] } = useQuery({ queryKey: queryKeys.services, queryFn: () => servicesApi.list() });

  const options = {
    branches: branches.map(b => ({ value: String(b.id), label: b.name })),
    halls: halls.map(h => ({ value: String(h.id), label: h.name })),
    trainers: staff.map(s => ({ value: String(s.id), label: [s.name, s.last_name].filter(Boolean).join(' ') })),
    services: services.map(s => ({ value: String(s.id), label: s.name })),
  };

  const mockPeriod = toMockPeriod(filters.period);

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
        filters={filters}
        comparisonRange={comparisonRange}
        options={options}
        onPeriodChange={setPeriod}
        onCustomRangeChange={setCustomRange}
        onFilterChange={setFilter}
        onExport={() => exportCSV(activeTab === 'overview' || activeTab === 'sales' ? csvRowsRef.current : [], `reports-${activeTab}`)}
      />

      <div key={activeTab} style={{ animation: 'fadeSlide 0.22s ease' }}>
        {activeTab === 'overview' && (
          <OverviewTab
            params={params}
            paramsKey={paramsKey}
            registerCsvExport={registerCsvExport}
          />
        )}
        {activeTab === 'sales' && (
          <SalesTab
            params={params}
            paramsKey={paramsKey}
            registerCsvExport={registerCsvExport}
          />
        )}
        {activeTab === 'team' && <TabTrenery period={mockPeriod} />}
        {activeTab === 'clients' && <EmptyTab />}
        {activeTab === 'schedule' && <EmptyTab />}
      </div>
    </>
  );
}
