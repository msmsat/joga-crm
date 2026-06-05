import { useState } from 'react';

// ─── ЛОКАЛЬНЫЕ ДАННЫЕ (Mock Data) ─────────────────────────────────────────────
const NOTIF_TYPES = [
  { bg: '#FCAE91', t: 'Новая запись', s: 'Клиент записался на занятие', keys: ['n1', 'n2'] },
  { bg: '#D88C9A', t: 'Отмена записи', s: 'Клиент отменил занятие', keys: ['n3', 'n4'] },
  { bg: '#4A80C4', t: 'Напоминание', s: 'За 24 часа до занятия', keys: ['n5', 'n6'] },
  { bg: '#5BAB72', t: 'Оплата получена', s: 'Подтверждение платежа', keys: ['n7', 'n8'] },
  { bg: '#f0c040', t: 'Абонемент заканчивается', s: 'Осталось 2 занятия', keys: ['n9', 'n10'] },
  { bg: '#e08060', t: 'День рождения', s: 'Поздравление клиента', keys: ['n11', 'n12'] }
];

// ─── КОМПОНЕНТ ────────────────────────────────────────────────────────────────
export default function Notifications() {
  const [notifs, setNotifs] = useState<Record<string, boolean>>({
    'n1': true, 'n2': true, 'n3': true, 'n4': false, 'n5': true, 'n6': true, 
    'n7': true, 'n8': false, 'n9': true, 'n10': true, 'n11': false, 'n12': false
  });

  const toggleNotif = (key: string) => setNotifs(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="grid-2">
      {/* ─── КАНАЛЫ УВЕДОМЛЕНИЙ ─── */}
      <div>
        <div className="section-title" style={{ fontSize: '15px', marginBottom: '12px' }}>Каналы уведомлений</div>
        
        <div className="notif-channel">
          <div className="channel-icon-sm" style={{ background: 'rgba(100,149,237,0.1)' }}>✈️</div>
          <div><div style={{ fontSize: '13px', fontWeight: 600 }}>Telegram</div><div style={{ fontSize: '11px', color: 'var(--text3)' }}>Бот @VeloraNotifyBot</div></div>
          <label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label>
        </div>
        
        <div className="notif-channel">
          <div className="channel-icon-sm" style={{ background: 'rgba(252,174,145,0.1)' }}>📸</div>
          <div><div style={{ fontSize: '13px', fontWeight: 600 }}>Instagram</div><div style={{ fontSize: '11px', color: 'var(--text3)' }}>Direct сообщения</div></div>
          <label className="toggle-switch"><input type="checkbox" /><span className="toggle-slider"></span></label>
        </div>
        
        <div className="notif-channel">
          <div className="channel-icon-sm" style={{ background: 'rgba(91,171,114,0.1)' }}>💬</div>
          <div><div style={{ fontSize: '13px', fontWeight: 600 }}>WhatsApp</div><div style={{ fontSize: '11px', color: 'var(--text3)' }}>+7 (999) 123-45-67</div></div>
          <label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label>
        </div>
        
        <div className="notif-channel">
          <div className="channel-icon-sm" style={{ background: 'rgba(74,128,196,0.1)' }}>📧</div>
          <div><div style={{ fontSize: '13px', fontWeight: 600 }}>Email</div><div style={{ fontSize: '11px', color: 'var(--text3)' }}>admin@velora.studio</div></div>
          <label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label>
        </div>
        
        <div className="notif-channel">
          <div className="channel-icon-sm" style={{ background: 'rgba(200,150,200,0.1)' }}>📱</div>
          <div><div style={{ fontSize: '13px', fontWeight: 600 }}>SMS</div><div style={{ fontSize: '11px', color: 'var(--text3)' }}>через МТС Коннект</div></div>
          <label className="toggle-switch"><input type="checkbox" /><span className="toggle-slider"></span></label>
        </div>
      </div>

      {/* ─── ТИПЫ УВЕДОМЛЕНИЙ ─── */}
      <div>
        <div className="section-title" style={{ fontSize: '15px', marginBottom: '12px' }}>Типы уведомлений</div>
        <div className="card">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '6px', marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)' }}>СОБЫТИЕ</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textAlign: 'center' }}>ТГ / WA</div>
          </div>
          
          {NOTIF_TYPES.map((row, i) => (
            <div key={i} className="notif-type-row">
              <div className="notif-dot" style={{ background: row.bg }}></div>
              <div className="notif-desc">
                <div className="t">{row.t}</div>
                <div className="s">{row.s}</div>
              </div>
              <div className="notif-checks">
                <div className={`mini-check ${notifs[row.keys[0]] ? 'on' : ''}`} onClick={() => toggleNotif(row.keys[0])}>
                  {notifs[row.keys[0]] ? '✓' : ''}
                </div>
                <div className={`mini-check ${notifs[row.keys[1]] ? 'on' : ''}`} onClick={() => toggleNotif(row.keys[1])}>
                  {notifs[row.keys[1]] ? '✓' : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}