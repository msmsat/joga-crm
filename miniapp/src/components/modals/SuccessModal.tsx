import { createPortal } from 'react-dom';import { useTranslation } from 'react-i18next';import { type LessonResponse } from '../../api/lessons';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  lesson: LessonResponse | null;
}

export default function SuccessModal({ isOpen, onClose, lesson }: SuccessModalProps) {
  const { t } = useTranslation();

  return createPortal(
    <div className={`success-overlay ${isOpen ? 'show' : ''}`} id="success">
      <div className="success-leaves">
        {[
          { x: 5, y: 10, w: 80, h: 120, delay: 0 },
          { x: 60, y: 5, w: 60, h: 90, delay: 1 },
          { x: 75, y: 50, w: 70, h: 100, delay: 2 },
          { x: 0, y: 55, w: 65, h: 95, delay: 1.5 },
          { x: 30, y: 75, w: 50, h: 80, delay: 0.5 },
        ].map((leaf, idx) => (
          <svg key={idx} className="success-leaf" style={{ left: `${leaf.x}%`, top: `${leaf.y}%`, width: `${leaf.w}px`, height: `${leaf.h}px`, animationDelay: `${leaf.delay}s` }} viewBox="0 0 70 100">
            <path d="M35 98 C35 98 5 75 6 42 C7 12 35 2 35 2 C35 2 65 14 63 45 C62 76 35 98 35 98Z" />
            <line x1="35" y1="98" x2="35" y2="2" />
            <path d="M35 50 C24 44 18 36 17 28" />
            <path d="M35 65 C46 58 52 49 52 40" />
          </svg>
        ))}
      </div>
      <div className="lotus-wrap">
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <path d="M36 60 C36 60 20 48 20 36 C20 26 28 20 36 20 C44 20 52 26 52 36 C52 48 36 60 36 60Z" stroke="rgba(200,168,122,0.6)" strokeWidth="1.2" />
          <path d="M36 60 C36 60 12 52 10 36 C8 22 22 14 36 14 C50 14 64 22 62 36 C60 52 36 60 36 60Z" stroke="rgba(200,168,122,0.4)" strokeWidth="1" />
          <path d="M36 60 C36 60 4 56 2 36 C0 18 18 8 36 8 C54 8 72 18 70 36 C68 56 36 60 36 60Z" stroke="rgba(200,168,122,0.25)" strokeWidth="0.8" />
          <circle cx="36" cy="36" r="6" fill="rgba(200,168,122,0.3)" stroke="rgba(200,168,122,0.6)" strokeWidth="1" />
          <line x1="36" y1="60" x2="36" y2="8" stroke="rgba(200,168,122,0.2)" strokeWidth="0.8" />
        </svg>
      </div>
      <div className="success-title">{t('successModal.title')}</div>
      <div className="success-sub">
        {t('successModal.subtitle', { name: lesson?.name || t('successModal.default_lesson'), time: lesson?.time || '' })}
      </div>
      <button className="success-close" onClick={onClose}>{t('successModal.button')}</button>
    </div>,
    document.body
  );
}