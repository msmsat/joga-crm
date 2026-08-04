import { createPortal } from 'react-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import PaymentModal from './PaymentModal'; // Імпортуємо
import { useTelegram } from '../../hooks/useTelegram';
import { buySubscription } from '../../api/user';

interface BuyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function BuyModal({ isOpen, onClose, onSuccess }: BuyModalProps) {
  const { t } = useTranslation();
  const { tg, tg_id } = useTelegram();
  // 🔥 Стейт раскрытой карточки живет прямо внутри модалки!
  const [expandedBuyId, setExpandedBuyId] = useState<number | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<any>(null);

  const handleSelectAbonement = (opt: any) => {
    setSelectedSub(opt);     // Запам'ятовуємо, ЩО саме купуємо
    setIsPaymentOpen(true);  // Відкриваємо вікно з чеком
  };

  const finishPurchase = async () => {
    if (!selectedSub) return;

    try {
      // Відправляємо реальний POST запит на бэкенд FastAPI
      await buySubscription(tg_id, {
        type: selectedSub.key,
        total_classes: selectedSub.classes,
        amount: selectedSub.priceNum,
        valid_days: 30 // За умовою всі абонементи діють 30 днів
      });

      // 🔥 2. СПОЧАТКУ оновлюємо дані у профілі! (Запит полетить у фоні)
      if (onSuccess) onSuccess();

      // 🔥 3. ТОДІ показуємо повідомлення. Поки клієнт його читає, UI позаду вже зміниться!
      alert(t('buyModal.success', { name: t(`subscription.${selectedSub.key}.name`) }));
      
      // 4. Закриваємо модалку
      handleClose();

    } catch (error: any) {
      // Якщо бэкенд поверне помилку, ми зловимо її тут
      alert(error.message || t('buyModal.activate_error'));
    }
  };

  // Кастомная функция закрытия, которая заодно сворачивает открытую карточку
  const handleClose = () => {
    setExpandedBuyId(null);
    onClose();
  };

  return (
    <>
      {createPortal(
        <div 
          className={`modal-overlay ${isOpen ? 'open' : ''}`} 
          id="buy-modal" 
          onClick={(e) => (e.target as any).id === 'buy-modal' && handleClose()}
        >
          <div className="modal-sheet">
            <div className="modal-handle"></div>
            <div className="modal-content">
              <div className="modal-tag">{t('buyModal.tag')}</div>
              <div className="modal-title">{t('buyModal.title')}</div>
              <div className="modal-sub">{t('buyModal.sub')}</div>
              
              <div className="buy-options" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
                {[
                  { id: 1, key: 'light_flow', priceNum: 1800, classes: 4, popular: false },
                  { id: 2, key: 'balance_pro', priceNum: 3200, classes: 8, popular: true },
                  { id: 3, key: 'zen_master', priceNum: 4500, classes: 12, popular: false },
                  { id: 4, key: 'unlimited', priceNum: 6000, classes: 999, popular: false },
                ].map((opt) => {
                  const isExpanded = expandedBuyId === opt.id;

                  return (
                    <div 
                      key={opt.id} 
                      className="buy-card" 
                      onClick={() => {
                        setExpandedBuyId(isExpanded ? null : opt.id);
                        if (tg) tg.HapticFeedback.impactOccurred('light');
                      }}
                      style={{
                        padding: '16px',
                        borderRadius: 'var(--r-card)',
                        border: opt.popular ? '2px solid var(--gold)' : '1px solid var(--linen-dk)',
                        background: 'var(--warm-white)',
                        display: 'flex',
                        flexDirection: 'column',
                        position: 'relative',
                        transition: 'all 0.3s ease',
                        cursor: 'pointer'
                      }}
                    >
                      {opt.popular && <span style={{ position: 'absolute', top: '-10px', right: '12px', background: 'var(--gold)', color: 'white', fontSize: '8px', padding: '2px 8px', borderRadius: '10px', textTransform: 'uppercase' }}>{t('buyModal.popular')}</span>}
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{t(`subscription.${opt.key}.name`)}</div>
                          <div style={{ fontSize: '12px', color: 'var(--ink-lt)' }}>{opt.classes === 999 
                            ? t('subscription.unlimited_desc') 
                            : `${opt.classes} ${t('common.classes_count')}`}</div>
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--navy-md)' }}>{opt.priceNum.toLocaleString('ru-RU')} {t('common.currency')}</div>
                          <div style={{ 
                            color: 'var(--gold)', 
                            transition: 'transform 0.3s ease', 
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            fontSize: '12px'
                          }}>
                            ▼
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={{ marginTop: '16px', borderTop: '1px solid var(--linen-dk)', paddingTop: '16px', animation: 'fadeIn 0.3s ease' }}>
                          <button 
                            className="pay-btn" 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClose();
                              handleSelectAbonement(opt);
                            }}
                          >
                            {t('buyModal.pay', { price: `${opt.priceNum.toLocaleString('ru-RU')} ${t('common.currency')}` })}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button className="pay-btn" style={{ marginTop: '24px' }} onClick={handleClose}>
                {t('buyModal.close')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      <PaymentModal 
      isOpen={isPaymentOpen}
      onClose={() => setIsPaymentOpen(false)}
      itemName={selectedSub?.name || ''}
      amountStr={selectedSub?.priceNum?.toLocaleString('ru-RU') || ''}
      onSuccess={finishPurchase}
      />
    </>
  );
}