export default function Billing() {
  return (
    <>
      {/* ─── ШАПКА РАЗДЕЛА ─── */}
      <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>
        Текущий тариф
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '20px' }}>
        У вас тариф <strong>Pro</strong>. Следующее списание — 15 июля 2025
      </div>

      {/* ─── КАРТОЧКИ ТАРИФОВ ─── */}
      <div className="grid-3 mb-20">
        
        {/* Тариф: Старт */}
        <div className="plan-card">
          <div className="plan-name">Старт</div>
          <div className="plan-price">₽990 <span>/ мес.</span></div>
          
          <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }}></div>
          
          <div className="plan-feature"><span className="plan-check">✓</span> До 3 сотрудников</div>
          <div className="plan-feature"><span className="plan-check">✓</span> До 100 клиентов</div>
          <div className="plan-feature"><span className="plan-check">✓</span> Онлайн-запись</div>
          <div className="plan-feature" style={{ opacity: 0.3 }}>✗ Аналитика</div>
          <div className="plan-feature" style={{ opacity: 0.3 }}>✗ API</div>
        </div>

        {/* Тариф: Pro (Активный) */}
        <div className="plan-card selected">
          <div className="plan-badge">Текущий</div>
          <div className="plan-name">Pro</div>
          <div className="plan-price">₽2 490 <span>/ мес.</span></div>
          
          <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }}></div>
          
          <div className="plan-feature"><span className="plan-check">✓</span> До 20 сотрудников</div>
          <div className="plan-feature"><span className="plan-check">✓</span> Неограниченно клиентов</div>
          <div className="plan-feature"><span className="plan-check">✓</span> Полная аналитика</div>
          <div className="plan-feature"><span className="plan-check">✓</span> Лояльность и CRM</div>
          <div className="plan-feature" style={{ opacity: 0.5 }}>✗ White-label</div>
        </div>

        {/* Тариф: Business */}
        <div className="plan-card">
          <div className="plan-name">Business</div>
          <div className="plan-price">₽5 990 <span>/ мес.</span></div>
          
          <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }}></div>
          
          <div className="plan-feature"><span className="plan-check">✓</span> Неограниченно всё</div>
          <div className="plan-feature"><span className="plan-check">✓</span> White-label</div>
          <div className="plan-feature"><span className="plan-check">✓</span> API-доступ</div>
          <div className="plan-feature"><span className="plan-check">✓</span> Мультифилиалы</div>
          <div className="plan-feature"><span className="plan-check">✓</span> Приоритетная поддержка</div>
        </div>

      </div>
    </>
  );
}