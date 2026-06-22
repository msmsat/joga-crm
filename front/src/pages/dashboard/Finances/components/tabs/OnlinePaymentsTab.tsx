import { useState } from 'react';
import type { ToastType } from '../../types';
import { ONLINE_CHANNELS_DATA, fmt } from '../../constants';
import { Ico } from '../ui/FinanceIcons';
import { Toggle } from '../ui/Toggle';
import styles from '../../Finances.module.css';

export default function OnlinePaymentsTab({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const [channels, setChannels] = useState(ONLINE_CHANNELS_DATA);
  const [copied, setCopied] = useState(false);
  const [expandedChartId, setExpandedChartId] = useState<number | null>(null);

  const toggle = (id: number) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, active: !c.active } : c));
    showToast('Настройки шлюза обновлены', 'success');
  };

  const handleCopy = () => {
    setCopied(true);
    showToast('Ссылка скопирована в буфер', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const total = channels.filter(c => c.active).reduce((s, c) => s + c.amount, 0);
  const sessions = channels.filter(c => c.active).reduce((s, c) => s + c.sessions, 0);

  const getChartData = (channelAmount: number, isActive: boolean) => {
    if (!isActive || channelAmount === 0) {
      return ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'].map(m => ({ m, val: 0 }));
    }
    const base = channelAmount / 5;
    const curve = [0.4, 0.5, 0.7, 0.6, 0.9, 1.1, 1.4, 1.2, 1.5, 1.8, 2.1, 2.5];
    return curve.map((multiplier, i) => ({
      m: ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'][i],
      val: Math.round(base * multiplier)
    }));
  };

  const IconsMap: Record<string, React.ReactNode> = {
    link: <Ico.World />, qr: <Ico.QR />,
    widget: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
    telegram: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/></svg>,
  };

  return (
    <>
      {/* 1. Главный блок */}
      <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)', boxShadow: '0 16px 40px -8px rgba(26,26,26,0.04)', marginBottom: '24px', overflow: 'hidden' }}>
        <div style={{ padding: '32px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '-40px', right: '-20px', width: '250px', height: '250px', background: 'radial-gradient(circle, rgba(249,160,139,0.08) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
            <div style={{ zIndex: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(249, 160, 139, 0.12)', color: '#F9A08B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.World /></div>
                <div style={{ fontSize: '11px', color: '#666666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Суммарный онлайн-оборот</div>
              </div>
              <div style={{ fontSize: '42px', fontWeight: 800, letterSpacing: '-1.5px', color: '#1A1A1A', marginBottom: '6px' }}>{fmt(total)}</div>
              <div style={{ fontSize: '13px', color: '#666666', fontWeight: 500 }}>Обработано <span style={{ color: '#1A1A1A', fontWeight: 700 }}>{sessions}</span> платежных сессий в этом месяце</div>
            </div>

            <svg width="180" height="110" viewBox="0 0 180 110" fill="none" style={{ zIndex: 2, overflow: 'visible' }}>
              <path id="pathQR" d="M35 25 L100 55" stroke="rgba(26,26,26,0.04)" strokeWidth="2.5" strokeLinecap="round" />
              <path id="pathWEB" d="M35 55 L100 55" stroke="rgba(26,26,26,0.04)" strokeWidth="2.5" strokeLinecap="round" />
              <path id="pathTG" d="M35 85 L100 55" stroke="rgba(26,26,26,0.04)" strokeWidth="2.5" strokeLinecap="round" />
              <path id="pathOUT" d="M125 55 L165 55" stroke="rgba(26,26,26,0.04)" strokeWidth="2.5" strokeLinecap="round" />

              <circle r="3" fill="#F9A08B" style={{ filter: 'drop-shadow(0 0 6px rgba(249,160,139,0.8))' }}>
                <animateMotion dur="2.5s" repeatCount="indefinite" path="M35 25 L100 55" />
              </circle>
              <circle r="3" fill="#F9A08B" style={{ filter: 'drop-shadow(0 0 6px rgba(249,160,139,0.8))' }}>
                <animateMotion dur="1.8s" repeatCount="indefinite" path="M35 55 L100 55" />
              </circle>
              <circle r="3" fill="#F9A08B" style={{ filter: 'drop-shadow(0 0 6px rgba(249,160,139,0.8))' }}>
                <animateMotion dur="3.2s" repeatCount="indefinite" path="M35 85 L100 55" />
              </circle>
              <circle r="3" fill="#5BAB72" style={{ filter: 'drop-shadow(0 0 6px rgba(91,171,114,0.8))' }}>
                <animateMotion dur="1.5s" repeatCount="indefinite" path="M125 55 L165 55" />
              </circle>

              <g><circle cx="25" cy="25" r="14" fill="#FFFFFF" stroke="rgba(249,160,139,0.5)" strokeWidth="1.5" /><text x="25" y="28" textAnchor="middle" style={{ fontSize: '8px', fill: '#1A1A1A', fontWeight: 800, fontFamily: 'var(--font)' }}>QR</text></g>
              <g><circle cx="25" cy="55" r="14" fill="#FFFFFF" stroke="rgba(249,160,139,0.5)" strokeWidth="1.5" /><text x="25" y="58" textAnchor="middle" style={{ fontSize: '8px', fill: '#1A1A1A', fontWeight: 800, fontFamily: 'var(--font)' }}>WEB</text></g>
              <g><circle cx="25" cy="85" r="14" fill="#FFFFFF" stroke="rgba(249,160,139,0.5)" strokeWidth="1.5" /><text x="25" y="88" textAnchor="middle" style={{ fontSize: '8px', fill: '#1A1A1A', fontWeight: 800, fontFamily: 'var(--font)' }}>TG</text></g>

              <circle cx="112" cy="55" r="22" fill="#FFFFFF" stroke="#F9A08B" strokeWidth="2" style={{ animation: 'pulseCore 2.5s infinite' }} />
              <text x="112" y="51" textAnchor="middle" style={{ fontSize: '12px', fill: '#1A1A1A', fontWeight: 800, fontFamily: 'var(--font)' }}>₽</text>
              <text x="112" y="62" textAnchor="middle" style={{ fontSize: '7px', fill: '#999999', fontFamily: 'var(--font)', fontWeight: 600 }}>шлюз</text>

              <circle cx="170" cy="55" r="10" fill="rgba(91,171,114,0.15)" stroke="#5BAB72" strokeWidth="1.5" />
              <text x="170" y="58" textAnchor="middle" style={{ fontSize: '8.5px', fill: '#5BAB72', fontWeight: 800, fontFamily: 'var(--font)' }}>✓</text>
            </svg>
          </div>
        </div>

        <div style={{ padding: '20px 32px', borderTop: '1px solid rgba(26,26,26,0.05)', background: '#FAFAFA', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#FFFFFF', borderRadius: '10px', padding: '6px 6px 6px 16px', border: '1px solid rgba(26,26,26,0.08)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
            <div style={{ flex: 1, fontSize: '13px', color: '#1A1A1A', fontFamily: 'monospace', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              pay.velora.studio/p/velora-pilates
            </div>
            <button
              onClick={handleCopy}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: copied ? '#A3C9A8' : '#1A1A1A', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)', fontFamily: "'Manrope', sans-serif" }}
            >
              {copied ? <><Ico.Check /> Скопировано</> : <><Ico.Copy /> Копировать</>}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Шлюзы */}
      <div style={{ fontSize: '12px', fontWeight: 800, color: '#1A1A1A', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '16px', paddingLeft: '4px' }}>
        Управление шлюзами
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {channels.map(ch => {
          const isChartOpen = expandedChartId === ch.id;
          const chartData = getChartData(ch.amount, ch.active);
          const maxVal = Math.max(...chartData.map(d => d.val), 1);

          return (
            <div
              key={ch.id}
              style={{
                padding: '24px', borderRadius: '16px',
                opacity: ch.active ? 1 : 0.6,
                background: ch.active ? '#FFFFFF' : 'rgba(26,26,26,0.01)',
                border: isChartOpen ? '1.5px solid #F9A08B' : (ch.active ? '1.5px solid rgba(26,26,26,0.15)' : '1.5px solid rgba(26,26,26,0.12)'),
                boxShadow: isChartOpen ? '0 16px 40px -8px rgba(249,160,139,0.15)' : (ch.active ? '0 8px 24px -4px rgba(26,26,26,0.04)' : 'none'),
                transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0, background: ch.active ? 'rgba(249, 160, 139, 0.12)' : 'rgba(26,26,26,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ch.active ? '#F9A08B' : '#999999', transition: 'all 0.3s' }}>
                  {IconsMap[ch.icon]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#1A1A1A', marginBottom: '2px' }}>{ch.name}</div>
                  <div style={{ fontSize: '12px', color: '#666666', lineHeight: 1.4 }}>{ch.desc}</div>
                </div>
                <div style={{ textAlign: 'right', marginRight: '16px', flexShrink: 0 }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.3px' }}>{fmt(ch.amount)}</div>
                  <div style={{ fontSize: '11px', color: '#999999', fontWeight: 600 }}>{ch.sessions} сессий</div>
                </div>
                <button
                  onClick={() => ch.active && setExpandedChartId(isChartOpen ? null : ch.id)}
                  disabled={!ch.active}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, cursor: ch.active ? 'pointer' : 'not-allowed', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s', marginRight: '16px', background: isChartOpen ? '#1A1A1A' : 'transparent', color: isChartOpen ? '#FFFFFF' : '#666666', border: isChartOpen ? '1px solid #1A1A1A' : '1px solid rgba(26,26,26,0.1)' }}
                  onMouseEnter={e => { if(ch.active && !isChartOpen) { e.currentTarget.style.borderColor = '#1A1A1A'; e.currentTarget.style.color = '#1A1A1A'; } }}
                  onMouseLeave={e => { if(ch.active && !isChartOpen) { e.currentTarget.style.borderColor = 'rgba(26,26,26,0.1)'; e.currentTarget.style.color = '#666666'; } }}
                >
                  <Ico.Bar /> Аналитика
                </button>
                <Toggle on={ch.active} onChange={() => toggle(ch.id)} />
              </div>

              {isChartOpen && (
                <div className={styles.chartContainerInner} style={{ borderTop: '1px dashed rgba(26,26,26,0.08)', padding: '24px 8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A1A' }}>Статистика транзакций шлюза «{ch.name}»</div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#666666', background: 'rgba(26,26,26,0.04)', padding: '4px 10px', borderRadius: '20px' }}>За последние 12 месяцев</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '160px' }}>
                    {chartData.map(d => {
                      const heightPct = (d.val / maxVal) * 100;
                      return (
                        <div key={d.m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%', justifyContent: 'flex-end' }}>
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end' }}>
                            <div
                              title={`Выручка (${d.m}): ${fmt(d.val)}`}
                              style={{ width: '100%', height: `${heightPct}%`, background: 'linear-gradient(180deg, #F9A08B 0%, rgba(249,160,139,0.2) 100%)', borderRadius: '6px 6px 0 0', transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)', cursor: 'pointer' }}
                              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'scaleY(1.03)'; e.currentTarget.style.transformOrigin = 'bottom'; }}
                              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scaleY(1)'; }}
                            />
                          </div>
                          <div style={{ fontSize: '10px', color: '#999999', fontWeight: 700, textTransform: 'uppercase' }}>{d.m}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
