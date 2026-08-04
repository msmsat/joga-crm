import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom'; // 🔥 Тот самый инструмент!
import { useTranslation } from 'react-i18next';
import { useTelegram } from '../../hooks/useTelegram';

interface LanguageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FLAG_VIEWBOX = '0 0 24 16';

function FlagUA() {
  return (
    <svg viewBox={FLAG_VIEWBOX} width="28" height="20">
      <rect width="24" height="8" fill="#0057B7" />
      <rect y="8" width="24" height="8" fill="#FFD700" />
    </svg>
  );
}

function FlagGB() {
  return (
    <svg viewBox={FLAG_VIEWBOX} width="28" height="20">
      <rect width="24" height="16" fill="#00247D" />
      <path d="M0 0L24 16M24 0L0 16" stroke="#fff" strokeWidth="3" />
      <path d="M0 0L24 16M24 0L0 16" stroke="#CF142B" strokeWidth="1.4" />
      <path d="M12 0V16M0 8H24" stroke="#fff" strokeWidth="5" />
      <path d="M12 0V16M0 8H24" stroke="#CF142B" strokeWidth="2.4" />
    </svg>
  );
}

function FlagCZ() {
  return (
    <svg viewBox={FLAG_VIEWBOX} width="28" height="20">
      <rect width="24" height="8" fill="#fff" />
      <rect y="8" width="24" height="8" fill="#D7141A" />
      <path d="M0 0L12 8L0 16Z" fill="#11457E" />
    </svg>
  );
}

function FlagRU() {
  return (
    <svg viewBox={FLAG_VIEWBOX} width="28" height="20">
      <rect width="24" height="5.33" fill="#fff" />
      <rect y="5.33" width="24" height="5.33" fill="#0039A6" />
      <rect y="10.67" width="24" height="5.33" fill="#D52B1E" />
    </svg>
  );
}

export default function LanguageModal({ isOpen, onClose }: LanguageModalProps) {
  const { i18n, t } = useTranslation();
  const { tg } = useTelegram();
  
  // Два стейта: один для рендера в HTML, другой для запуска CSS-анимации
  const [show, setShow] = useState(false);
  const [render, setRender] = useState(false);

  // Магия плавной анимации
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    if (isOpen) {
      setRender(true);
      // Даем браузеру миллисекунду на отрисовку перед выездом
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setShow(true));
      });
    } else {
      setShow(false);
      // Ждем 300мс пока модалка уедет вниз, прежде чем удалять её
      timeoutId = setTimeout(() => setRender(false), 300);
    }
    return () => clearTimeout(timeoutId);
  }, [isOpen]);

  if (!render) return null;

  const languages = [
    { code: 'uk', name: 'Українська', flag: <FlagUA /> },
    { code: 'en', name: 'English', flag: <FlagGB /> },
    { code: 'cz', name: 'Čeština', flag: <FlagCZ /> },
    { code: 'ru', name: 'Русский', flag: <FlagRU /> }
  ];

  // Безопасное получение языка
  const currentLang = i18n.language || 'uk';

  const handleSelect = (code: string) => {
    i18n.changeLanguage(code);
    if (tg) tg.HapticFeedback.selectionChanged();
    onClose();
  };

  const modalContent = (
    <div 
      onClick={onClose} 
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 99999, // 🔥 Поверх абсолютно всего
        display: 'flex',
        alignItems: 'flex-end', // Прижимаем к низу
        justifyContent: 'center',
        opacity: show ? 1 : 0,
        transition: 'opacity 0.3s ease',
        WebkitTapHighlightColor: 'transparent'
      }}
    >
      <div 
        onClick={e => e.stopPropagation()} 
        style={{
          width: '100%',
          padding: '24px 20px 40px',
          backgroundColor: 'var(--warm-white, #FAF8F5)',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          // 🔥 Идеальный выезд снизу
          transform: show ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.1)'
        }}
      >
        
        {/* Шапка */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: 'var(--ink)' }}>
            {t('profile.language', 'Мова')}
          </h2>
          <button 
            onClick={onClose} 
            style={{ 
              background: 'var(--linen, #E8E0D4)', 
              border: 'none', 
              width: '32px', height: '32px', 
              borderRadius: '50%', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer' 
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"><path d="M18 6L6 18M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Список языков */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {languages.map((lang) => {
            const isSelected = currentLang === lang.code
             || (currentLang.startsWith('en') && lang.code === 'en')
             || (currentLang.startsWith('cz') && lang.code === 'cz')
             || (currentLang.startsWith('ru') && lang.code === 'ru');
            
            return (
              <div 
                key={lang.code}
                onClick={() => handleSelect(lang.code)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px',
                  background: isSelected ? 'var(--linen, #E8E0D4)' : 'var(--warm-white, #FAF8F5)',
                  border: isSelected ? '1px solid var(--gold, #C8A87A)' : '1px solid var(--linen-dk, #D4C9B8)',
                  borderRadius: '16px', cursor: 'pointer', transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <span style={{ display: 'flex', width: '28px', height: '20px', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 0 0 1px rgba(0,0,0,0.08)' }}>
                    {lang.flag}
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: isSelected ? 600 : 500, color: 'var(--ink)' }}>
                    {lang.name}
                  </span>
                </div>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '50%',
                  border: isSelected ? '6px solid var(--gold, #C8A87A)' : '2px solid var(--linen-dk, #D4C9B8)',
                  background: isSelected ? '#fff' : 'transparent', transition: 'all 0.2s ease'
                }}></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // 🔥 РЕНДЕРИМ ПРЯМО В BODY - обходит любые CSS-препятствия страницы!
  return createPortal(modalContent, document.body);
}