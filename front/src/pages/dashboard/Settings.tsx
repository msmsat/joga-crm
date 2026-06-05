export default function Settings() {
  return (
    <div className="grid-2">
      {/* ─── ОБЩИЕ НАСТРОЙКИ ─── */}
      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Общие настройки</div>
        
        <div className="settings-row">
          <div>
            <div className="label">Название компании</div>
            <div className="sub">Pilates & Wellness Studio</div>
          </div>
          <button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button>
        </div>
        
        <div className="settings-row">
          <div>
            <div className="label">Timezone</div>
            <div className="sub">Europe/Moscow (UTC+3)</div>
          </div>
          <button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button>
        </div>
        
        <div className="settings-row">
          <div>
            <div className="label">Валюта</div>
            <div className="sub">RUB — Российский рубль</div>
          </div>
          <button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button>
        </div>
        
        <div className="settings-row">
          <div>
            <div className="label">Язык интерфейса</div>
            <div className="sub">Русский</div>
          </div>
          <button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button>
        </div>
      </div>

      {/* ─── РАБОЧИЕ ЧАСЫ ─── */}
      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Рабочие часы</div>
        
        <div className="settings-row">
          <div>
            <div className="label">Будни</div>
            <div className="sub">08:00 — 22:00</div>
          </div>
          <button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button>
        </div>
        
        <div className="settings-row">
          <div>
            <div className="label">Суббота</div>
            <div className="sub">09:00 — 20:00</div>
          </div>
          <button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button>
        </div>
        
        <div className="settings-row">
          <div>
            <div className="label">Воскресенье</div>
            <div className="sub">10:00 — 18:00</div>
          </div>
          <button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button>
        </div>
        
        <div className="settings-row">
          <div>
            <div className="label">Длительность слота</div>
            <div className="sub">60 минут</div>
          </div>
          <button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button>
        </div>
      </div>
    </div>
  );
}