import { createPortal } from 'react-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTelegram } from '../../hooks/useTelegram';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;      
  amountStr: string;     
  onSuccess: () => void; 
}

export default function PaymentModal({ isOpen, onClose, itemName, amountStr, onSuccess }: PaymentModalProps) {
  const { t } = useTranslation();
  const { tg } = useTelegram();
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);

  // Стейти для полів картки
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

  // Форматування номеру картки (додаємо пробіли кожні 4 цифри)
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, ''); // Тільки цифри
    const formatted = val.replace(/(\d{4})(?=\d)/g, '$1 ').substring(0, 19);
    setCardNumber(formatted);
  };

  // Форматування дати (ММ/РР)
  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length >= 2) {
      val = val.substring(0, 2) + '/' + val.substring(2, 4);
    }
    setExpiry(val);
  };

  // Форматування CVV (тільки 3 цифри)
  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').substring(0, 3);
    setCvv(val);
  };

  // Перевірка, чи всі поля введені правильно
  const isCardValid = cardNumber.length === 19 && expiry.length === 5 && cvv.length === 3;

  const handlePayment = (method: string) => {
    setSelectedMethod(method);
    setIsProcessing(true);
    if (tg) tg.HapticFeedback.impactOccurred('medium');

    setTimeout(() => {
      setIsProcessing(false);
      setSelectedMethod(null);
      
      // Очищаємо поля після успішної оплати
      setCardNumber('');
      setExpiry('');
      setCvv('');
      
      if (tg) tg.HapticFeedback.notificationOccurred('success');
      
      onSuccess();
      onClose();
    }, 1500);
  };

  // Базовий стиль для полів вводу, щоб вони виглядали однаково красиво
  const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid var(--linen-dk)',
    background: '#fff',
    fontSize: '15px',
    color: 'var(--ink)',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit'
  };

  return createPortal(
    <div 
      className={`modal-overlay ${isOpen ? 'open' : ''}`} 
      id="payment-modal" 
      onClick={(e) => !isProcessing && (e.target as any).id === 'payment-modal' && onClose()}
      style={{ zIndex: 1000 }}
    >
      <div className="modal-sheet">
        <div className="modal-handle"></div>
        <div className="modal-content">
          <div className="modal-tag">{t('paymentModal.tag')}</div>
          <div className="modal-title">{t('paymentModal.title')}</div>
          
          {/* Чек / Деталі замовлення */}
          <div style={{ 
            background: 'var(--warm-white)', 
            border: '1px solid var(--linen-dk)', 
            borderRadius: 'var(--r-sm)', 
            padding: '16px', 
            marginTop: '20px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ color: 'var(--ink-lt)', fontSize: '14px' }}>{t('paymentModal.service')}</span>
              <span style={{ color: 'var(--ink)', fontSize: '14px', fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>
                {itemName}
              </span>
            </div>
            <div style={{ borderTop: '1px dashed var(--linen-dk)', margin: '12px 0' }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--ink)', fontSize: '16px', fontWeight: 500 }}>{t('paymentModal.amount_due')}</span>
              <span style={{ color: 'var(--navy-md)', fontSize: '20px', fontWeight: 600 }}>
                {amountStr}
              </span>
            </div>
          </div>

          {/* 🔥 ПОЛЯ ДЛЯ ВВОДУ КАРТКИ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            <input 
              type="tel"
              placeholder="0000 0000 0000 0000" 
              value={cardNumber}
              onChange={handleCardNumberChange}
              style={inputStyle}
              disabled={isProcessing}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="tel"
                placeholder="ММ/РР" 
                value={expiry}
                onChange={handleExpiryChange}
                style={inputStyle}
                disabled={isProcessing}
              />
              <input 
                type="tel" // Використовуємо tel для появи цифрової клавіатури на телефоні
                placeholder="CVV" 
                value={cvv}
                onChange={handleCvvChange}
                style={inputStyle}
                disabled={isProcessing}
                maxLength={3}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            
            {/* 🔥 Кнопка Оплата карткою (Головна) */}
            <button 
              onClick={() => handlePayment('card')}
              // Кнопка заблокована, якщо картка не валідна АБО йде обробка
              disabled={!isCardValid || isProcessing}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                // Змінюємо колір на сірий, якщо поля не заповнені
                background: isCardValid ? 'var(--gold)' : '#e0e0e0', 
                color: isCardValid ? '#fff' : '#a0a0a0', 
                fontSize: '16px', fontWeight: 500,
                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
                transition: 'all 0.3s ease'
              }}
            >
              {isProcessing && selectedMethod === 'card' ? 'Обробка транзакції...' : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
                  {t('paymentModal.pay_card')}
                </>
              )}
            </button>

            {/* Розділювач "Або" */}
            <div style={{ textAlign: 'center', color: 'var(--ink-lt)', fontSize: '13px', margin: '6px 0' }}>
              {t('paymentModal.or_other')}
            </div>

            {/* Кнопка Apple Pay */}
            <button 
              onClick={() => handlePayment('apple')}
              disabled={isProcessing}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                background: '#000', color: '#fff', fontSize: '16px', fontWeight: 500,
                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
                opacity: isProcessing && selectedMethod !== 'apple' ? 0.5 : 1
              }}
            >
              {isProcessing && selectedMethod === 'apple' ? t('paymentModal.processing') : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 13.91c-.55.53-1.46.73-2.31.73-.78 0-1.89-.25-2.78-.25s-1.92.24-2.74.24c-.81 0-1.63-.22-2.2-.73-1.68-1.54-2.14-4.89-1.21-6.52.47-.83 1.34-1.35 2.29-1.35 1.01 0 1.83.47 2.45.47.65 0 1.58-.51 2.72-.51.87 0 1.63.26 2.22.79-1.68 1.02-1.38 3.51.34 4.31-.38.99-1.03 2.1-1.78 2.82zm-2.07-8.08c-.46.54-1.12.89-1.81.85.08-1.57.85-2.91 2.08-3.46.42-.19.89-.28 1.35-.25-.09 1.15-.75 2.2-1.62 2.86z"/></svg>
                  {t('paymentModal.pay')}
                </>
              )}
            </button>

            {/* Кнопка Google Pay */}
            <button 
              onClick={() => handlePayment('google')}
              disabled={isProcessing}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #DADCE0',
                background: '#fff', color: '#3c4043', fontSize: '16px', fontWeight: 500,
                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
                opacity: isProcessing && selectedMethod !== 'google' ? 0.5 : 1
              }}
            >
              {isProcessing && selectedMethod === 'google' ? t('paymentModal.processing') : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.64 12.2c0-.81-.07-1.6-.21-2.36H12v4.47h6.53c-.28 1.45-1.07 2.68-2.24 3.46v2.87h3.62c2.12-1.95 3.34-4.82 3.34-8.44z"/><path fill="#34A853" d="M12 24c3.27 0 6.02-1.08 8.03-2.93l-3.62-2.87c-1.09.73-2.48 1.16-4.41 1.16-3.39 0-6.26-2.29-7.29-5.37H.97v2.98C2.98 20.93 7.15 24 12 24z"/><path fill="#FBBC05" d="M4.71 14.63c-.26-.78-.41-1.62-.41-2.48s.15-1.7.41-2.48V6.69H.97C.35 7.93 0 9.35 0 10.85s.35 2.92.97 4.16l3.74-2.88z"/><path fill="#EA4335" d="M12 4.75c1.78 0 3.38.61 4.64 1.82l3.47-3.47C18.02 1.18 15.27 0 12 0 7.15 0 2.98 3.07.97 7.02l3.74 2.88c1.03-3.08 3.9-5.15 7.29-5.15z"/></svg>
                  {t('paymentModal.pay')}
                </>
              )}
            </button>
          </div>

          <button 
            className="pay-btn" 
            style={{ marginTop: '16px', background: 'transparent', color: 'var(--ink-lt)', border: 'none', padding: '10px' }} 
            onClick={onClose}
            disabled={isProcessing}
          >
            {t('paymentModal.cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}