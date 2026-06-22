import { useMemo, useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import '../App.css';
import { useAIDrawer } from '../contexts/AIDrawerContext';
import AIDrawer from '../components/AIDrawer';

// ─── КОНФИГУРАЦИЯ ЗАГОЛОВКОВ ─────────────────────────────────────────────────
const ROUTE_META: Record<string, [string, string]> = {
  '/dashboard': ['Дашборд', 'Добро пожаловать в Velora CRM'],
  '/dashboard/staff': ['Сотрудники', 'Управление командой'],
  '/dashboard/clients': ['Клиенты', '142 клиента · 89 активных'],
  '/dashboard/reports': ['Отчёты', 'Аналитика и статистика'],
  '/dashboard/booking': ['Онлайн-запись', 'Управление каналами записи'],
  '/dashboard/finances': ['Финансы', 'Счета, операции, документы'],
  '/dashboard/notifications': ['Уведомления', 'Каналы и типы оповещений'],
  '/dashboard/loyalty': ['Лояльность', 'Программы и карты клиентов'],
  '/dashboard/ai': ['Velora AI', 'Умный ассистент и автоответы'],
  '/dashboard/settings': ['Настройки', 'Конфигурация системы'],
  '/dashboard/billing': ['Тариф и оплата', 'Управление подпиской'],
  '/dashboard/journal': ['Журнал', 'Расписание занятий'],
  '/dashboard/profile': ['Профиль', 'Аккаунт и настройки'],
};

// ─── ГЛАВНЫЙ КОМПОНЕНТ КАРКАСА ────────────────────────────────────────────────
export default function DashboardLayout() {
  const location = useLocation();
  const { isOpen: isDrawerOpen, toggle: toggleDrawer } = useAIDrawer();

  const [title, subtitle] = useMemo(() => {
    const currentPath = location.pathname.replace(/\/$/, ''); 
    return ROUTE_META[currentPath] || ROUTE_META['/dashboard'];
  }, [location.pathname]);

  const handlePrimaryBtn = () => alert('Создать новую запись');

  const [isAiFocused, setIsAiFocused] = useState(false); // Для Glow-эффекта
  const [aiQuery, setAiQuery] = useState(''); // Для текста в инпуте

  // 🔥 Выпадающая AI-панель прямо под поисковиком (Spotlight-стиль)
  const [aiPanel, setAiPanel] = useState<{
    open: boolean;
    query: string;
    status: 'thinking' | 'answering' | 'done';
    answer: string;
  }>({ open: false, query: '', status: 'thinking', answer: '' });

  const aiSearchRef = useRef<HTMLDivElement | null>(null);
  const thinkingTimeoutRef = useRef<number | null>(null);
  const typingIntervalRef = useRef<number | null>(null);

  const closeAiPanel = () => {
    if (thinkingTimeoutRef.current) window.clearTimeout(thinkingTimeoutRef.current);
    if (typingIntervalRef.current) window.clearInterval(typingIntervalRef.current);
    setAiPanel((prev) => ({ ...prev, open: false }));
  };

  // Печатает ответ "по буквам" — придаёт ощущение, что ИИ отвечает в моменте
  const typewriteAnswer = (fullText: string) => {
    let i = 0;
    typingIntervalRef.current = window.setInterval(() => {
      i += 3;
      setAiPanel((prev) => ({ ...prev, answer: fullText.slice(0, i) }));
      if (i >= fullText.length) {
        if (typingIntervalRef.current) window.clearInterval(typingIntervalRef.current);
        setAiPanel((prev) => ({ ...prev, status: 'done', answer: fullText }));
      }
    }, 16);
  };

  const handleAskAi = (query: string) => {
    if (thinkingTimeoutRef.current) window.clearTimeout(thinkingTimeoutRef.current);
    if (typingIntervalRef.current) window.clearInterval(typingIntervalRef.current);

    setAiPanel({ open: true, query, status: 'thinking', answer: '' });

    // ⚠️ Имитация "размышления". Замените на реальный fetch к вашему AI-эндпоинту —
    // просто вызовите setAiPanel({ ...status:'answering' }) и typewriteAnswer(realAnswer) в .then()
    thinkingTimeoutRef.current = window.setTimeout(() => {
      const answer = `Понял запрос «${query}». Подключите сюда реальный вызов вашего AI-бэкенда — сейчас это имитационный ответ для демонстрации анимации.`;
      setAiPanel((prev) => ({ ...prev, status: 'answering' }));
      typewriteAnswer(answer);
    }, 1400);
  };

  // Закрытие по клику вне панели
  useEffect(() => {
    if (!aiPanel.open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (aiSearchRef.current && !aiSearchRef.current.contains(e.target as Node)) {
        closeAiPanel();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [aiPanel.open]);

  // Чистим таймеры при размонтировании
  useEffect(() => {
    return () => {
      if (thinkingTimeoutRef.current) window.clearTimeout(thinkingTimeoutRef.current);
      if (typingIntervalRef.current) window.clearInterval(typingIntervalRef.current);
    };
  }, []);

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      fontFamily: 'var(--font)',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontSize: '14px',
      lineHeight: 1.5,
      paddingRight: isDrawerOpen ? '420px' : '0',
      transition: 'padding-right 380ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
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

      {/* ─── SIDEBAR ─── */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-name">
            <span className="logo-dot"></span>
            Velora CRM
          </div>
          <div className="logo-sub">Studio Pro · Пилатес центр</div>
        </div>

        <div className="sidebar-nav">
          <NavLink to="/dashboard" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
            Дашборд
          </NavLink>
          
          <NavLink to="/dashboard/staff" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0-3-3.85" /></svg>
            Сотрудники
          </NavLink>
          
          <NavLink to="/dashboard/clients" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.85" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            Клиенты
            <span className="nav-badge">142</span>
          </NavLink>
          
          <NavLink to="/dashboard/reports" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>
            Отчёты
          </NavLink>
          
          <NavLink to="/dashboard/booking" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
            Онлайн-запись
          </NavLink>
          
          <NavLink to="/dashboard/finances" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            Финансы
          </NavLink>
          
          <NavLink to="/dashboard/notifications" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            Уведомления
            <span className="nav-badge">3</span>
          </NavLink>
          
          <NavLink to="/dashboard/loyalty" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
            Лояльность
          </NavLink>

          <NavLink to="/dashboard/ai" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
              <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/>
            </svg>
            Velora AI
            <span style={{
              marginLeft: 'auto',
              fontSize: '9px',
              fontWeight: 800,
              letterSpacing: '0.4px',
              padding: '2px 6px',
              borderRadius: '5px',
              background: 'linear-gradient(135deg, #FCAE91, #F9A08B)',
              color: 'white',
              lineHeight: 1,
            }}>NEW</span>
          </NavLink>

          <div className="sidebar-divider"></div>

          <NavLink to="/dashboard/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            Настройки
          </NavLink>
          
          <NavLink to="/dashboard/billing" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
            Тариф и оплата
          </NavLink>
        </div>

        <div className="sidebar-bottom">
          <NavLink to="/dashboard/journal" className="sidebar-journal" style={{ textDecoration: 'none' }}>
            <div className="journal-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            </div>
            <div>
              <div className="journal-text">Журнал</div>
              <div className="journal-sub">Расписание занятий</div>
            </div>
          </NavLink>

          <NavLink to="/dashboard/profile" className="user-pill" style={{ textDecoration: 'none' }}>
            <div className="user-avatar">АМ</div>
            <div className="user-email">admin@velora.studio</div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
          </NavLink>
        </div>
      </nav>

      {/* ─── MAIN ─── */}
      <div className="main" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        
        {/* 🔥 ОБНОВЛЕННЫЙ TOPBAR: 3 КОЛОНКИ ДЛЯ ИДЕАЛЬНОГО ЦЕНТРИРОВАНИЯ */}
        <div className="topbar" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '0 24px',
          height: '72px',
          background: 'var(--bg-card, #FFFFFF)',
          borderBottom: '1px solid rgba(26,26,26,0.04)',
          zIndex: 10
        }}>
          
          {/* 1. ЛЕВАЯ ЧАСТЬ (Заголовки) */}
          <div style={{ flex: '1 1 0%', minWidth: 0 }}>
            <div className="topbar-title" style={{ fontSize: '20px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.4px' }}>{title}</div>
            <div className="topbar-subtitle" style={{ fontSize: '13px', color: '#666666', marginTop: '2px' }}>{subtitle}</div>
          </div>
          
          {/* 2. ЦЕНТРАЛЬНАЯ ЧАСТЬ (Премиальный AI-Инпут) */}
          <div ref={aiSearchRef} style={{ flex: '0 1 540px', padding: '0 24px', position: 'relative' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              height: '44px',
              background: '#FFFFFF',
              borderRadius: aiPanel.open ? '14px 14px 4px 4px' : '14px', // Срастается с панелью снизу, когда она открыта
              border: isAiFocused ? '1px solid #F9A08B' : '1px solid rgba(26,26,26,0.08)',
              borderBottom: aiPanel.open ? '1px solid rgba(26,26,26,0.06)' : undefined,
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
                placeholder="Спросите AI или поставьте задачу..."
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onFocus={() => setIsAiFocused(true)}
                onBlur={() => setIsAiFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && aiQuery.trim()) {
                    handleAskAi(aiQuery.trim());
                    setAiQuery('');
                  }
                  if (e.key === 'Escape' && aiPanel.open) {
                    closeAiPanel();
                  }
                }}
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

              {/* Элегантная заглушка Enter */}
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
                {aiPanel.open ? 'Esc' : 'Enter'}
              </div>
            </div>

            {/* 🔥 Сама выпадающая AI-панель: плавно "вырастает" из поисковика */}
            <div style={{
              position: 'absolute',
              top: '100%',
              left: '24px',
              right: '24px',
              maxHeight: aiPanel.open ? '420px' : '0px',
              opacity: aiPanel.open ? 1 : 0,
              transform: aiPanel.open ? 'translateY(0)' : 'translateY(-6px)',
              overflow: 'hidden',
              transition: 'max-height 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
              pointerEvents: aiPanel.open ? 'auto' : 'none',
              zIndex: 20,
              /* 🔥 ПЕРЕНЕСЛИ СТИЛИ СЮДА 🔥 */
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
                    {aiPanel.query}
                  </span>
                </div>

                {/* Состояние: думает → отвечает */}
                {aiPanel.status === 'thinking' ? (
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
                      Velora AI думает над ответом
                    </span>
                    <span style={{ display: 'flex', gap: '3px', marginLeft: '-2px' }}>
                      <i className="velora-ai-dot" style={{ animationDelay: '0s' }} />
                      <i className="velora-ai-dot" style={{ animationDelay: '0.15s' }} />
                      <i className="velora-ai-dot" style={{ animationDelay: '0.3s' }} />
                    </span>
                  </div>
                ) : (
                  <div style={{
                    fontSize: '14.5px',
                    lineHeight: 1.6,
                    color: '#1A1A1A',
                    fontWeight: 500,
                    animation: 'velora-ai-fade-up 0.35s ease both'
                  }}>
                    {aiPanel.answer}
                    {aiPanel.status === 'answering' && <span className="velora-ai-caret" />}
                  </div>
                )}
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

        <div className="content" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </div>
      </div>

      <AIDrawer />
    </div>
  );
}