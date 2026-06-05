// ─── ЛОКАЛЬНЫЕ ДАННЫЕ (Mock Data) ─────────────────────────────────────────────
const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const mVals = [180, 210, 240, 195, 270, 260, 284, 0, 0, 0, 0, 0];

// ─── КОМПОНЕНТ ────────────────────────────────────────────────────────────────
export default function Reports() {
  return (
    <>
      {/* ─── НАВИГАЦИЯ ПО ОТЧЕТАМ ─── */}
      <div className="tabs">
        <div className="tab active">Основные</div>
        <div className="tab">По продажам</div>
        <div className="tab">По тренерам</div>
        <div className="tab">По услугам</div>
        <div className="tab">Все</div>
        <div className="tab">События</div>
      </div>

      {/* ─── ГЛАВНЫЕ МЕТРИКИ ─── */}
      <div className="report-metrics">
        <div className="stat-card">
          <div className="stat-label">Выручка (мес.)</div>
          <div className="stat-value" style={{ fontSize: '22px' }}>₽284K</div>
          <div className="stat-change up">↑ 18%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Занятий (мес.)</div>
          <div className="stat-value" style={{ fontSize: '22px' }}>318</div>
          <div className="stat-change up">↑ 24</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Средний чек</div>
          <div className="stat-value" style={{ fontSize: '22px' }}>₽1 890</div>
          <div className="stat-change up">↑ 5.2%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Новые клиенты</div>
          <div className="stat-value" style={{ fontSize: '22px' }}>12</div>
          <div className="stat-change down">↓ 2</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Отмен занятий</div>
          <div className="stat-value" style={{ fontSize: '22px' }}>4.2%</div>
          <div className="stat-change up">↓ 0.8%</div>
        </div>
      </div>

      {/* ─── ГРАФИКИ ─── */}
      <div className="grid-2">
        <div className="card">
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Выручка по месяцам</div>
          <div className="report-bar-outer">
            {months.map((m, i) => mVals[i] > 0 && (
              <div 
                key={i} 
                className="rbar" 
                style={{ 
                  height: `${(mVals[i] / 284) * 100}%`, 
                  background: i === 6 ? 'var(--accent)' : 'rgba(252,174,145,0.3)' 
                }} 
                title={`${m}: ₽${mVals[i]}K`}
              ></div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
            {months.map((m, i) => mVals[i] > 0 && (
              <div key={i} style={{ fontSize: '10px', color: 'var(--text3)', textAlign: 'center', flex: 1 }}>{m}</div>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Структура доходов</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="52" fill="none" stroke="rgba(252,174,145,0.15)" strokeWidth="18" />
              <circle cx="70" cy="70" r="52" fill="none" stroke="#FCAE91" strokeWidth="18" strokeDasharray="196 130" strokeLinecap="round" transform="rotate(-90 70 70)" />
              <circle cx="70" cy="70" r="52" fill="none" stroke="#5BAB72" strokeWidth="18" strokeDasharray="80 246" strokeLinecap="round" transform="rotate(63 70 70)" />
              <circle cx="70" cy="70" r="52" fill="none" stroke="#4A80C4" strokeWidth="18" strokeDasharray="50 276" strokeLinecap="round" transform="rotate(152 70 70)" />
              <text x="70" y="66" textAnchor="middle" fontSize="20" fontWeight="800" fontFamily="Manrope" fill="var(--text)">₽284K</text>
              <text x="70" y="82" textAnchor="middle" fontSize="10" fill="#999" fontFamily="Manrope">всего</text>
            </svg>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#FCAE91' }}></div>
                <div style={{ fontSize: '12px' }}>Абонементы <strong>59%</strong></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#5BAB72' }}></div>
                <div style={{ fontSize: '12px' }}>Разовые <strong>24%</strong></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#4A80C4' }}></div>
                <div style={{ fontSize: '12px' }}>Доп. услуги <strong>15%</strong></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#f0c040' }}></div>
                <div style={{ fontSize: '12px' }}>Товары <strong>2%</strong></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}