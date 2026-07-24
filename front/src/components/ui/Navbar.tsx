import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAIDrawer } from '../../contexts/AIDrawerContext';
import { useAssistant } from '../../hooks/useAssistant';

export interface NavbarProps {
  title: string;
  subtitle: string;
}

// Верхняя панель каркаса: заголовок раздела, AI-строка по центру (Spotlight-стиль
// с выпадающей панелью ответа), кнопки AI-дровера и «+ Создать» справа.
// AI-строка — третья поверхность общего чата (эпик AI-1, задача 7): вопрос
// отсюда создаёт/продолжает ту же сессию, что видна на странице AI и в дровере.
export function Navbar({ title, subtitle }: NavbarProps) {
  const { t } = useTranslation('ai');
  const { isOpen: isDrawerOpen, toggle: toggleDrawer, open: openDrawer } = useAIDrawer();
  const { messages, isThinking, sendMessage } = useAssistant();

  const handlePrimaryBtn = () => alert('Создать новую запись');

  const [isAiFocused, setIsAiFocused] = useState(false); // Для Glow-эффекта
  const [aiQuery, setAiQuery] = useState(''); // Для текста в инпуте

  const [panelOpen, setPanelOpen] = useState(false);
  const [askedQuery, setAskedQuery] = useState('');
  // Отличаем настоящий ответ от отката оптимистики при ошибке: считаем
  // сообщения до отправки, сверяем прирост после — не показываем чужой/старый
  // ответ, если запрос упал (тост об ошибке уже покажет useAssistant).
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [prevIsThinking, setPrevIsThinking] = useState(isThinking);
  const [answeredId, setAnsweredId] = useState<number | null>(null);
  if (isThinking !== prevIsThinking) {
    setPrevIsThinking(isThinking);
    if (prevIsThinking && !isThinking) {
      const grew = pendingCount != null && messages.length >= pendingCount + 2;
      const last = messages[messages.length - 1];
      if (grew && last?.role === 'assistant') setAnsweredId(last.id);
      setPendingCount(null);
    }
  }

  const aiSearchRef = useRef<HTMLDivElement | null>(null);

  const closeAiPanel = () => setPanelOpen(false);

  const handleAskAi = (query: string) => {
    setAskedQuery(query);
    setAnsweredId(null);
    setPanelOpen(true);
    setPendingCount(messages.length);
    void sendMessage(query);
  };

  const handleContinueInChat = () => {
    closeAiPanel();
    openDrawer();
  };

  // Закрытие по клику вне панели
  useEffect(() => {
    if (!panelOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (aiSearchRef.current && !aiSearchRef.current.contains(e.target as Node)) {
        closeAiPanel();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [panelOpen]);

  const answeredText = messages.find((m) => m.id === answeredId)?.text ?? '';

  return (
    <div className="topbar" style={{
      position: 'relative', /* 🔥 ВОТ ЭТА СТРОКА ВКЛЮЧАЕТ Z-INDEX 🔥 */
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      height: 'var(--topbar-h)',
      background: 'var(--bg-card, #FFFFFF)',
      borderBottom: '1px solid rgba(26,26,26,0.04)',
      zIndex: 100 /* Теперь это реально работает */
    }}>

      {/* 🔥 Keyframes для AI-панели: свечение, спиннер, шиммер, точки, каретка */}
      <style>{`
        @keyframes velora-ai-spin { to { transform: rotate(360deg); } }
        @keyframes velora-ai-glow {
          0%, 100% { opacity: 0.5; transform: scale(0.88); }
          50% { opacity: 1; transform: scale(1.18); }
        }
        @keyframes velora-ai-dot-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes velora-ai-shimmer-move {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes velora-ai-fade-up {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes velora-ai-caret-blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        .velora-ai-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #F9A08B;
          display: inline-block;
          animation: velora-ai-dot-bounce 1s ease-in-out infinite;
        }
        .velora-ai-shimmer {
          background: linear-gradient(90deg, #A0A0A0 0%, #1A1A1A 50%, #A0A0A0 100%);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: velora-ai-shimmer-move 1.8s linear infinite;
        }
        .velora-ai-caret {
          display: inline-block;
          width: 2px;
          height: 14px;
          background: #F9A08B;
          margin-left: 2px;
          vertical-align: middle;
          animation: velora-ai-caret-blink 0.9s step-end infinite;
        }
      `}</style>

      {/* 1. ЛЕВАЯ ЧАСТЬ (Заголовки) */}
      <div style={{ flex: '1 1 0%', minWidth: 0 }}>
        <div className="topbar-title" style={{ fontSize: '20px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.4px' }}>{title}</div>
        <div className="topbar-subtitle" style={{ fontSize: '13px', color: '#666666', marginTop: '2px' }}>{subtitle}</div>
      </div>

      {/* 2. ЦЕНТРАЛЬНАЯ ЧАСТЬ (Премиальный AI-Инпут) */}
      <div ref={aiSearchRef} style={{ flex: '0 1 var(--ai-search-w)', padding: '0 24px', position: 'relative' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          height: '44px',
          background: '#FFFFFF',
          borderRadius: panelOpen ? '14px 14px 4px 4px' : '14px', // Срастается с панелью снизу, когда она открыта
          border: isAiFocused ? '1px solid #F9A08B' : '1px solid rgba(26,26,26,0.08)',
          borderBottom: panelOpen ? '1px solid rgba(26,26,26,0.06)' : undefined,
          // Тот самый эффект "левитирующего Glow"
          boxShadow: isAiFocused
            ? '0 0 0 4px rgba(249,160,139,0.12), 0 8px 24px -4px rgba(26,26,26,0.08)'
            : '0 2px 12px rgba(26,26,26,0.03)',
          padding: '0 14px',
          transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          transform: isAiFocused ? 'translateY(-1px)' : 'none'
        }}>
          {/* Иконка искры */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isAiFocused ? "#F9A08B" : "#A0A0A0"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke 0.3s', flexShrink: 0 }}>
            <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/>
          </svg>

          <input
            type="text"
            placeholder={t('chat.navbarPlaceholder')}
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            onFocus={() => setIsAiFocused(true)}
            onBlur={() => setIsAiFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && aiQuery.trim() && !isThinking) {
                handleAskAi(aiQuery.trim());
                setAiQuery('');
              }
              if (e.key === 'Escape' && panelOpen) {
                closeAiPanel();
              }
            }}
            maxLength={4000}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '14px',
              fontFamily: 'var(--font)',
              fontWeight: 500,
              color: '#1A1A1A',
              padding: 0
            }}
          />

          {/* Элегантная заглушка Enter — уступает счётчику символов у лимита */}
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            color: isAiFocused ? '#F9A08B' : '#A0A0A0',
            background: isAiFocused ? 'rgba(249,160,139,0.1)' : 'rgba(26,26,26,0.04)',
            padding: '4px 8px',
            borderRadius: '6px',
            transition: 'all 0.3s',
            pointerEvents: 'none',
            userSelect: 'none'
          }}>
            {aiQuery.length > 3500 ? t('chat.charCount', { count: aiQuery.length }) : panelOpen ? 'Esc' : 'Enter'}
          </div>
        </div>

        {/* 🔥 Сама выпадающая AI-панель: плавно "вырастает" из поисковика */}
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '24px',
          right: '24px',
          maxHeight: panelOpen ? '420px' : '0px',
          opacity: panelOpen ? 1 : 0,
          transform: panelOpen ? 'translateY(0)' : 'translateY(-6px)',
          overflow: 'hidden',
          transition: 'max-height 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          pointerEvents: panelOpen ? 'auto' : 'none',
          zIndex: 20,
          background: '#FFFFFF',
          borderRadius: '0 0 16px 16px', // Идеально круглые нижние углы
          border: '1px solid rgba(26,26,26,0.1)', // Четкая, но тонкая граница
          borderTop: 'none', // Убираем верхнюю линию, чтобы сливалось с инпутом
          boxShadow: '0 24px 48px -12px rgba(26,26,26,0.18)' // Более глубокая тень
        }}>
          <div style={{
            padding: '18px 20px 20px' // Внутреннему блоку оставляем только отступы
          }}>

            {/* Запрос пользователя — тихо "эхом" сверху */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#C7C7C7', flexShrink: 0 }} />
              <span style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#999999',
                letterSpacing: '0.1px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {askedQuery}
              </span>
            </div>

            {/* Состояние: думает → отвечает */}
            {isThinking ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '4px 0 6px' }}>
                <div style={{ position: 'relative', width: '26px', height: '26px', flexShrink: 0 }}>
                  {/* Мягкое пульсирующее свечение вокруг иконки */}
                  <div style={{
                    position: 'absolute',
                    inset: '-7px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(249,160,139,0.38) 0%, rgba(249,160,139,0) 72%)',
                    animation: 'velora-ai-glow 1.7s ease-in-out infinite'
                  }} />
                  {/* Вращающееся кольцо-загрузчик с градиентом */}
                  <svg width="26" height="26" viewBox="0 0 26 26" style={{ position: 'absolute', inset: 0, animation: 'velora-ai-spin 1s linear infinite' }}>
                    <defs>
                      <linearGradient id="velora-ai-ring" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#F9A08B" stopOpacity="0" />
                        <stop offset="100%" stopColor="#F9A08B" stopOpacity="1" />
                      </linearGradient>
                    </defs>
                    <circle cx="13" cy="13" r="10.5" fill="none" stroke="url(#velora-ai-ring)" strokeWidth="2" strokeLinecap="round" strokeDasharray="42 24" />
                  </svg>
                  {/* Искра по центру — тот же символ, что и в инпуте */}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="#F9A08B" style={{ position: 'absolute', top: '6.5px', left: '6.5px' }}>
                    <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/>
                  </svg>
                </div>
                <span className="velora-ai-shimmer" style={{ fontSize: '13.5px', fontWeight: 600 }}>
                  {t('chat.thinkingAnswer')}
                </span>
                <span style={{ display: 'flex', gap: '3px', marginLeft: '-2px' }}>
                  <i className="velora-ai-dot" style={{ animationDelay: '0s' }} />
                  <i className="velora-ai-dot" style={{ animationDelay: '0.15s' }} />
                  <i className="velora-ai-dot" style={{ animationDelay: '0.3s' }} />
                </span>
              </div>
            ) : answeredText ? (
              <div style={{
                fontSize: '14.5px',
                lineHeight: 1.6,
                color: '#1A1A1A',
                fontWeight: 500,
                animation: 'velora-ai-fade-up 0.35s ease both'
              }}>
                <div>{answeredText}</div>
                <button
                  onClick={handleContinueInChat}
                  style={{
                    marginTop: '12px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    color: '#F9A08B',
                    background: 'rgba(249,160,139,0.1)',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '7px 12px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font)',
                  }}
                >
                  {t('chat.continueInChat')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* 3. ПРАВАЯ ЧАСТЬ (Кнопки) */}
      <div style={{ flex: '1 1 0%', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>

        <button
          onClick={toggleDrawer}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0 16px',
            height: '38px',
            borderRadius: '10px',
            border: isDrawerOpen ? '1.5px solid rgba(249,160,139,0.5)' : '1.5px solid rgba(26,26,26,0.1)',
            background: isDrawerOpen ? 'rgba(249,160,139,0.08)' : 'rgba(26,26,26,0.03)',
            color: isDrawerOpen ? '#F9A08B' : 'var(--muted)',
            fontSize: '13.5px',
            fontWeight: 700,
            fontFamily: 'var(--font)',
            cursor: 'pointer',
            marginRight: '12px',
            transition: 'all 0.24s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/>
          </svg>
          AI
        </button>

        <button
          onClick={handlePrimaryBtn}
          style={{
            height: '38px',
            padding: '0 18px',
            background: '#1A1A1A', // Строгий Оникс
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '10px',
            fontSize: '13.5px',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'var(--font)',
            transition: 'all 0.25s cubic-bezier(0.34, 1.5, 0.64, 1)',
            boxShadow: '0 4px 12px rgba(26,26,26,0.15)'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(26,26,26,0.2)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(26,26,26,0.15)';
          }}
        >
          + Создать
        </button>
      </div>
    </div>
  );
}
