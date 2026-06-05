import { useState } from 'react';

// ─── ЛОКАЛЬНЫЕ ДАННЫЕ (Mock Data) ─────────────────────────────────────────────
const ops = [
  ['Оплата абонемента', 'Мария Коваленко', '#5BAB72', '+₽12 000', 'Сегодня, 14:32'],
  ['Возврат средств', 'Иван Петров', '#D88C9A', '-₽2 500', 'Сегодня, 11:15'],
  ['Разовая запись', 'Елена Соколова', '#5BAB72', '+₽1 200', 'Вчера, 18:45'],
  ['Аренда зала', 'Контрагент', '#4A80C4', '-₽8 000', 'Вчера, 10:00'],
  ['Оплата сертификата', 'Алексей Морозов', '#5BAB72', '+₽5 000', '29 июн, 16:20'],
];

const FINANCE_TABS = ['Счета и кассы', 'Операции', 'Контрагенты', 'Документы', 'Онлайн-платежи', 'Методы оплаты', 'Отчёты'];

// ─── КОМПОНЕНТ ────────────────────────────────────────────────────────────────
export default function Finances() {
  const [activeFTab, setActiveFTab] = useState('Счета и кассы');

  return (
    <>
      <div className="finance-tabs-big">
        {FINANCE_TABS.map((t, i) => (
          <div key={i} className={`ftab ${activeFTab === t ? 'active' : ''}`} onClick={() => setActiveFTab(t)}>
            {t}
          </div>
        ))}
      </div>

      <div className="finance-illus">
        <svg width="100" height="100" viewBox="0 0 100 100" className="donut-svg" style={{ position: 'absolute', right: '30px' }}>
          <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(252,174,145,0.2)" strokeWidth="10" />
          <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(252,174,145,0.5)" strokeWidth="10" strokeDasharray="142 98" strokeLinecap="round" transform="rotate(-90 50 50)" />
          <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(91,171,114,0.4)" strokeWidth="10" strokeDasharray="56 184" strokeLinecap="round" transform="rotate(56 50 50)" />
        </svg>
        <div style={{ textAlign: 'center', zIndex: 1 }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Баланс всех счетов
          </div>
          <div style={{ fontSize: '44px', fontWeight: 800, letterSpacing: '-2px', color: 'var(--text)' }}>₽2.4M</div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '4px' }}>Обновлено только что</div>
        </div>
      </div>

      <div className="grid-3 mb-20">
        <div className="card card-sm">
          <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, marginBottom: '4px' }}>ОСНОВНАЯ КАССА</div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginBottom: '2px' }}>₽485 200</div>
          <div style={{ fontSize: '11px', color: '#5BAB72', fontWeight: 600 }}>↑ +₽48 200 сегодня</div>
        </div>
        <div className="card card-sm">
          <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, marginBottom: '4px' }}>РАСЧЁТНЫЙ СЧЁТ</div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginBottom: '2px' }}>₽1 840 000</div>
          <div style={{ fontSize: '11px', color: '#5BAB72', fontWeight: 600 }}>↑ +₽82 400 сегодня</div>
        </div>
        <div className="card card-sm">
          <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, marginBottom: '4px' }}>ОНЛАЙН-КОШЕЛЁК</div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginBottom: '2px' }}>₽94 100</div>
          <div style={{ fontSize: '11px', color: '#5BAB72', fontWeight: 600 }}>↑ +₽34 100 сегодня</div>
        </div>
      </div>

      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Последние финансовые операции</div>
        <div>
          {ops.map(([t, n, c, a, d], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: `${c}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: c, fontWeight: 700 }}>
                {a.startsWith('+') ? '↑' : '↓'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{t}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{n}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: c }}>{a}</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}