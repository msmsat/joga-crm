import { useState } from 'react';

export default function Booking() {
  const [isTgModalOpen, setTgModalOpen] = useState(false);

  const copyLink = () => alert('Ссылка для Instagram скопирована: https://book.velora.studio/your-studio');
  const showWebSettings = () => alert('Настройки веб-виджета открыты');

  return (
    <>
      <div className="grid-2 mb-20" style={{ gridTemplateColumns: '340px 1fr', gap: '28px' }}>
        
        {/* ─── ПРЕВЬЮ СТРАНИЦЫ ЗАПИСИ ─── */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px', color: 'var(--text2)' }}>Превью страницы записи</div>
          <div className="booking-preview float-anim">
            <div className="booking-preview-header">
              <div className="bp-logo">Pilates Studio</div>
              <div className="bp-sub">Выберите услугу и время</div>
            </div>
            <div className="bp-services">
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Услуги</div>
              
              <div className="bp-service">
                <div className="bp-service-dot" style={{ background: '#FCAE91' }}></div>
                <div className="bp-service-name">Групповой пилатес</div>
                <div className="bp-service-price">₽1 200</div>
              </div>
              <div className="bp-service">
                <div className="bp-service-dot" style={{ background: '#5BAB72' }}></div>
                <div className="bp-service-name">Индивидуальное занятие</div>
                <div className="bp-service-price">₽2 500</div>
              </div>
              <div className="bp-service">
                <div className="bp-service-dot" style={{ background: '#4A80C4' }}></div>
                <div className="bp-service-name">Стретчинг</div>
                <div className="bp-service-price">₽900</div>
              </div>
              
              <button style={{ width: '100%', marginTop: '8px', padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 700, fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                Записаться →
              </button>
            </div>
          </div>
        </div>

        {/* ─── КАНАЛЫ ПОДКЛЮЧЕНИЯ И НАСТРОЙКИ ─── */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px', color: 'var(--text2)' }}>Каналы подключения</div>
          
          <div className="grid-3 mb-20">
            <div className="channel-card" onClick={() => setTgModalOpen(true)}>
              <div className="channel-icon">✈️</div>
              <div className="channel-name">Telegram-бот</div>
              <div className="channel-desc">Автоматическая запись через бота</div>
            </div>
            <div className="channel-card" onClick={copyLink}>
              <div className="channel-icon">📸</div>
              <div className="channel-name">Instagram</div>
              <div className="channel-desc">Ссылка для bio и сторис</div>
            </div>
            <div className="channel-card" onClick={showWebSettings}>
              <div className="channel-icon">🌐</div>
              <div className="channel-name">Веб-сайт</div>
              <div className="channel-desc">Виджет или отдельная страница</div>
            </div>
          </div>
          
          <div className="card">
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>Настройки онлайн-записи</div>
            
            <div className="settings-row">
              <div><div className="label">Предоплата</div><div className="sub">Требовать оплату при записи</div></div>
              <label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label>
            </div>
            
            <div className="settings-row">
              <div><div className="label">Подтверждение тренером</div><div className="sub">Запись ожидает одобрения</div></div>
              <label className="toggle-switch"><input type="checkbox" /><span className="toggle-slider"></span></label>
            </div>
            
            <div className="settings-row">
              <div><div className="label">Напоминание клиенту</div><div className="sub">За 24 и 2 часа до занятия</div></div>
              <label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label>
            </div>
          </div>
        </div>
      </div>

      {/* ─── МОДАЛКА TELEGRAM-БОТА ─── */}
      <div 
        className={`tg-modal-overlay ${isTgModalOpen ? 'open' : ''}`} 
        onClick={(e) => { if (e.target === e.currentTarget) setTgModalOpen(false); }}
      >
        <div className="tg-modal">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div className="modal-title">Подключить Telegram-бота</div>
            <button onClick={() => setTgModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text3)' }}>×</button>
          </div>
          
          <div className="modal-sub">Вставьте токен вашего Telegram-бота</div>
          <input className="input-field" type="text" placeholder="123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ" style={{ marginBottom: '16px' }} />
          <button className="topbar-btn" style={{ width: '100%', justifyContent: 'center', padding: '11px' }}>Подключить бота</button>
          
          <div className="instruction-box">
            <div className="ins-title">📖 Как получить токен?</div>
            <ol>
              <li>Откройте Telegram и найдите <strong>@BotFather</strong></li>
              <li>Отправьте команду <code>/newbot</code></li>
              <li>Придумайте имя и username для бота</li>
              <li>Скопируйте токен из ответа BotFather</li>
              <li>Вставьте токен в поле выше и нажмите «Подключить»</li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}