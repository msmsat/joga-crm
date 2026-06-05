// ─── ЛОКАЛЬНЫЕ ДАННЫЕ (Mock Data) ─────────────────────────────────────────────
const levels = [
  ['Серебро', 'Базовый уровень', 'до ₽10K', '42 клиента', '#B0B0C0'],
  ['Золото', 'Постоянный клиент', '₽10K–50K', '35 клиентов', '#f0c040'],
  ['Платина', 'VIP клиент', 'от ₽50K', '12 клиентов', '#FCAE91']
];

const deps = [
  ['Мария К.', '₽3 200', '#FCAE91'], 
  ['Алексей М.', '₽15 000', '#f0c040'], 
  ['Елена С.', '₽800', '#5BAB72'], 
  ['Дмитрий П.', '₽5 400', '#4A80C4']
];

// ─── КОМПОНЕНТ ────────────────────────────────────────────────────────────────
export default function Loyalty() {
  return (
    <>
      {/* ─── ВЕРХНИЙ РЯД (СВОДКА) ─── */}
      <div className="grid-4 mb-20">
        <div className="loyalty-card" style={{ background: 'linear-gradient(135deg,rgba(252,174,145,0.08) 0%,rgba(249,160,139,0.04) 100%)', borderColor: 'rgba(252,174,145,0.3)' }}>
          <div className="loyalty-card-icon" style={{ background: 'rgba(252,174,145,0.15)' }}>🏆</div>
          <div className="loyalty-card-title">Карты лояльности</div>
          <div className="loyalty-card-desc">Накопительная система баллов</div>
          <div className="loyalty-card-count">89 <span>клиентов</span></div>
        </div>
        <div className="loyalty-card">
          <div className="loyalty-card-icon" style={{ background: 'rgba(91,171,114,0.15)' }}>💰</div>
          <div className="loyalty-card-title">Скидки и кэшбэк</div>
          <div className="loyalty-card-desc">Персональные предложения</div>
          <div className="loyalty-card-count">18 <span>активных</span></div>
        </div>
        <div className="loyalty-card">
          <div className="loyalty-card-icon" style={{ background: 'rgba(74,128,196,0.15)' }}>🎫</div>
          <div className="loyalty-card-title">Сертификаты</div>
          <div className="loyalty-card-desc">Подарочные и именные</div>
          <div className="loyalty-card-count">34 <span>продано</span></div>
        </div>
        <div className="loyalty-card">
          <div className="loyalty-card-icon" style={{ background: 'rgba(216,140,154,0.15)' }}>📦</div>
          <div className="loyalty-card-title">Абонементы</div>
          <div className="loyalty-card-desc">На 8, 10, 20 занятий</div>
          <div className="loyalty-card-count">67 <span>активных</span></div>
        </div>
      </div>

      {/* ─── СРЕДНИЙ РЯД (УРОВНИ И ДЕПОЗИТЫ) ─── */}
      <div className="grid-2 mb-20">
        <div className="card">
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Уровни лояльности</div>
          <div>
            {levels.map(([n, d, r, c, col], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: `${col}15`, borderRadius: 'var(--radius-sm)', marginBottom: '8px', border: `1px solid ${col}30` }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: col, flexShrink: 0 }}></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{n}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{d} · {r}</div>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text2)' }}>{c}</div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="card">
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Депозиты на счетах</div>
          <div>
            {deps.map(([n, a, c], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{n}</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: c }}>{a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── НИЖНИЙ РЯД (РЕФЕРАЛЬНАЯ ПРОГРАММА) ─── */}
      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Реферальная программа</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px' }}>
          <div style={{ background: 'rgba(252,174,145,0.08)', borderRadius: 'var(--radius)', padding: '16px', border: '1px solid rgba(252,174,145,0.2)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Приведи друга</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--accent2)' }}>₽500</div>
            <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '4px' }}>Бонус за каждого нового клиента</div>
          </div>
          <div style={{ background: 'rgba(91,171,114,0.08)', borderRadius: 'var(--radius)', padding: '16px', border: '1px solid rgba(91,171,114,0.2)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Получено рефералов</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#5BAB72' }}>24</div>
            <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '4px' }}>За последние 3 месяца</div>
          </div>
          <div style={{ background: 'rgba(74,128,196,0.08)', borderRadius: 'var(--radius)', padding: '16px', border: '1px solid rgba(74,128,196,0.2)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Выплачено бонусов</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#4A80C4' }}>₽12K</div>
            <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '4px' }}>Реферальных выплат</div>
          </div>
        </div>
      </div>
    </>
  );
}