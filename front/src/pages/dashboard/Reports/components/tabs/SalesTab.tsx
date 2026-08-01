import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ComposedChart, Bar, LabelList, Line, XAxis, YAxis } from 'recharts';
import type { CategoricalChartFunc } from 'recharts/types/chart/types';
import { analyticsApi } from '../../../../../api/analytics/analytics.api';
import { financesApi } from '../../../../../api/finances';
import { queryKeys } from '../../../../../api/queryKeys';
import { fmtMoney, fmtInt, fmtBucket, fmtDateRange } from '../../../../../lib/format';
import { groupForRange } from '../../hooks/useReportFilters';
import { useHighlightRow } from '../../hooks/useHighlightRow';
import { KpiStat } from '../shared/KpiStat';
import { ChartCard } from '../shared/ChartCard';
import { ChartFrame } from '../shared/ChartFrame';
import { AXIS_X, BAR_CURSOR, PEACH_LIGHT } from '../shared/chartTheme';
import { ChartTooltip } from '../shared/ChartTooltip';
import { ZeroLabel } from '../shared/ZeroLabel';
import { zeroAwareCells } from '../shared/zeroAwareCells';
import { MainWithInsights } from '../shared/MainWithInsights';
import { DrilldownModal } from '../shared/DrilldownModal';
import type { DrilldownColumn } from '../shared/DrilldownModal';
import { EmptyTabState } from '../shared/EmptyTabState';
import { isAllZero } from '../../hooks/useIsEmpty';
import { useScopeNote } from '../../hooks/useScopeNote';
import { BreakdownCards } from './sales/BreakdownCards';
import { ProductsTable, PRODUCTS_TABLE_ID } from './sales/ProductsTable';
import type { SortKey as ProductSortKey } from './sales/ProductsTable';
import type { ProductRow, ReportFiltersParams } from '../../types';

export interface SalesTabProps {
  params: ReportFiltersParams;
  paramsKey: string;
  registerCsvExport: (rows: Record<string, unknown>[]) => void;
  onWidenPeriod: () => void;
}

type Drilldown =
  | { kind: 'category'; value: string; title: string }
  | { kind: 'method'; value: string; title: string }
  | { kind: 'product'; productId: number | null; title: string }
  | { kind: 'day'; date: string; title: string }
  | { kind: 'period'; title: string };

export function SalesTab({ params, paramsKey, registerCsvExport, onWidenPeriod }: SalesTabProps) {
  const { t } = useTranslation('reports');
  const navigate = useNavigate();
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);
  const [productSortBy, setProductSortBy] = useState<ProductSortKey | undefined>(undefined);
  const highlight = useHighlightRow();
  const moneyScopeNote = useScopeNote('money');

  const { data } = useQuery({
    queryKey: queryKeys.report('sales', paramsKey),
    queryFn: () => analyticsApi.getSales(params),
    placeholderData: prev => prev,
  });

  // /sales/series целиком на Operation.op_date — часовой разбивки нет
  // (у операции нет времени суток), сервер всегда 400 на group=hour.
  const rangeGroup = groupForRange(params.date_from, params.date_to);
  const salesGroup = rangeGroup === 'hour' ? 'day' : rangeGroup;

  const { data: series = [] } = useQuery({
    queryKey: queryKeys.report('sales-series', `${paramsKey}-${salesGroup}`),
    queryFn: () => analyticsApi.getSalesSeries({ ...params, group: salesGroup }),
    placeholderData: prev => prev,
  });

  const chartData = useMemo(
    () => series.map(p => ({ period: p.period, label: fmtBucket(p.period, salesGroup), revenue: p.revenue, sales_count: p.sales_count })),
    [series, salesGroup],
  );

  const dateRange = drilldown?.kind === 'day'
    ? { date_from: drilldown.date, date_to: drilldown.date }
    : { date_from: params.date_from, date_to: params.date_to };
  const drilldownFilters = {
    ...dateRange,
    type: 'in' as const,
    category: drilldown?.kind === 'category' && drilldown.value ? drilldown.value : undefined,
    product_id: drilldown?.kind === 'product' && drilldown.productId != null ? drilldown.productId : undefined,
  };
  const drilldownKeyPart = drilldown
    ? drilldown.kind === 'product' ? `product-${drilldown.productId ?? 'none'}`
      : drilldown.kind === 'day' ? `day-${drilldown.date}`
        : drilldown.kind === 'period' ? 'period'
          : `${drilldown.kind}-${drilldown.value}`
    : 'none';
  const { data: operationsPage, isFetching: opsLoading } = useQuery({
    queryKey: queryKeys.finOperations(`sales-${drilldownKeyPart}-${dateRange.date_from}-${dateRange.date_to}`),
    queryFn: () => financesApi.getOperations(drilldownFilters),
    enabled: !!drilldown,
  });
  // /finances/operations не фильтрует по method — сужаем на клиенте по уже загруженной странице.
  const operations = useMemo(() => {
    const items = operationsPage?.items ?? [];
    if (drilldown?.kind === 'method') return items.filter(op => op.method === drilldown.value);
    return items;
  }, [operationsPage, drilldown]);

  const kpi = data?.kpi;
  const isEmpty = !!data && isAllZero([data.kpi.revenue.value, data.kpi.sales_count.value], [data.products]);

  const csvRows = useMemo((): Record<string, unknown>[] => {
    return (data?.products ?? []).map(p => ({
      product: p.name ?? t('table.noProduct'),
      sold: p.sold,
      revenue: p.revenue,
      avg_check: p.avg_check,
      repeat_share_pct: p.repeat_share_pct,
      trend_pct: p.trend_pct ?? '',
    }));
  }, [data, t]);

  useEffect(() => {
    registerCsvExport(csvRows);
  }, [csvRows, registerCsvExport]);

  const handleChartClick: CategoricalChartFunc = (nextState) => {
    const idx = nextState.activeTooltipIndex;
    if (typeof idx !== 'number' || !chartData[idx] || !chartData[idx].revenue) return;
    const period = chartData[idx].period;
    setDrilldown({ kind: 'day', date: period, title: fmtBucket(period, salesGroup) });
  };

  const onProductRowClick = (row: ProductRow) => {
    setDrilldown({ kind: 'product', productId: row.product_id, title: row.name ?? t('table.noProduct') });
  };

  // Задача 3 (EPIC R15): «Выручка» и «Число продаж» — один и тот же список
  // доходных операций периода, отличается только его длина/сумма.
  const openPeriodDrilldown = () => {
    setDrilldown({ kind: 'period', title: `${t('sales.incomeOperations')} · ${fmtDateRange(params.date_from, params.date_to)}` });
  };

  const openRepeatShareTable = () => {
    setProductSortBy('repeat_share_pct');
    highlight(PRODUCTS_TABLE_ID);
  };

  const operationColumns: DrilldownColumn[] = [
    { key: 'title', label: t('overview.drilldown.title') },
    { key: 'date', label: t('overview.drilldown.date') },
    { key: 'category', label: t('overview.drilldown.category') },
    { key: 'method', label: t('overview.drilldown.method') },
    { key: 'amount', label: t('overview.drilldown.amount'), align: 'right' },
  ];
  const operationRows = operations.map(op => ({
    _id: op.id,
    title: op.title,
    date: fmtBucket(op.op_date, 'day'),
    category: op.category ? t(`overview.category.${op.category}`, op.category) : '—',
    method: op.method ? t(`sales.method.${op.method}`, op.method) : '—',
    amount: fmtMoney(op.amount),
  }));

  // Агрегаты левой панели — по сырым операциям среза (в строках таблицы суммы
  // уже текст). Средний чек считаем здесь же, а не берём KPI периода: срез
  // (категория/метод/продукт/день) у KPI своего значения не имеет.
  const drilldownSummary = useMemo(() => {
    const total = operations.reduce((s, op) => s + op.amount, 0);
    const byCategory = new Map<string, number>();
    operations.forEach(op => {
      const key = op.category ?? '—';
      byCategory.set(key, (byCategory.get(key) ?? 0) + op.amount);
    });
    const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      total,
      count: operations.length,
      avgCheck: operations.length ? Math.round(total / operations.length) : 0,
      topCategory: top ? t(`overview.category.${top[0]}`, top[0]) : '—',
    };
  }, [operations, t]);

  if (isEmpty) {
    return <EmptyTabState icon="money" onWiden={onWidenPeriod} />;
  }

  return (
    <>
      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: '20px' }}>
        <KpiStat
          label={t('sales.kpi.revenue')}
          value={kpi?.revenue.value ?? 0}
          trendPct={kpi?.revenue.prev_pct ?? null}
          formulaKey="revenue"
          format="money"
          scopeNote={moneyScopeNote}
          onClick={openPeriodDrilldown}
        />
        <KpiStat
          label={t('sales.kpi.salesCount')}
          value={kpi?.sales_count.value ?? 0}
          trendPct={kpi?.sales_count.prev_pct ?? null}
          formulaKey="salesCount"
          format="int"
          scopeNote={moneyScopeNote}
          onClick={openPeriodDrilldown}
        />
        {/* Осознанно без клика (EPIC R15): дробь от двух других KPI (выручка/
        число продаж), оба уже кликабельны. */}
        <KpiStat
          label={t('sales.kpi.avgCheck')}
          value={kpi?.avg_check.value ?? 0}
          trendPct={kpi?.avg_check.prev_pct ?? null}
          formulaKey="avgCheck"
          format="money"
          scopeNote={moneyScopeNote}
        />
        <KpiStat
          label={t('sales.kpi.repeatShare')}
          value={kpi?.repeat_share_pct.value ?? 0}
          trendPct={kpi?.repeat_share_pct.prev_pct ?? null}
          formulaKey="repeatPurchaseShare"
          format="pct"
          scopeNote={moneyScopeNote}
          onClick={openRepeatShareTable}
        />
        <KpiStat
          label={t('sales.kpi.renewals')}
          value={kpi?.renewals_pct.value ?? 0}
          trendPct={kpi?.renewals_pct.prev_pct ?? null}
          formulaKey="renewalRate"
          format="pct"
          onClick={() => navigate('/dashboard/reports?tab=clients')}
          scopeNote={moneyScopeNote}
        />
      </div>

      <MainWithInsights insights={data?.insights ?? []}>
        <ChartCard title={t('sales.chart.title')} description={t('descriptions.sales.chart')} formulaKey="revenue">
          <ChartFrame>
            <ComposedChart data={chartData} onClick={handleChartClick}>
              <XAxis dataKey="label" {...AXIS_X} />
              <YAxis yAxisId="revenue" hide />
              <YAxis yAxisId="count" orientation="right" hide />
              <ChartTooltip
                formatter={(v, name) => (name === 'revenue' ? fmtMoney(Number(v)) : fmtInt(Number(v)))}
                cursor={BAR_CURSOR}
              />
              <Bar yAxisId="revenue" dataKey="revenue" fill={PEACH_LIGHT} radius={[6, 6, 0, 0]} maxBarSize={28} minPointSize={3} cursor="pointer" activeBar={false}>
                <LabelList dataKey="revenue" position="top" content={ZeroLabel} />
                {zeroAwareCells(chartData, 'revenue', PEACH_LIGHT)}
              </Bar>
              <Line yAxisId="count" type="monotone" dataKey="sales_count" stroke="#4A80C4" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ChartFrame>
        </ChartCard>
      </MainWithInsights>

      <BreakdownCards
        byCategory={data?.by_category ?? []}
        byMethod={data?.by_method ?? []}
        byBuyerType={data?.by_buyer_type ?? { new: { amount: 0, count: 0 }, returning: { amount: 0, count: 0 }, no_client: { amount: 0, count: 0 } }}
        onCategoryClick={(category) => setDrilldown({ kind: 'category', value: category, title: t(`overview.category.${category}`, category) })}
        onMethodClick={(method) => setDrilldown({ kind: 'method', value: method, title: t(`sales.method.${method}`, method) })}
      />

      <div style={{ marginBottom: '20px' }}>
        <ProductsTable products={data?.products ?? []} onRowClick={onProductRowClick} sortBy={productSortBy} />
      </div>

      <DrilldownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title ?? ''}
        subtitle={t('overview.drilldown.subtitle.money')}
        icon="money"
        hero={{ value: fmtMoney(drilldownSummary.total), label: t('sales.kpi.revenue') }}
        stats={[
          { label: t('overview.drilldown.stat.operations'), value: fmtInt(drilldownSummary.count) },
          { label: t('sales.kpi.avgCheck'), value: fmtMoney(drilldownSummary.avgCheck) },
          { label: t('overview.drilldown.stat.topCategory'), value: drilldownSummary.topCategory },
        ]}
        rowHint={t('overview.drilldown.hint.operations')}
        exportName={`sales-${drilldownKeyPart}`}
        columns={operationColumns}
        rows={operationRows}
        loading={opsLoading}
        onRowClick={row => navigate(`/dashboard/finances?tab=operations&search=${encodeURIComponent(String(row.title))}`)}
      />
    </>
  );
}
