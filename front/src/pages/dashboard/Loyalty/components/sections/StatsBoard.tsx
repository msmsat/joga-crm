import { useEffect, useState, type JSX } from 'react';
import styles from '../../Loyalty.module.css';
import { loyaltyApi } from '../../../../../api/loyalty/loyalty.api';
import type { LoyaltyCard, LoyaltyLevel, LoyaltyStats } from '../../../../../api/loyalty/loyalty.types';
import { IconTrend } from '../ui/LoyaltyIcons';

interface Props {
  configuredCount: number;
  mounted: boolean;
}

const fmtMoney = (n: number) => `₽${n.toLocaleString('ru-RU')}`;

const emptyPlaceholder = (icon: JSX.Element) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '140px', gap: '10px', color: 'var(--text3)' }}>
    {icon}
    <div style={{ fontSize: '13px', fontWeight: 600, opacity: 0.5 }}>Программа не подключена</div>
    <div style={{ fontSize: '11px', opacity: 0.35 }}>Данные появятся после настройки</div>
  </div>
);

const headlineCard = (label: string, value: string, trend: string, color: string, delay: string) => (
  <div className={styles.statCard} style={{ animationDelay: delay }}>
    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{label}</div>
    <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text)' }}>{value}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px', color, fontSize: '12px', fontWeight: 700 }}>
      <IconTrend />{trend}
    </div>
  </div>
);

export default function StatsBoard({ configuredCount, mounted }: Props) {
  const [stats, setStats] = useState<LoyaltyStats | null>(null);
  const [levels, setLevels] = useState<LoyaltyLevel[]>([]);
  const [cards, setCards] = useState<LoyaltyCard[]>([]);

  useEffect(() => {
    if (configuredCount === 0) return;
    Promise.all([loyaltyApi.getStats(), loyaltyApi.getLevels(), loyaltyApi.getCards()])
      .then(([s, l, c]) => { setStats(s); setLevels(l); setCards(c); })
      .catch(() => {/* сводка останется на нулях, если запрос не прошёл */});
  }, [configuredCount]);

  if (configuredCount === 0) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div className={styles.statCard} style={{ animationDelay: '0.15s' }}>
          {emptyPlaceholder(
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
              <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
            </svg>
          )}
        </div>
        <div className={styles.statCard} style={{ animationDelay: '0.2s' }}>
          {emptyPlaceholder(
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          )}
        </div>
      </div>
    );
  }

  const totalCards = cards.length;
  // Распределение карт по уровням: считаем по level_id, отдаём в порядке уровней.
  const levelRows = levels.map(lvl => ({
    ...lvl,
    count: cards.filter(c => c.level_id === lvl.id).length,
    desc: lvl.max_threshold === null
      ? `от ${fmtMoney(lvl.min_threshold)}`
      : `${fmtMoney(lvl.min_threshold)}–${fmtMoney(lvl.max_threshold)}`,
  }));

  const KPI = [
    { label: 'Участников',     value: String(stats?.members ?? 0),                     color: '#5BAB72', sub: 'с картой' },
    { label: 'Средний чек',    value: fmtMoney(stats?.avg_check ?? 0),                 color: '#FCAE91', sub: 'по участникам' },
    { label: 'Баллов в обороте', value: (stats?.points_in_circulation ?? 0).toLocaleString('ru-RU'), color: '#9B8EC4', sub: 'начислено' },
    { label: 'Выручка',        value: fmtMoney(stats?.revenue_from_members ?? 0),      color: '#4A80C4', sub: 'от участников / мес' },
  ];

  return (
    <>
      {/* ─── Headline row ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {headlineCard('Выручка от участников', fmtMoney(stats?.revenue_from_members ?? 0), 'за текущий месяц', '#5BAB72', '0.15s')}
        {headlineCard('Участников программы', String(stats?.members ?? 0), 'держателей карт', '#4A80C4', '0.2s')}
      </div>

      {/* ─── KPI + Levels ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className={styles.statCard} style={{ animationDelay: '0.25s' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '20px' }}>Ключевые показатели</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {KPI.map((kpi, i) => (
              <div key={i} style={{ padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{kpi.label}</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{kpi.sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.statCard} style={{ animationDelay: '0.3s' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '20px' }}>Распределение по уровням</div>
          {levelRows.length === 0 && (
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Уровни ещё не настроены</div>
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
            <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Всего клиентов в программе</span>
            <span style={{ fontSize: '16px', fontWeight: 800, color: '#FCAE91' }}>{totalCards}</span>
          </div>
        </div>
      </div>
    </>
  );
}
