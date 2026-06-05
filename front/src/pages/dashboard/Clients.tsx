import { useState } from 'react';

// ─── ТИПЫ И ДАННЫЕ ────────────────────────────────────────────────────────────
interface ClientData {
  n: string; i: string; c: string; type: string; badge: string; bl: string; v: number; spent: string; ab: number; abMax: number;
}

const CATEGORIES = ['Все (142)', 'VIP (18)', 'Активные (89)', 'Новые (12)', 'С абонементом (67)', 'Неактивные (23)', 'День рождения 🎂 (3)'];

const clientsData: ClientData[] = [
  { n: 'Мария Коваленко', i: 'МК', c: '#FCAE91', type: 'active-client', badge: 'badge-active', bl: 'Активный', v: 24, spent: '₽48K', ab: 7, abMax: 10 },
  { n: 'Алексей Морозов', i: 'АМ', c: '#f0c040', type: 'vip', badge: 'badge-vip', bl: 'VIP', v: 86, spent: '₽180K', ab: 10, abMax: 10 },
  { n: 'Елена Соколова', i: 'ЕС', c: '#5BAB72', type: 'new-client', badge: 'badge-new', bl: 'Новый', v: 2, spent: '₽4K', ab: 1, abMax: 8 },
  { n: 'Дмитрий Попов', i: 'ДП', c: '#4A80C4', type: 'active-client', badge: 'badge-active', bl: 'Активный', v: 18, spent: '₽32K', ab: 5, abMax: 10 },
  { n: 'Наталья Белова', i: 'НБ', c: '#7b6cd4', type: 'active-client', badge: 'badge-active', bl: 'Активный', v: 11, spent: '₽22K', ab: 3, abMax: 8 },
  { n: 'Светлана Иванова', i: 'СИ', c: '#D88C9A', type: 'vip', badge: 'badge-vip', bl: 'VIP', v: 54, spent: '₽96K', ab: 8, abMax: 10 },
];

// ─── КОМПОНЕНТ ────────────────────────────────────────────────────────────────
export default function Clients() {
  const [activeCat, setActiveCat] = useState('Все (142)');

  return (
    <>
      <div className="category-chips">
        {CATEGORIES.map((cat, i) => (
          <div 
            key={i} 
            className={`cat-chip ${activeCat === cat ? 'active' : ''}`} 
            onClick={() => setActiveCat(cat)}
          >
            {cat}
          </div>
        ))}
      </div>

      <div className="clients-grid">
        {clientsData.map((cl, i) => (
          <div key={i} className={`client-card ${cl.type}`}>
            <div className="client-card-top">
              <div className="client-ava" style={{ background: `linear-gradient(135deg,${cl.c},${cl.c}bb)` }}>{cl.i}</div>
              <div>
                <div className="client-name">{cl.n}</div>
                <div className="client-visits">{cl.v} визитов</div>
              </div>
              <div className={`client-badge ${cl.badge}`}>{cl.bl}</div>
            </div>
            
            <div className="client-stats">
              <div className="client-stat"><div className="v">{cl.v}</div><div className="l">Визиты</div></div>
              <div className="client-stat"><div className="v">{cl.spent}</div><div className="l">Итого</div></div>
              <div className="client-stat"><div className="v">{cl.ab}/{cl.abMax}</div><div className="l">Абон.</div></div>
            </div>
            
            <div className="abonement-label">
              <span>Абонемент</span><span>{cl.ab}/{cl.abMax} занятий</span>
            </div>
            <div className="abonement-bar">
              <div className="abonement-fill" style={{ width: `${(cl.ab / cl.abMax) * 100}%` }}></div>
            </div>
            <div className="loyalty-chip">🌟 {cl.v * 12} баллов</div>
          </div>
        ))}
      </div>
    </>
  );
}