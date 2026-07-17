import { useEffect, useState } from 'react';
import '../../Billing.module.css';
import { billingApi } from '../../../../../api/billing/billing.api';
import type { PaymentCard } from '../../../../../api/billing/billing.types';

export default function PaymentMethodTab() {
  const [cards, setCards] = useState<PaymentCard[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [renewState, setRenewState] = useState<'idle' | 'busy' | 'done'>('idle');

  useEffect(() => {
    billingApi.getPaymentCards()
      .then(setCards)
      .catch(() => { /* нет карт — покажем пустое состояние */ })
      .finally(() => setLoaded(true));
  }, []);

  // Карта из rectoken Fondy: показываем основную, иначе первую сохранённую.
  const card = cards.find(c => c.is_primary) ?? cards[0] ?? null;

  const renew = () => {
    if (renewState === 'busy') return;
    setRenewState('busy');
    billingApi.renew()
      .then(() => setRenewState('done'))          // счёт создан, статус придёт вебхуком
      .catch(() => setRenewState('idle'));
  };

  return (
    <div style={{ padding: '0 32px', animation: 'fadeSlideIn 0.4s ease forwards' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '32px', alignItems: 'start' }}>

          {/* Premium bank card visual — данные из сохранённой карты */}
          <div style={{
            width: '340px', height: '210px', borderRadius: '20px',
            background: 'linear-gradient(135deg, #0f0f12 0%, #1b1b22 100%)',
            padding: '28px', boxSizing: 'border-box', position: 'relative',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            border: '1.5px solid rgba(255,255,255,0.06)',
            boxShadow: '0 24px 48px rgba(0,0,0,0.35), inset 0 1px 1px rgba(255,255,255,0.05)',
            overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '20px', background: 'linear-gradient(to right, transparent, rgba(252,174,145,0.04), transparent)', animation: 'cardLaserScan 4s linear infinite', pointerEvents: 'none' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 2 }}>
              <div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: '1px', fontWeight: 800 }}>ОСНОВНАЯ КАРТА</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'white', marginTop: '2px' }}>
                  {card ? card.card_brand : 'Не привязана'}
                </div>
              </div>
              <div style={{ width: '36px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg, #e6c587 0%, #ba9958 100%)', position: 'relative', display: 'flex', padding: '6px', boxSizing: 'border-box', opacity: 0.85, boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
                <div style={{ width: '100%', height: '100%', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: '3px' }} />
              </div>
            </div>

            <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '3px', textShadow: '0 2px 8px rgba(0,0,0,0.6)', color: 'white', position: 'relative', zIndex: 2 }}>
              {card ? `•••• •••• •••• ${card.card_last4}` : '•••• •••• •••• ••••'}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', zIndex: 2 }}>
              <div style={{ color: 'white', maxWidth: '180px', overflow: 'hidden' }}>
                <div style={{ fontSize: '8px', fontWeight: 800, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.5px' }}>ДЕРЖАТЕЛЬ</div>
                <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', marginTop: '3px', letterSpacing: '0.5px', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {card?.cardholder_name || '—'}
                </div>
              </div>
              <div style={{ color: 'white', textAlign: 'right' }}>
                <div style={{ fontSize: '8px', fontWeight: 800, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.5px' }}>СРОК</div>
                <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '3px', fontFamily: 'monospace' }}>
                  {card?.card_expiry || 'MM/YY'}
                </div>
              </div>
            </div>
          </div>

          {/* Right column: защита + продление */}
          <div style={{ minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--pistachio)" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--onyx)' }}>Стандарты защиты данных</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                {['Шифрование по протоколу PCI DSS Level 1', 'Защита транзакций через 3D Secure', 'Данные карт не оседают на серверах', 'Карта привязывается при первой оплате'].map((text, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--muted)' }}>
                    <span style={{ color: 'var(--pistachio)', fontWeight: 'bold' }}>✓</span> {text}
                  </div>
                ))}
              </div>
            </div>

            {loaded && !card && (
              <div style={{ padding: '16px 20px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '14px', fontSize: '12.5px', color: 'var(--muted)', lineHeight: 1.5 }}>
                Карта появится автоматически после первой оплаты через вкладку «Тарифы».
                Отдельно вводить реквизиты не нужно — оплата проходит на защищённой странице Fondy.
              </div>
            )}

            {card && (
              <button
                onClick={renew}
                disabled={renewState !== 'idle'}
                style={{ width: '100%', padding: '16px', borderRadius: '14px', background: renewState === 'done' ? 'var(--pistachio)' : 'var(--peach)', color: 'white', border: 'none', fontSize: '13.5px', fontWeight: 700, cursor: renewState === 'idle' ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 6px 20px rgba(252,174,145,0.3)', opacity: renewState === 'busy' ? 0.7 : 1, transition: 'all 0.2s ease' }}
              >
                {renewState === 'done' ? 'Счёт создан — платёж обрабатывается'
                  : renewState === 'busy' ? 'Создаём счёт…'
                  : `Продлить сейчас по карте •••• ${card.card_last4}`}
              </button>
            )}
          </div>
        </div>

        {/* Autopayment settings */}
        <div style={{ marginTop: '12px', padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M11 2L3 11H10L9 18L17 9H10L11 2Z" fill="var(--peach)" fillOpacity="0.2" stroke="var(--peach)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--onyx)' }}>Настройки автоплатежа</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {[
              { label: 'Автоматическое продление', desc: 'Списание происходит без подтверждения',    active: true  },
              { label: 'Email-уведомления',         desc: 'Чек на почту после каждого платежа',      active: true  },
              { label: 'Уведомить за 3 дня',        desc: 'Напомним перед автоматическим списанием', active: true  },
              { label: 'SMS-оповещение',             desc: 'Сообщение на номер при списании',         active: false },
            ].map((setting, i) => (
              <div key={i} style={{ padding: '16px 18px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--onyx)', marginBottom: '2px' }}>{setting.label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{setting.desc}</div>
                </div>
                <div style={{ width: '38px', height: '22px', borderRadius: '11px', background: setting.active ? 'var(--peach)' : 'var(--border)', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s ease', boxShadow: setting.active ? '0 2px 10px rgba(252,174,145,0.3)' : 'none' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'white', position: 'absolute', top: '3px', left: setting.active ? '19px' : '3px', transition: 'left 0.2s ease', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
