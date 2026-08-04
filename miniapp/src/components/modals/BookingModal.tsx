import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { LessonResponse } from '../../api/lessons';

const tg = (window as any).Telegram?.WebApp;

// Описываем, какие данные модалка будет получать из App.tsx
interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSpot: number | null;
  onSpotSelect: (spot: number) => void;
  isProcessing: boolean;
  onPay: () => void;
  onCancel: () => void;
  lesson: LessonResponse | null;
}

export default function BookingModal({
  isOpen,
  onClose,
  selectedSpot,
  onSpotSelect,
  isProcessing,
  onPay,
  onCancel,
  lesson,
}: BookingModalProps) {
  const { t } = useTranslation();

  return createPortal(
    <div 
      className={`modal-overlay ${isOpen ? 'open' : ''}`} 
      id="modal" 
      onClick={(e) => (e.target as any).id === 'modal' && onClose()}
    >
      <div className="modal-sheet">
        <div className="modal-content">
          {/* 1. Динамический тег и название */}
          <div className="modal-tag">
            {lesson?.equipment ? t(`lesson.equipment.${lesson.equipment}`, { defaultValue: lesson.equipment }) : t('bookingModal.training')} · {t('bookingModal.today')}
          </div>
          <div className="modal-title">
            {lesson?.name ? t(`lesson.name.${lesson.name}`, { defaultValue: lesson.name }) : ''}
          </div>
          
          
          {/* 2. Тренер, время и длительность */}
          <div className="modal-sub">{lesson?.teacher} · {lesson?.time} · {lesson?.dur}</div>
          
          <div className="modal-details">
            <div className="modal-detail">
              <div className="modal-detail-label">{t('bookingModal.level')}</div>
              <div className="modal-detail-val">
                {/* Динамически подставляем тип из базы. 
                    Например, если lesson.level = "all_levels", он запросит t('lesson.level.all_levels') 
                    defaultValue спасает, если в базе вдруг остался старый текст на украинском! */}
                {lesson?.level ? t(`lesson.level.${lesson.level}`, { defaultValue: lesson.level }) : '—'}
              </div>
            </div>
            <div className="modal-detail">
              <div className="modal-detail-label">{t('bookingModal.spots')}</div>
              <div className="modal-detail-val">
                {/* Вычисляем остаток: общее кол-во минус количество занятых мест */}
                {(() => {
                  const total = lesson?.total_spots || 0;
                  const taken = lesson?.taken_spots?.length || 0;
                  const left = total - taken;
                  return left > 0 
                    ? t('bookingModal.spots_count', { left, total }) 
                    : t('bookingModal.no_spots');
                })()}
              </div>
            </div>
            <div className="modal-detail">
              <div className="modal-detail-label">{t('bookingModal.equipment')}</div>
              <div className="modal-detail-val">
                {lesson?.equipment ? t(`lesson.equipment.${lesson.equipment}`, { defaultValue: lesson.equipment }) : '—'}
              </div>
            </div>
            <div className="modal-detail">
              <div className="modal-detail-label">{t('bookingModal.price')}</div>
              <div className="modal-detail-val">{lesson?.price_str}</div>
            </div>
          </div>
          
          {/* 🔥 Якщо користувач ВЖЕ записаний — показуємо кнопку скасування */}
          {lesson?.is_booked_by_user ? (
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <div style={{ marginBottom: '15px', fontSize: '14px', color: 'var(--ink)' }}>
                {t('bookingModal.already_booked')}
              </div>
              <button 
                className="pay-btn" 
                onClick={onCancel} 
                disabled={isProcessing}
                style={{ 
                  background: 'transparent', 
                  color: '#d32f2f', 
                  border: '1px solid #d32f2f',
                  opacity: isProcessing ? 0.6 : 1 
                }}
              >
                {isProcessing ? t('bookingModal.processing') : t('bookingModal.cancel_booking')}
              </button>
            </div>
          ) : (
            // 🔥 Якщо НЕ записаний — показуємо вибір килимка і кнопку оплати (твій старий код)
            <>
              <div style={{ fontSize: '9px', color: 'var(--ink-lt)', marginBottom: '12px', textAlign: 'center', letterSpacing: '2px', textTransform: 'uppercase', marginTop: '16px' }}>
                {t('bookingModal.choose_spot')}
              </div>
              
              <div className="spots-map" id="spots">
                {Array.from({ length: lesson?.total_spots || 8 }, (_, i) => i + 1).map(i => {
                  const isTaken = lesson?.taken_spots?.includes(i) || false;
                  return (
                    <div
                      key={i}
                      className={`spot ${isTaken ? 'taken' : ''} ${selectedSpot === i ? 'selected' : ''}`}
                      onClick={() => {
                        if (!isTaken) {
                          onSpotSelect(i);
                          if (tg) tg.HapticFeedback.impactOccurred('light');
                        }
                      }}
                    />
                  );
                })}
              </div>
              
              <button 
                className="pay-btn" 
                onClick={onPay} 
                disabled={isProcessing || !selectedSpot}
                style={{ opacity: (isProcessing || !selectedSpot) ? 0.6 : 1 }}
              >
                {isProcessing ? t('bookingModal.processing') : t('bookingModal.pay', { price: lesson?.price_str || '0 ₴' })}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}