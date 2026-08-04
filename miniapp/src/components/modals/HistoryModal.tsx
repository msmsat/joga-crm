import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useTelegram } from '../../hooks/useTelegram';
import { getUserPayments, type PaymentResponse } from '../../api/user';
import { useEffect, useState } from 'react';

// Интерфейс для пропсов
interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Компонент модалки истории оплат
export default function HistoryModal({ isOpen, onClose }: HistoryModalProps) {
  const { t } = useTranslation();
  const { tg_id } = useTelegram();
  
  // 🔥 3. Стейт для зберігання оплат та статусу завантаження
  const [payments, setPayments] = useState<PaymentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 🔥 4. Завантажуємо дані ЩОРАЗУ, коли модалка відкривається
  useEffect(() => {
    if (isOpen && tg_id) {
      const fetchHistory = async () => {
        setIsLoading(true);
        try {
          const data = await getUserPayments(tg_id);
          setPayments(data);
        } catch (error) {
          console.error("Помилка завантаження історії оплат:", error);
        } finally {
          setIsLoading(false);
        }
      };

      fetchHistory();
    }
  }, [isOpen, tg_id]);
  

  return createPortal(
    <div 
      className={`modal-overlay ${isOpen ? 'open' : ''}`} 
      id="history-modal" 
      onClick={(e) => (e.target as any).id === 'history-modal' && onClose()}
    >
      <div className="modal-sheet">
        <div className="modal-handle"></div>
        <div className="modal-content">
          <div className="modal-tag">{t('historyModal.tag')}</div>
          <div className="modal-title">{t('historyModal.title')}</div>
          <div className="modal-sub">{t('historyModal.sub')}</div>
          
          <div className="history-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--ink-lt)', fontStyle: 'italic' }}>
                {t('historyModal.searching')}
              </div>
            ) : payments.length > 0 ? (
              payments.map((item, i) => (
                <div key={i} style={{ padding: '14px', borderRadius: 'var(--r-sm)', background: 'var(--warm-white)', border: '1px solid var(--linen-dk)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1, paddingRight: '10px' }}>
                    {/* Виводимо опис (description) */}
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--ink)', lineHeight: '1.2', marginBottom: '4px' }}>
                      {item.action_type === 'buy_subscription' 
                        ? t('payment.action.buy_subscription', { item: t(`subscription.${item.item_key}.name`, { defaultValue: item.description }) })
                        : item.description}
                    </div>
                    {/* Виводимо дату та перекладаємо статус */}
                    <div style={{ fontSize: '11px', color: 'var(--ink-lt)' }}>
                      {item.date_str} · {item.status === 'success' ? t('historyModal.status_success') : item.status}
                    </div>
                  </div>
                  {/* Виводимо суму */}
                  <div style={{ fontWeight: 600, color: 'var(--navy-md)', fontSize: '13px', whiteSpace: 'nowrap' }}>
                    {item.amount_str}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--ink-lt)', fontWeight: 300 }}>
                {t('historyModal.no_payments')}
              </div>
            )}
          </div>

          <button className="pay-btn" style={{ marginTop: '24px' }} onClick={onClose}>
            {t('historyModal.close')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
