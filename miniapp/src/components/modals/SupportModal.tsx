import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';


// 2. Интерфейс (Архитектура данных)
// Мы говорим: "Эта модалка ждет два параметра: isOpen (булево значение) и onClose (функцию)"
interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// 3. Сама функция компонента
export default function SupportModal({ isOpen, onClose }: SupportModalProps) {
  const { t } = useTranslation();
  return createPortal(
    <div 
      className={`modal-overlay ${isOpen ? 'open' : ''}`} 
      id="support-modal" 
      onClick={(e) => (e.target as any).id === 'support-modal' && onClose()}
    >
      <div className="modal-sheet">
        <div className="modal-handle"></div>
        <div className="modal-content" style={{ textAlign: 'center', paddingBottom: '20px' }}>
          <div className="modal-tag">{t('supportModal.tag')}</div>
          <div className="modal-title">{t('supportModal.title')}</div>
          
          <div style={{ marginTop: '20px', marginBottom: '24px' }}>
            <div style={{ 
              width: '60px', 
              height: '60px', 
              background: 'var(--linen)', 
              borderRadius: '50%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              margin: '0 auto 16px' 
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--navy-md)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p style={{ fontSize: '15px', color: 'var(--ink)', lineHeight: '1.6', fontWeight: 300 }}>
              {t('supportModal.description')}
            </p>
          </div>

          <button className="pay-btn" onClick={onClose}>
            {t('supportModal.button')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}