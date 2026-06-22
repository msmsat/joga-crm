import '../../Billing.module.css';
import { usePaymentCard } from '../../hooks/usePaymentCard';

export default function PaymentMethodTab() {
  const {
    isAddingCard, setIsAddingCard,
    cardNumber, setCardNumber,
    cardName, setCardName,
    cardExpiry, setCardExpiry,
    cardCvc, setCardCvc,
    focusedField, setFocusedField,
    formatCardNumber, formatExpiry,
    reset,
  } = usePaymentCard();

  return (
    <div style={{ padding: '0 32px', animation: 'fadeSlideIn 0.4s ease forwards' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '32px', alignItems: 'start' }}>

          {/* Premium bank card visual */}
          <div style={{
            width: '340px', height: '210px', borderRadius: '20px',
            background: 'linear-gradient(135deg, #0f0f12 0%, #1b1b22 100%)',
            padding: '28px', boxSizing: 'border-box', position: 'relative',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            border: `1.5px solid ${focusedField ? 'var(--peach)' : 'rgba(255,255,255,0.06)'}`,
            boxShadow: focusedField
              ? '0 30px 60px rgba(252,174,145,0.22), 0 0 20px rgba(252,174,145,0.1), inset 0 1px 1px rgba(255,255,255,0.1)'
              : '0 24px 48px rgba(0,0,0,0.35), inset 0 1px 1px rgba(255,255,255,0.05)',
            transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            transform: focusedField ? 'scale(1.02) translateY(-2px)' : 'none',
            overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '20px', background: 'linear-gradient(to right, transparent, rgba(252,174,145,0.04), transparent)', animation: 'cardLaserScan 4s linear infinite', pointerEvents: 'none' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 2 }}>
              <div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: '1px', fontWeight: 800 }}>
                  {isAddingCard ? 'РЕЖИМ ПРИВЯЗКИ' : 'ОСНОВНАЯ КАРТА'}
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'white', marginTop: '2px' }}>
                  {isAddingCard ? 'Новый метод' : 'Visa Infinite'}
                </div>
              </div>
              <div style={{ width: '36px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg, #e6c587 0%, #ba9958 100%)', position: 'relative', display: 'flex', padding: '6px', boxSizing: 'border-box', opacity: 0.85, boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
                <div style={{ width: '100%', height: '100%', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: '3px' }} />
              </div>
            </div>

            <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '3px', textShadow: '0 2px 8px rgba(0,0,0,0.6)', transition: 'all 0.2s', color: focusedField === 'number' ? 'var(--peach)' : 'white', position: 'relative', zIndex: 2 }}>
              {isAddingCard ? (cardNumber || '•••• •••• •••• ••••') : '•••• •••• •••• 4821'}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', zIndex: 2 }}>
              <div style={{ transition: 'all 0.2s', color: focusedField === 'name' ? 'var(--peach)' : 'white', maxWidth: '180px', overflow: 'hidden' }}>
                <div style={{ fontSize: '8px', fontWeight: 800, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.5px' }}>ДЕРЖАТЕЛЬ</div>
                <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', marginTop: '3px', letterSpacing: '0.5px', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {isAddingCard ? (cardName || 'CARDHOLDER NAME') : 'IVAN PETROV'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '24px' }}>
                <div style={{ transition: 'all 0.2s', color: focusedField === 'expiry' ? 'var(--peach)' : 'white', textAlign: 'right' }}>
                  <div style={{ fontSize: '8px', fontWeight: 800, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.5px' }}>СРОК</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '3px', fontFamily: 'monospace' }}>
                    {isAddingCard ? (cardExpiry || 'MM/YY') : '09/27'}
                  </div>
                </div>
                <div style={{ transition: 'all 0.2s', color: focusedField === 'cvc' ? 'var(--peach)' : 'white', textAlign: 'right' }}>
                  <div style={{ fontSize: '8px', fontWeight: 800, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.5px' }}>CVC</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '3px', fontFamily: 'monospace' }}>
                    {isAddingCard ? (cardCvc ? '•••' : '— — —') : '•••'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right column: info or form */}
          <div style={{ minWidth: 0, width: '100%' }}>
            {!isAddingCard ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fadeSlideIn 0.3s ease' }}>
                <div style={{ padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--pistachio)" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--onyx)' }}>Стандарты защиты данных</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                    {['Шифрование по протоколу PCI DSS Level 1', 'Защита транзакций через 3D Secure', 'Данные карт не оседают на серверах', 'Автоматические уведомления за 3 дня'].map((text, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--muted)' }}>
                        <span style={{ color: 'var(--pistachio)', fontWeight: 'bold' }}>✓</span> {text}
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setIsAddingCard(true)}
                  style={{ width: '100%', padding: '16px', borderRadius: '14px', background: '#FFFFFF', color: 'var(--onyx)', border: '1px solid rgba(26,26,26,0.12)', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.25s cubic-bezier(0.34, 1.5, 0.64, 1)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'var(--peach)'; e.currentTarget.style.color = 'var(--peach)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(252,174,145,0.12)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.12)'; e.currentTarget.style.color = 'var(--onyx)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.02)'; }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                  Привязать новую банковскую карту
                </button>
              </div>
            ) : (
              <div style={{ padding: '28px 32px', background: '#FFFFFF', border: '1.5px solid var(--peach)', borderRadius: '20px', boxShadow: '0 16px 40px rgba(252,174,145,0.08)', display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--onyx)', letterSpacing: '-0.2px' }}>Новые платежные реквизиты</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--muted)' }}>Номер карты</label>
                    <input type="text" placeholder="4242 4242 4242 4242" value={cardNumber} maxLength={19}
                      onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                      onFocus={() => setFocusedField('number')} onBlur={() => setFocusedField(null)}
                      style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: `1.5px solid ${focusedField === 'number' ? 'var(--peach)' : 'var(--border)'}`, outline: 'none', fontSize: '13.5px', transition: 'all 0.2s', background: focusedField === 'number' ? 'rgba(252,174,145,0.02)' : '#FFF', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--muted)' }}>Имя держателя (Латиница)</label>
                    <input type="text" placeholder="ALEXEY MOROZOV" value={cardName}
                      onChange={e => setCardName(e.target.value.toUpperCase().replace(/[^A-Z\s]/g, ''))}
                      onFocus={() => setFocusedField('name')} onBlur={() => setFocusedField(null)}
                      style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: `1.5px solid ${focusedField === 'name' ? 'var(--peach)' : 'var(--border)'}`, outline: 'none', fontSize: '13.5px', transition: 'all 0.2s', background: focusedField === 'name' ? 'rgba(252,174,145,0.02)' : '#FFF', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--muted)' }}>Срок действия</label>
                    <input type="text" placeholder="MM/YY" value={cardExpiry} maxLength={5}
                      onChange={e => setCardExpiry(formatExpiry(e.target.value))}
                      onFocus={() => setFocusedField('expiry')} onBlur={() => setFocusedField(null)}
                      style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: `1.5px solid ${focusedField === 'expiry' ? 'var(--peach)' : 'var(--border)'}`, outline: 'none', fontSize: '13.5px', transition: 'all 0.2s', background: focusedField === 'expiry' ? 'rgba(252,174,145,0.02)' : '#FFF', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--muted)' }}>CVC код</label>
                    <input type="password" placeholder="•••" value={cardCvc} maxLength={3}
                      onChange={e => setCardCvc(e.target.value.replace(/[^0-9]/g, ''))}
                      onFocus={() => setFocusedField('cvc')} onBlur={() => setFocusedField(null)}
                      style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: `1.5px solid ${focusedField === 'cvc' ? 'var(--peach)' : 'var(--border)'}`, outline: 'none', fontSize: '13.5px', transition: 'all 0.2s', background: focusedField === 'cvc' ? 'rgba(252,174,145,0.02)' : '#FFF', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                  <button onClick={reset} className="topbar-ghost" style={{ padding: '10px 18px', fontSize: '12.5px' }}>Отмена</button>
                  <button
                    onClick={() => { if (cardNumber.length < 15) return; reset(); }}
                    style={{ padding: '10px 22px', borderRadius: '10px', background: 'var(--peach)', border: 'none', color: 'white', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 20px rgba(252,174,145,0.3)' }}
                  >Сохранить карту</button>
                </div>
              </div>
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
