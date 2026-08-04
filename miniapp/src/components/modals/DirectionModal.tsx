import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
// 🔥 1. Импортируем правильный тип с нашего API
import { type LessonResponse } from '../../api/lessons';

// Описываем пропсы
interface DirectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDirLabel: string | null;
  todayClasses: LessonResponse[]; // Теперь тут массив реальных занятий с бэкенда
  isLoading: boolean;             // Флаг загрузки
  onClassSelect: (cl: LessonResponse) => void; // Теперь передаем объект класса наружу
}

export default function DirectionModal({
  isOpen,
  onClose,
  selectedDirLabel,
  todayClasses,
  isLoading,
  onClassSelect,
}: DirectionModalProps) {
  const { t } = useTranslation();

  return createPortal(
    <div 
      className={`modal-overlay ${isOpen ? 'open' : ''}`} 
      id="dir-modal" 
      onClick={(e) => (e.target as any).id === 'dir-modal' && onClose()}
      style={{ zIndex: 150 }}
    >
      <div className="modal-sheet">
        <div className="modal-handle"></div>
        <div className="modal-content">
          <div className="modal-tag">{t('directionModal.tag')}</div>
          <div className="modal-title">{selectedDirLabel}</div>
          <div className="modal-sub">{t('directionModal.sub')}</div>
          
          <div className="class-list" style={{ padding: '10px 0 20px 0' }}>
            {/* 🔥 2. Если идет загрузка — показываем текст */}
            {isLoading ? (
              <div style={{ textAlign: 'center', color: 'var(--ink-lt)', padding: '30px 0', fontSize: '15px', fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic' }}>
                {t('directionModal.searching')}
              </div>
            ) : todayClasses.length > 0 ? (
              // 🔥 3. Фильтровать больше не нужно, бэкенд уже отдал только "Йогу"
              todayClasses.map((cl, i) => {
                const initials = cl.teacher.split(' ').map((x) => x[0]).join('');
                return (
                  <div 
                    className="class-card" 
                    key={i} 
                    onClick={() => {
                      onClose();
                      onClassSelect(cl);
                    }}
                  >
                    <div className="class-card-top">
                      <span className="class-time">{cl.time} · {cl.dur}</span>
                      <span className={`class-badge ${cl.badge === 'almost' ? 'badge-almost' : 'badge-open'}`}>
                        {cl.badge === 'almost' ? t('directionModal.almost_full') : t('directionModal.available')}
                      </span>
                    </div>
                    <div className="class-name">{cl.name}</div>
                    <div className="class-card-bottom">
                      <div className="teacher">
                        {/* Берем цвет из нашего @computed_field */}
                        <div className="teacher-avatar" style={{ background: cl.color }}>{initials}</div>
                        <span className="teacher-name">{cl.teacher}</span>
                      </div>
                      {/* 🔥 4. Выводим красивую цену (price_str) */}
                      <span className="class-price">{cl.price_str}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              // 🔥 5. Если массив пустой и не грузится — значит занятий нет
              <div style={{ textAlign: 'center', color: 'var(--ink-lt)', padding: '20px 0', fontSize: '14px', fontWeight: 300 }}>
                {t('directionModal.empty')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}