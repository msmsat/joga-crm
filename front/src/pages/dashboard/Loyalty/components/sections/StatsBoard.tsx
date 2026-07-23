import { type JSX, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import styles from '../../Loyalty.module.css';
import { loyaltyApi } from '../../../../../api/loyalty/loyalty.api';
import { queryKeys } from '../../../../../api/queryKeys';
import { IconTrend } from '../ui/LoyaltyIcons';
import { useStudioCurrency } from '../../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../../components/UI';
import { useToast } from '../../../../../components/ui/Toast';

interface Props {
  configuredCount: number;
  mounted: boolean;
}

const emptyPlaceholder = (icon: JSX.Element, title: string, sub: string) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '140px', gap: '10px', color: 'var(--text3)' }}>
    {icon}
    <div style={{ fontSize: '13px', fontWeight: 600, opacity: 0.5 }}>{title}</div>
    <div style={{ fontSize: '11px', opacity: 0.35 }}>{sub}</div>
  </div>
);

const emptyIcon = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.35">
    <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
  </svg>
);

const headlineCard = (label: string, value: string | null, trend: string, color: string, delay: string, sub?: string) => (
  <div className={styles.statCard} style={{ padding: '16px 18px', animationDelay: delay }}>
    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{label}</div>
    {value === null ? (
      <>
        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text3)', opacity: 0.4 }}>—</div>
        <div style={{ fontSize: '11px', color: 'var(--text3)', opacity: 0.5, marginTop: '4px' }}>{trend}</div>
      </>
    ) : (
      <>
        <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)' }}>{value}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px', color, fontSize: '11px', fontWeight: 700 }}>
          {sub ? null : <IconTrend />}{sub ?? trend}
        </div>
      </>
    )}
  </div>
);

export default function StatsBoard({ configuredCount, mounted }: Props) {
  const { t } = useTranslation('loyalty');
  const toast = useToast();
  const currency = getCurrencySymbol(useStudioCurrency());
  const fmtMoney = (n: number) => `${currency}${n.toLocaleString('ru-RU')}`;
  const enabled = configuredCount > 0;
  const { data: stats = null, isError: statsError } = useQuery({
    queryKey: queryKeys.loyaltyStats,
    queryFn: () => loyaltyApi.getStats(),
    enabled,
  });
  const { data: levels = [], isError: levelsError } = useQuery({
    queryKey: queryKeys.loyaltyLevels,
    queryFn: () => loyaltyApi.getLevels(),
    enabled,
  });
  const { data: cards = [], isError: cardsError } = useQuery({
    queryKey: queryKeys.loyaltyCards,
    queryFn: () => loyaltyApi.getCards(),
    enabled,
  });

  useEffect(() => {
    if (statsError || levelsError || cardsError) toast.error(t('toasts.loadFailed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsError, levelsError, cardsError]);

  const totalCards = cards.length;
  // Распределение карт по уровням: считаем по level_id, отдаём в порядке уровней.
  const levelRows = levels.map(lvl => ({
    ...lvl,
    count: cards.filter(c => c.level_id === lvl.id).length,
    desc: lvl.max_threshold === null
      ? t('stats.fromValue', { value: fmtMoney(lvl.min_threshold) })
      : `${fmtMoney(lvl.min_threshold)}–${fmtMoney(lvl.max_threshold)}`,
  }));

  const KPI = [
    { label: t('stats.members'),     value: String(stats?.members ?? 0),                     color: '#5BAB72', sub: t('stats.withCard') },
    { label: t('stats.avgCheck'),    value: fmtMoney(stats?.avg_check ?? 0),                 color: '#FCAE91', sub: t('stats.byMembers') },
    { label: t('stats.pointsInCirculation'), value: (stats?.points_in_circulation ?? 0).toLocaleString('ru-RU'), color: '#9B8EC4', sub: t('stats.accrued') },
    { label: t('stats.revenue'),        value: fmtMoney(stats?.revenue_from_members ?? 0),      color: '#4A80C4', sub: t('stats.revenuePerMonth') },
  ];

  return (
    <>
      {/* ─── Headline row: сводка-результат (5 метрик) ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {headlineCard(t('stats.revenueHeadline'), enabled ? fmtMoney(stats?.revenue_from_members ?? 0) : null, t('stats.perMonth'), '#5BAB72', '0.1s')}
        {headlineCard(t('stats.returnedClients'), enabled ? String(stats?.returned_clients ?? 0) : null, t('stats.returnedClientsSub'), '#4A80C4', '0.15s')}
        {headlineCard(t('stats.avgCheckHeadline'), enabled ? fmtMoney(stats?.avg_check ?? 0) : null, t('stats.byMembers'), '#FCAE91', '0.2s')}
        {headlineCard(t('stats.bonusCostHeadline'), enabled ? fmtMoney(stats?.bonus_cost ?? 0) : null, t('stats.bonusCostSub'), '#9B8EC4', '0.25s')}
        {headlineCard(t('stats.roiHeadline'), enabled ? t('stats.roiValue', { value: stats?.roi ?? 0 }) : null, t('stats.perMonth'), '#5BAB72', '0.3s')}
      </div>

      {/* ─── KPI + Levels ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className={styles.statCard} style={{ animationDelay: '0.35s' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '20px' }}>{t('stats.kpi')}</div>
          {enabled ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {KPI.map((kpi, i) => (
                <div key={i} style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{kpi.label}</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{kpi.sub}</div>
                </div>
              ))}
            </div>
          ) : emptyPlaceholder(emptyIcon, t('stats.noData'), t('stats.connectProgram'))}
        </div>

        <div className={styles.statCard} style={{ animationDelay: '0.4s' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '20px' }}>{t('stats.levelDistribution')}</div>
          {!enabled ? (
            emptyPlaceholder(emptyIcon, t('stats.noData'), t('stats.connectProgram'))
          ) : (
            <>
              {levelRows.length === 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{t('stats.noLevels')}</div>
              )}
              {levelRows.map((lvl, i) => (
                <div key={lvl.id} style={{ marginBottom: i < levelRows.length - 1 ? '18px' : '0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: lvl.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', fontWeight: 700 }}>{lvl.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{lvl.desc}</span>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text2)' }}>{lvl.count}</span>
                  </div>
                  <div className={styles.progressBarWrap}>
                    <div
                      className={styles.progressBarFill}
                      style={{
                        width: mounted && totalCards ? `${(lvl.count / totalCards) * 100}%` : '0%',
                        background: lvl.color,
                        transitionDelay: `${0.3 + i * 0.1}s`,
                      }}
                    />
                  </div>
                </div>
              ))}
              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{t('stats.totalClients')}</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: '#FCAE91' }}>{totalCards}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
