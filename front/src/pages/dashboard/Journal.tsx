import React, { useState, useRef, useEffect } from 'react';

// ─── ТИПЫ ────────────────────────────────────────────────────────────────────
interface Booking {
  id: string;
  trainer: number;
  timeStart: number;
  timeEnd: number;
  title: string;
  hall: string;
  clients: number;
  maxClients: number;
  color: string;
  status: 'confirmed' | 'pending' | 'cancelled';
}

interface Client {
  id: string;
  name: string;
  phone: string;
  visits: number;
  avatar: string;
}

// ─── ДАННЫЕ ───────────────────────────────────────────────────────────────────
const TRAINERS = [
  { id: 0, name: 'Анна Н.', full: 'Анна Новикова', role: 'Пилатес', color: '#F9A08B', bg: 'rgba(249,160,139,0.12)', initials: 'АН' },
  { id: 1, name: 'Дарья П.', full: 'Дарья Петрова', role: 'Йога', color: '#5BAB72', bg: 'rgba(91,171,114,0.12)', initials: 'ДП' },
  { id: 2, name: 'Михаил В.', full: 'Михаил Волков', role: 'Стретчинг', color: '#40a8a0', bg: 'rgba(64,168,160,0.12)', initials: 'МВ' },
  { id: 3, name: 'Ольга С.', full: 'Ольга Смирнова', role: 'Фитнес', color: '#4A80C4', bg: 'rgba(74,128,196,0.12)', initials: 'ОС' },
  { id: 4, name: 'Иван К.', full: 'Иван Козлов', role: 'Кросс', color: '#7B6CD4', bg: 'rgba(123,108,212,0.12)', initials: 'ИК' },
];

const HALLS = ['Зал 1', 'Зал 2', 'Студия', 'Онлайн'];
const TIMES = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'];

const BOOKINGS: Booking[] = [
  { id:'b1', trainer:0, timeStart:2, timeEnd:3, title:'Пилатес', hall:'Зал 1', clients:6, maxClients:8, color:'#F9A08B', status:'confirmed' },
  { id:'b2', trainer:0, timeStart:4, timeEnd:5, title:'Пил. Advanced', hall:'Зал 1', clients:4, maxClients:6, color:'#F9A08B', status:'confirmed' },
  { id:'b3', trainer:0, timeStart:8, timeEnd:9, title:'Персональный', hall:'Студия', clients:1, maxClients:1, color:'#F9A08B', status:'confirmed' },
  { id:'b4', trainer:0, timeStart:12, timeEnd:13, title:'Вечерний', hall:'Зал 1', clients:7, maxClients:8, color:'#F9A08B', status:'pending' },
  { id:'b5', trainer:1, timeStart:1, timeEnd:2, title:'Йога Хатха', hall:'Зал 2', clients:10, maxClients:12, color:'#5BAB72', status:'confirmed' },
  { id:'b6', trainer:1, timeStart:5, timeEnd:6, title:'Флоу', hall:'Зал 2', clients:8, maxClients:12, color:'#5BAB72', status:'confirmed' },
  { id:'b7', trainer:1, timeStart:10, timeEnd:11, title:'Аштанга', hall:'Зал 2', clients:5, maxClients:10, color:'#5BAB72', status:'confirmed' },
  { id:'b8', trainer:2, timeStart:3, timeEnd:4, title:'Стретчинг', hall:'Студия', clients:3, maxClients:4, color:'#40a8a0', status:'confirmed' },
  { id:'b9', trainer:2, timeStart:7, timeEnd:8, title:'Стретч+', hall:'Студия', clients:4, maxClients:4, color:'#40a8a0', status:'confirmed' },
  { id:'b10', trainer:2, timeStart:11, timeEnd:12, title:'Вечерний', hall:'Зал 1', clients:6, maxClients:8, color:'#40a8a0', status:'pending' },
  { id:'b11', trainer:3, timeStart:0, timeEnd:1, title:'Открытие', hall:'Зал 1', clients:0, maxClients:0, color:'#4A80C4', status:'confirmed' },
  { id:'b12', trainer:3, timeStart:9, timeEnd:10, title:'Планёрка', hall:'Онлайн', clients:5, maxClients:10, color:'#4A80C4', status:'confirmed' },
  { id:'b13', trainer:4, timeStart:2, timeEnd:3, title:'Фитбол', hall:'Зал 2', clients:9, maxClients:12, color:'#7B6CD4', status:'confirmed' },
  { id:'b14', trainer:4, timeStart:8, timeEnd:9, title:'Роллинг', hall:'Зал 1', clients:5, maxClients:8, color:'#7B6CD4', status:'confirmed' },
  { id:'b15', trainer:4, timeStart:13, timeEnd:14, title:'Кросс-тренинг', hall:'Зал 2', clients:7, maxClients:10, color:'#7B6CD4', status:'pending' },
];

const CLIENTS_DB: Client[] = [
  { id:'c1', name:'Мария Соколова', phone:'+7 900 123-45-67', visits:24, avatar:'МС' },
  { id:'c2', name:'Алина Крылова', phone:'+7 901 234-56-78', visits:12, avatar:'АК' },
  { id:'c3', name:'Екатерина Лебедева', phone:'+7 902 345-67-89', visits:8, avatar:'ЕЛ' },
  { id:'c4', name:'Наталья Орлова', phone:'+7 903 456-78-90', visits:31, avatar:'НО' },
  { id:'c5', name:'Ирина Зайцева', phone:'+7 904 567-89-01', visits:5, avatar:'ИЗ' },
  { id:'c6', name:'Светлана Морозова', phone:'+7 905 678-90-12', visits:19, avatar:'СМ' },
];

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DAY_NAMES_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

// ─── SVG ИКОНКИ ──────────────────────────────────────────────────────────────
const Icons = {
  Calendar: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  ChevronLeft: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  Plus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  Filter: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  ),
  Users: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  Clock: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  Search: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  X: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  MapPin: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  Today: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  List: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  ),
  Grid: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  Edit: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  Trash: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  ),
  Bell: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  UserPlus: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
    </svg>
  ),
};

// ─── SVG ИЛЛЮСТРАЦИЯ: НЕТ ЗАПИСЕЙ ────────────────────────────────────────────
const EmptyIllustration = () => (
  <svg width="120" height="100" viewBox="0 0 120 100" fill="none">
    <style>{`
      @keyframes float-empty { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
      @keyframes pulse-dot { 0%,100%{opacity:0.3} 50%{opacity:1} }
      .empty-float { animation: float-empty 3s ease-in-out infinite; }
      .pdot1 { animation: pulse-dot 1.5s ease-in-out infinite; }
      .pdot2 { animation: pulse-dot 1.5s ease-in-out 0.5s infinite; }
      .pdot3 { animation: pulse-dot 1.5s ease-in-out 1s infinite; }
    `}</style>
    <g className="empty-float">
      <rect x="20" y="20" width="80" height="60" rx="10" fill="rgba(252,174,145,0.08)" stroke="rgba(252,174,145,0.3)" strokeWidth="1.5"/>
      <line x1="35" y1="38" x2="85" y2="38" stroke="rgba(252,174,145,0.3)" strokeWidth="2" strokeLinecap="round"/>
      <line x1="35" y1="50" x2="70" y2="50" stroke="rgba(252,174,145,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="35" y1="62" x2="60" y2="62" stroke="rgba(252,174,145,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="60" cy="22" r="10" fill="rgba(252,174,145,0.15)" stroke="rgba(252,174,145,0.4)" strokeWidth="1.5"/>
      <line x1="60" y1="18" x2="60" y2="26" stroke="rgba(252,174,145,0.6)" strokeWidth="2" strokeLinecap="round"/>
      <line x1="56" y1="22" x2="64" y2="22" stroke="rgba(252,174,145,0.6)" strokeWidth="2" strokeLinecap="round"/>
    </g>
    <circle className="pdot1" cx="46" cy="90" r="3" fill="rgba(252,174,145,0.4)"/>
    <circle className="pdot2" cx="60" cy="90" r="3" fill="rgba(252,174,145,0.4)"/>
    <circle className="pdot3" cx="74" cy="90" r="3" fill="rgba(252,174,145,0.4)"/>
  </svg>
);

// ─── SVG ИЛЛЮСТРАЦИЯ: ЗАГРУЗКА ТРЕНЕРОВ ─────────────────────────────────────
const LoadingBarsIllustration = () => (
  <svg width="48" height="32" viewBox="0 0 48 32" fill="none">
    <style>{`
      @keyframes bar-grow { 0%{transform:scaleY(0.3)} 50%{transform:scaleY(1)} 100%{transform:scaleY(0.3)} }
      .bar1{animation:bar-grow 1.4s ease-in-out infinite;transform-origin:bottom;animation-delay:0s}
      .bar2{animation:bar-grow 1.4s ease-in-out infinite;transform-origin:bottom;animation-delay:0.2s}
      .bar3{animation:bar-grow 1.4s ease-in-out infinite;transform-origin:bottom;animation-delay:0.4s}
      .bar4{animation:bar-grow 1.4s ease-in-out infinite;transform-origin:bottom;animation-delay:0.6s}
      .bar5{animation:bar-grow 1.4s ease-in-out infinite;transform-origin:bottom;animation-delay:0.8s}
    `}</style>
    <rect className="bar1" x="2" y="8" width="6" height="24" rx="3" fill="rgba(249,160,139,0.7)"/>
    <rect className="bar2" x="11" y="4" width="6" height="28" rx="3" fill="rgba(91,171,114,0.7)"/>
    <rect className="bar3" x="20" y="12" width="6" height="20" rx="3" fill="rgba(64,168,160,0.7)"/>
    <rect className="bar4" x="29" y="6" width="6" height="26" rx="3" fill="rgba(74,128,196,0.7)"/>
    <rect className="bar5" x="38" y="10" width="6" height="22" rx="3" fill="rgba(123,108,212,0.7)"/>
  </svg>
);

// ─── SVG ИЛЛЮСТРАЦИЯ: МИНИ-КЕЙС РАСПИСАНИЯ (в правой панели) ─────────────────
const ScheduleIllustration = () => (
  <svg width="100%" height="56" viewBox="0 0 200 56" fill="none" preserveAspectRatio="xMidYMid meet">
    <style>{`
      @keyframes slide-in { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
      .si1{animation:slide-in 0.5s ease forwards;animation-delay:0.1s;opacity:0}
      .si2{animation:slide-in 0.5s ease forwards;animation-delay:0.3s;opacity:0}
      .si3{animation:slide-in 0.5s ease forwards;animation-delay:0.5s;opacity:0}
      .si4{animation:slide-in 0.5s ease forwards;animation-delay:0.7s;opacity:0}
    `}</style>
    <rect x="0" y="4" width="200" height="48" rx="8" fill="rgba(252,174,145,0.05)"/>
    <g className="si1">
      <rect x="8" y="10" width="44" height="18" rx="4" fill="rgba(249,160,139,0.25)"/>
      <rect x="10" y="13" width="24" height="3" rx="1.5" fill="rgba(249,160,139,0.6)"/>
      <rect x="10" y="19" width="14" height="2" rx="1" fill="rgba(249,160,139,0.35)"/>
    </g>
    <g className="si2">
      <rect x="58" y="28" width="44" height="18" rx="4" fill="rgba(91,171,114,0.25)"/>
      <rect x="60" y="31" width="24" height="3" rx="1.5" fill="rgba(91,171,114,0.6)"/>
      <rect x="60" y="37" width="14" height="2" rx="1" fill="rgba(91,171,114,0.35)"/>
    </g>
    <g className="si3">
      <rect x="108" y="10" width="44" height="18" rx="4" fill="rgba(64,168,160,0.25)"/>
      <rect x="110" y="13" width="24" height="3" rx="1.5" fill="rgba(64,168,160,0.6)"/>
      <rect x="110" y="19" width="14" height="2" rx="1" fill="rgba(64,168,160,0.35)"/>
    </g>
    <g className="si4">
      <rect x="156" y="20" width="36" height="18" rx="4" fill="rgba(123,108,212,0.25)"/>
      <rect x="158" y="23" width="20" height="3" rx="1.5" fill="rgba(123,108,212,0.6)"/>
      <rect x="158" y="29" width="12" height="2" rx="1" fill="rgba(123,108,212,0.35)"/>
    </g>
  </svg>
);

// ─── СТИЛИ ────────────────────────────────────────────────────────────────────
const STYLES = `
  :root {
    --bg: #FDFCFB;
    --bg2: #F7F5F3;
    --bg-card: #FFFFFF;
    --border: rgba(26,26,26,0.08);
    --border2: rgba(26,26,26,0.05);
    --onyx: #1A1A1A;
    --text2: #444444;
    --muted: #888888;
    --peach: #F9A08B;
    --peach-soft: rgba(249,160,139,0.12);
    --peach-glow: rgba(249,160,139,0.18);
    --shadow-card: 0 2px 16px rgba(26,26,26,0.05), 0 1px 4px rgba(26,26,26,0.04);
    --shadow-float: 0 8px 32px rgba(26,26,26,0.10), 0 2px 8px rgba(26,26,26,0.06);
    --shadow-peach: 0 4px 20px rgba(249,160,139,0.25);
    --radius: 14px;
    --radius-sm: 8px;
    --font: 'Manrope', 'Inter', -apple-system, sans-serif;
  }

  .j-root {
    font-family: var(--font);
    background: var(--bg);
    color: var(--onyx);
    display: flex;
    /* Убираем глобальный скролл: компенсируем padding 28px из App.css */
    height: calc(100vh - 56px);
    margin: -28px; 
    width: calc(100% + 56px); 
    overflow: hidden;
    position: relative;
  }

  /* ── TOOLBAR ── */
  .j-toolbar {
    height: 56px;
    padding: 0 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    position: sticky;
    top: 0;
    z-index: 20;
  }

  /* ── КНОПКИ ── */
  /* =========================================================
     1. КНОПКИ НАВИГАЦИИ (Тот самый "ВАУ" эффект)
     ========================================================= */
  .btn-icon {
    width: 36px; height: 36px; /* Чуть крупнее для идеального тапа */
    display: flex; align-items: center; justify-content: center;
    background: rgba(255, 255, 255, 0.6);
    backdrop-filter: blur(12px); /* Эффект матового стекла */
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--border);
    border-radius: 12px; /* Премиальное скругление */
    cursor: pointer; 
    color: var(--muted);
    /* Безупречная пружинистая физика */
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    flex-shrink: 0;
    position: relative;
    overflow: hidden;
  }

  .btn-icon:hover {
    background: #FFFFFF;
    color: var(--peach);
    border-color: rgba(249,160,139,0.4);
    /* Слоистая тень: объем + мягкое цветное свечение вокруг */
    box-shadow: 0 8px 24px -4px rgba(249,160,139,0.25), 0 0 0 3px var(--peach-glow);
    transform: translateY(-2px);
  }

  .btn-icon:active {
    transform: translateY(0) scale(0.88); /* Глубокое, приятное прожатие */
    box-shadow: 0 2px 8px rgba(249,160,139,0.15);
  }

  /* Сама иконка внутри стрелочки оживает при наведении */
  .btn-icon svg {
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .btn-icon:hover svg {
    transform: scale(1.15); /* Иконка как бы тянется к тебе */
  }

  /* Кнопки с текстом (Дата и "Сегодня") */
  .btn-ghost-sm {
    height: 36px; padding: 0 16px;
    display: flex; align-items: center; gap: 8px;
    background: rgba(255, 255, 255, 0.6); 
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--border);
    border-radius: 12px;
    cursor: pointer; 
    color: var(--text2);
    font-size: 13px; font-weight: 700; font-family: var(--font);
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); 
    white-space: nowrap; flex-shrink: 0;
  }

  .btn-ghost-sm:hover {
    background: #FFFFFF;
    color: var(--onyx);
    border-color: rgba(26,26,26,0.15);
    box-shadow: 0 8px 24px -6px rgba(26,26,26,0.12), 0 2px 8px rgba(26,26,26,0.04);
    transform: translateY(-2px);
  }

  .btn-ghost-sm:active {
    transform: translateY(0) scale(0.94);
    box-shadow: none;
  }

  .btn-ghost-sm.active { 
    background: var(--onyx); 
    color: white; 
    border-color: var(--onyx); 
  }
  .btn-primary-sm {
    height: 32px; padding: 0 14px;
    display: flex; align-items: center; gap: 6px;
    background: var(--peach); border: none;
    border-radius: var(--radius-sm);
    cursor: pointer; color: white;
    font-size: 12.5px; font-weight: 700; font-family: var(--font);
    transition: all 0.18s ease; white-space: nowrap; flex-shrink: 0;
    box-shadow: var(--shadow-peach);
  }
  .btn-primary-sm:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(249,160,139,0.35); }
  .btn-primary-sm:active { transform: translateY(0); }

  .pill-tab {
    height: 28px; padding: 0 10px;
    display: flex; align-items: center; gap: 5px;
    border-radius: 100px;
    font-size: 12px; font-weight: 600; font-family: var(--font);
    cursor: pointer; transition: all 0.15s ease;
    border: none; background: transparent; color: var(--muted);
  }
  .pill-tab.active { background: var(--onyx); color: white; }
  .pill-tab:not(.active):hover { background: var(--bg2); color: var(--onyx); }

  /* ── ОСНОВНАЯ СЕТКА ЛЕЙАУТА ── */
  .j-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .j-main {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    min-width: 0;
  }

  /* ── СЕТКА РАСПИСАНИЯ ── */
  .j-grid-wrapper {
    flex: 1;
    overflow: auto;
    position: relative;
    background: #FDFCFB;
    overscroll-behavior: contain; /* Блокирует передачу скролла странице */
  }
  .j-grid-wrapper::-webkit-scrollbar { width: 6px; height: 6px; }
  .j-grid-wrapper::-webkit-scrollbar-track { background: transparent; }
  .j-grid-wrapper::-webkit-scrollbar-thumb { background: rgba(26,26,26,0.12); border-radius: 3px; }

  .j-grid {
    display: grid;
    min-width: max-content;
    position: relative;
  }

  .j-header-row {
    display: contents;
  }

  .j-col-header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--bg-card);
    border-bottom: 2px solid var(--border);
    padding: 12px 16px;
    min-width: 160px;
  }

  .j-time-col {
    width: 52px;
    position: sticky;
    left: 0;
    z-index: 5;
    background: var(--bg-card);
  }

  .j-time-cell {
    height: 64px;
    display: flex;
    align-items: flex-start;
    padding: 8px 8px 0 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    letter-spacing: 0.3px;
    position: sticky;
    left: 0;
    background: var(--bg-card);
    z-index: 5;
    border-right: 1px solid var(--border);
  }

  .j-row-sep {
    height: 64px;
    border-bottom: 1px solid var(--border2);
    min-width: 160px;
    position: relative;
    transition: background 0.15s;
  }
  .j-row-sep:hover { background: rgba(249,160,139,0.02); }

  .j-empty-slot {
    height: 64px;
    min-width: 160px;
    border-bottom: 1px solid var(--border2);
    border-right: 1px solid var(--border2);
    cursor: pointer;
    position: relative;
    transition: background 0.15s;
    overflow: visible;
  }
  .j-empty-slot::after {
    content: '';
    position: absolute;
    inset: 4px;
    border: 1.5px dashed transparent;
    border-radius: 8px;
    transition: border-color 0.15s;
  }
  .j-empty-slot:hover { background: rgba(249,160,139,0.04); }
  .j-empty-slot:hover::after { border-color: rgba(249,160,139,0.35); }
  .j-empty-slot:hover .slot-plus { opacity: 1; }

  .slot-plus {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    opacity: 0;
    color: rgba(249,160,139,0.7);
    font-size: 18px;
    transition: opacity 0.15s;
    pointer-events: none;
  }

  /* ── КАРТОЧКА ЗАПИСИ ── */
  .booking-card {
    position: absolute;
    left: 6px; right: 6px;
    border-radius: 10px;
    padding: 8px 10px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.34,1.2,0.64,1);
    overflow: hidden;
    z-index: 2;
  }
  .booking-card:hover {
    transform: scale(1.02) translateY(-1px);
    z-index: 10;
    box-shadow: 0 8px 24px rgba(26,26,26,0.12);
  }
  .booking-card.pending { opacity: 0.75; }
  .booking-card.pending::after {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: repeating-linear-gradient(90deg, currentColor 0, currentColor 4px, transparent 4px, transparent 8px);
    opacity: 0.5;
  }

  /* ── ПРАВАЯ ПАНЕЛЬ ── */
  .j-right {
    width: 264px;
    flex-shrink: 0;
    background: var(--bg-card);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain; /* Блокирует передачу скролла странице */
  }
  .j-right::-webkit-scrollbar { width: 4px; }
  .j-right::-webkit-scrollbar-thumb { background: rgba(26,26,26,0.08); border-radius: 2px; }

  .jr-section {
    padding: 16px 16px 12px;
  }
  .jr-section + .jr-section {
    border-top: 1px solid var(--border);
  }

  .jr-label {
    font-size: 10.5px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* ── МИНИ-КАЛЕНДАРЬ ── */
  .mini-cal {}
  .mc-header {
    display: flex; align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  .mc-month {
    font-size: 13px; font-weight: 700; color: var(--onyx);
  }
  .mc-nav {
    width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid var(--border);
    border-radius: 6px; cursor: pointer;
    color: var(--muted); background: transparent;
    transition: all 0.15s;
  }
  .mc-nav:hover { background: var(--bg2); color: var(--onyx); }

  .mc-days-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
  }
  .mc-day-name {
    font-size: 9.5px; font-weight: 700;
    color: var(--muted); text-align: center;
    padding: 2px 0 4px;
    letter-spacing: 0.3px;
  }
  .mc-day {
    aspect-ratio: 1;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 500;
    border-radius: 6px; cursor: pointer;
    color: var(--text2);
    transition: all 0.15s;
    position: relative;
  }
  .mc-day:hover { background: var(--bg2); }
  .mc-day.today {
    background: var(--peach); color: white; font-weight: 700;
    box-shadow: 0 2px 8px rgba(249,160,139,0.4);
  }
  .mc-day.selected { background: var(--onyx); color: white; }
  .mc-day.has-event::after {
    content: '';
    position: absolute;
    bottom: 2px;
    left: 50%; transform: translateX(-50%);
    width: 3px; height: 3px;
    border-radius: 50%;
    background: var(--peach);
  }
  .mc-day.today::after { background: white; }

  /* ── ЗАЛА ── */
  .hall-chip {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 10px;
    border-radius: 8px; cursor: pointer;
    font-size: 12px; font-weight: 600;
    color: var(--muted);
    background: transparent;
    border: 1px solid var(--border);
    transition: all 0.15s;
    margin-bottom: 5px;
  }
  .hall-chip:hover { background: var(--bg2); color: var(--onyx); border-color: rgba(26,26,26,0.15); }
  .hall-chip.active { background: var(--peach-soft); color: var(--peach); border-color: rgba(249,160,139,0.3); font-weight: 700; }
  .hall-chip .hc-dot {
    width: 6px; height: 6px; border-radius: 50%;
    flex-shrink: 0;
  }

  /* ── ЗАГРУЗКА ТРЕНЕРОВ ── */
  .trainer-load {
    display: flex; flex-direction: column; gap: 10px;
  }
  .tl-item {}
  .tl-row {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 5px;
  }
  .tl-ava {
    width: 24px; height: 24px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 800; color: white; flex-shrink: 0;
  }
  .tl-name { font-size: 12px; font-weight: 600; color: var(--onyx); flex: 1; }
  .tl-pct { font-size: 11px; font-weight: 700; color: var(--muted); }
  .tl-bar-bg {
    height: 4px; background: var(--bg2);
    border-radius: 100px; overflow: hidden;
  }
  .tl-bar-fill {
    height: 100%; border-radius: 100px;
    transition: width 1s cubic-bezier(0.34,1.1,0.64,1);
  }

  /* ── POPUP КАРТОЧКИ ЗАПИСИ ── */
  .booking-popup {
    position: fixed;
    background: var(--bg-card);
    border-radius: var(--radius);
    box-shadow: var(--shadow-float);
    border: 1px solid var(--border);
    width: 280px;
    z-index: 100;
    overflow: hidden;
    animation: popup-in 0.2s cubic-bezier(0.34,1.2,0.64,1);
  }
  @keyframes popup-in {
    from { opacity: 0; transform: scale(0.92) translateY(4px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  .bp-header {
    padding: 14px 16px 12px;
    border-bottom: 1px solid var(--border);
  }
  .bp-body { padding: 12px 16px; }
  .bp-row {
    display: flex; align-items: center; gap: 8px;
    font-size: 12.5px; color: var(--muted); margin-bottom: 7px;
  }
  .bp-actions {
    display: flex; gap: 6px; padding: 12px 16px;
    border-top: 1px solid var(--border);
  }
  .bp-btn {
    flex: 1; height: 32px;
    display: flex; align-items: center; justify-content: center; gap: 5px;
    border-radius: 8px; font-size: 12px; font-weight: 600; font-family: var(--font);
    cursor: pointer; border: none; transition: all 0.15s;
  }
  .bp-btn.primary { background: var(--peach); color: white; }
  .bp-btn.primary:hover { background: #f08070; }
  .bp-btn.ghost { background: var(--bg2); color: var(--onyx); }
  .bp-btn.ghost:hover { background: var(--border); }
  .bp-btn.danger { background: rgba(216,140,154,0.12); color: #c05050; }
  .bp-btn.danger:hover { background: rgba(216,140,154,0.2); }

  /* ── МОДАЛКА ДОБАВЛЕНИЯ КЛИЕНТА ── */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(26,26,26,0.3);
    backdrop-filter: blur(4px);
    z-index: 200;
    display: flex; align-items: center; justify-content: center;
    animation: overlay-in 0.2s ease;
  }
  @keyframes overlay-in { from{opacity:0} to{opacity:1} }
  .modal-box {
    background: var(--bg-card);
    border-radius: 20px;
    box-shadow: 0 24px 64px rgba(26,26,26,0.16);
    width: 420px; max-height: 80vh;
    overflow-y: auto;
    animation: modal-in 0.25s cubic-bezier(0.34,1.2,0.64,1);
  }
  @keyframes modal-in { from{opacity:0;transform:scale(0.9) translateY(20px)} to{opacity:1;transform:scale(1) translateY(0)} }
  .modal-header {
    padding: 24px 24px 16px;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid var(--border);
    position: sticky; top: 0; background: var(--bg-card); z-index: 1;
  }
  .modal-body { padding: 20px 24px; }
  .modal-footer {
    padding: 16px 24px;
    border-top: 1px solid var(--border);
    display: flex; gap: 8px; justify-content: flex-end;
  }
  .modal-input {
    width: 100%; height: 40px;
    padding: 0 12px;
    border: 1.5px solid var(--border);
    border-radius: 10px;
    font-size: 14px; font-family: var(--font);
    color: var(--onyx); background: var(--bg);
    outline: none; transition: border-color 0.2s, box-shadow 0.2s;
    box-sizing: border-box;
    margin-bottom: 10px;
  }
  .modal-input:focus { border-color: var(--peach); box-shadow: 0 0 0 3px rgba(249,160,139,0.15); }
  .modal-label { font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 5px; display: block; }
  
  .client-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: 10px;
    cursor: pointer; transition: background 0.15s;
    margin-bottom: 4px;
  }
  .client-row:hover { background: var(--bg2); }
  .client-row.selected { background: var(--peach-soft); }
  .client-ava {
    width: 34px; height: 34px; border-radius: 50%;
    background: var(--peach-soft);
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 800; color: var(--peach); flex-shrink: 0;
  }

  /* ── ТОСТ УВЕДОМЛЕНИЕ ── */
  .toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: var(--onyx); color: white;
    padding: 10px 20px; border-radius: 100px;
    font-size: 13px; font-weight: 600; font-family: var(--font);
    box-shadow: 0 8px 24px rgba(26,26,26,0.2);
    z-index: 999;
    display: flex; align-items: center; gap: 8px;
    animation: toast-in 0.3s cubic-bezier(0.34,1.2,0.64,1);
  }
  @keyframes toast-in { from{opacity:0;transform:translate(-50%,12px)} to{opacity:1;transform:translate(-50%,0)} }

  /* ── СВОДКА ДНЯ (шапка) ── */
  .day-stats {
    display: flex; gap: 0;
    padding: 10px 16px;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    flex-shrink: 0;
  }
  .day-stats::-webkit-scrollbar { display: none; }
  .ds-item {
    display: flex; flex-direction: column;
    padding: 0 16px;
    border-right: 1px solid var(--border);
    flex-shrink: 0;
  }
  .ds-item:first-child { padding-left: 0; }
  .ds-item:last-child { border-right: none; }
  .ds-val { font-size: 18px; font-weight: 800; color: var(--onyx); line-height: 1; }
  .ds-key { font-size: 10.5px; font-weight: 600; color: var(--muted); margin-top: 2px; }
  .ds-accent { color: var(--peach); }

  /* ── АНИМАЦИИ ── */
  @keyframes fade-up {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .fade-up { animation: fade-up 0.3s ease forwards; }
  /* ── СЕТКА РАСПИСАНИЯ ── */
  .j-grid-wrapper {
    flex: 1;
    overflow: auto;
    position: relative;
    background: #FDFCFB;
  }
  .j-grid-wrapper::-webkit-scrollbar { width: 6px; height: 6px; }
  .j-grid-wrapper::-webkit-scrollbar-track { background: transparent; }
  .j-grid-wrapper::-webkit-scrollbar-thumb { background: rgba(26,26,26,0.12); border-radius: 3px; }

  .j-grid {
    display: grid;
    min-width: max-content;
    position: relative;
  }

  /* 🔥 ИСПРАВЛЕННЫЙ ВЕРХНИЙ ЛЕВЫЙ УГОЛ (Матовое стекло) */
  .j-top-left-corner {
    position: sticky;
    top: 0; left: 0;
    z-index: 20;
    background: rgba(253,252,251,0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border);
  }

  /* 🔥 РОСКОШНЫЕ ШАПКИ КОЛОНОК (Матовое стекло) */
  .j-col-header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: rgba(253,252,251,0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border2);
    padding: 14px 18px;
    min-width: 170px;
  }

  .j-time-cell {
    height: 72px; /* Увеличили высоту для премиального воздуха */
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    padding: 8px 12px 0 0;
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    letter-spacing: 0.5px;
    position: sticky;
    left: 0;
    background: rgba(253,252,251,0.95);
    z-index: 5;
    border-right: 1px solid var(--border);
  }

  .j-empty-slot {
    height: 72px; /* Синхронизируем высоту */
    min-width: 170px;
    border-bottom: 1px solid var(--border2);
    border-right: 1px solid var(--border2);
    cursor: pointer;
    position: relative;
    transition: background 0.15s;
    overflow: visible;
  }
  .j-empty-slot::after {
    content: '';
    position: absolute;
    inset: 4px;
    border: 1.5px dashed transparent;
    border-radius: 12px;
    transition: all 0.2s ease;
  }
  .j-empty-slot:hover { background: rgba(249,160,139,0.02); }
  .j-empty-slot:hover::after { border-color: rgba(249,160,139,0.3); background: rgba(249,160,139,0.03); }
  .j-empty-slot:hover .slot-plus { opacity: 1; transform: translate(-50%, -50%) scale(1); }

  .slot-plus {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%) scale(0.8);
    opacity: 0;
    color: var(--peach);
    font-size: 18px;
    transition: all 0.2s cubic-bezier(0.34, 1.5, 0.64, 1);
    pointer-events: none;
    width: 28px; height: 28px;
    background: #FFF; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 12px rgba(249,160,139,0.2);
  }

  /* ── КАРТОЧКА ЗАПИСИ ── */
  .booking-card {
    position: absolute;
    left: 6px; right: 6px;
    border-radius: 12px;
    padding: 10px 12px;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.34,1.5,0.64,1);
    overflow: hidden;
    z-index: 2;
  }
  .booking-card:hover {
    transform: scale(1.02) translateY(-2px);
    z-index: 10;
    box-shadow: 0 12px 24px rgba(26,26,26,0.12), 0 4px 8px rgba(26,26,26,0.04);
  }
  /* Базовый квадратик (оригинальная форма) */
  .mc-day {
    aspect-ratio: 1;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 500;
    border-radius: 6px; 
    cursor: pointer;
    color: var(--text2);
    transition: all 0.15s;
    position: relative;
  }
  .mc-day:hover { background: var(--bg2); }

  /* 1. СЕГОДНЯ (когда НЕ выбрано) — Персиковый */
  .mc-day.today {
    background: var(--peach-soft); 
    color: var(--peach); 
    font-weight: 800;
  }

  /* 2. ВЫБРАННЫЙ ДЕНЬ (любой другой) — Темно-серый Оникс */
  .mc-day.selected { 
    background: var(--onyx); 
    color: white; 
    font-weight: 700;
  }

  /* 3. ВЫБРАНО СЕГОДНЯ — Абсолютно черный */
  .mc-day.today.selected {
    background: var(--peach); 
    color: white;
    box-shadow: 0 4px 16px var(--peach-glow);
  }

  /* Точка под события (чтобы оставалась белой на цветных фонах) */
  .mc-day.has-event::after {
    content: '';
    position: absolute;
    bottom: 2px;
    left: 50%; transform: translateX(-50%);
    width: 3px; height: 3px;
    border-radius: 50%;
    background: var(--peach);
  }
  .mc-day.today.has-event::after,
  .mc-day.selected.has-event::after { 
    background: white; 
  }
  }
  /* =========================================================
     💎 ПРЕМИАЛЬНАЯ МОДАЛКА (НОВОЕ ЗАНЯТИЕ) 💎
     ========================================================= */
  .premium-modal-overlay {
    /* Жесткая привязка к краям экрана поверх всего */
    position: fixed; 
    top: 0; left: 0; right: 0; bottom: 0;
    width: 100vw; height: 100vh;
    background: rgba(18, 18, 18, 0.45); /* Чистая маска без бага backdrop-filter */
    z-index: 9999; /* Максимальный приоритет */
    display: flex; align-items: center; justify-content: center;
    animation: pm-fade-in 0.3s ease;
  }
  
  .premium-modal {
    background: #FFFFFF;
    width: 600px; 
    max-width: 95vw;
    border-radius: 28px;
    box-shadow: 0 32px 80px -12px rgba(26, 26, 26, 0.35);
    display: flex; flex-direction: column;
    animation: pm-slide-up 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    overflow: hidden;
    margin: auto; /* Гарантирует центрирование, если flex даст сбой */
  }
  
  @keyframes pm-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes pm-slide-up { 
    from { opacity: 0; transform: translateY(40px) scale(0.96); } 
    to { opacity: 1; transform: translateY(0) scale(1); } 
  }

  /* ── Шапка ── */
  .pm-header {
    padding: 32px 36px 24px;
    position: relative;
    border-bottom: 1px solid rgba(26,26,26,0.04);
  }
  .pm-title { font-size: 24px; font-weight: 800; color: var(--onyx); letter-spacing: -0.5px; }
  .pm-sub { font-size: 14px; color: var(--muted); margin-top: 6px; font-weight: 500; }
  .pm-close {
    position: absolute; top: 32px; right: 32px;
    width: 36px; height: 36px; border-radius: 50%;
    background: var(--bg2); color: var(--muted); border: none;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .pm-close:hover { background: #EAEAEA; color: var(--onyx); transform: rotate(90deg) scale(1.1); }

  /* ── Тело ── */
  .pm-body { 
    padding: 28px 36px; 
    display: flex; flex-direction: column; gap: 28px; 
    max-height: 60vh; overflow-y: auto;
  }
  .pm-body::-webkit-scrollbar { width: 4px; }
  .pm-body::-webkit-scrollbar-thumb { background: rgba(26,26,26,0.1); border-radius: 4px; }

  .pm-field { display: flex; flex-direction: column; gap: 10px; }
  .pm-label { 
    font-size: 11px; font-weight: 800; color: var(--muted); 
    text-transform: uppercase; letter-spacing: 0.8px; 
  }

  /* ── Поля ввода ── */
  .pm-input {
    height: 52px; padding: 0 16px;
    background: var(--bg); border: 1.5px solid var(--border);
    border-radius: 14px; font-family: var(--font); font-size: 15px; font-weight: 600; color: var(--onyx);
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); outline: none;
  }
  .pm-input::placeholder { color: #A0A0A0; font-weight: 500; }
  .pm-input:focus {
    background: #FFFFFF; border-color: var(--peach);
    box-shadow: 0 0 0 4px var(--peach-glow), 0 4px 16px rgba(249,160,139,0.15);
    transform: translateY(-2px);
  }

  .pm-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

  /* ── Карточки тренеров ── */
  .pm-trainer-btn {
    display: flex; align-items: center; gap: 14px;
    padding: 12px 16px; border: 1.5px solid var(--border);
    border-radius: 16px; background: transparent; cursor: pointer;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    text-align: left;
  }
  .pm-trainer-btn:hover { 
    border-color: rgba(26,26,26,0.15); background: var(--bg); 
    transform: translateY(-2px); box-shadow: 0 6px 16px rgba(26,26,26,0.04);
  }
  .pm-trainer-btn.active {
    border-color: var(--peach); background: var(--peach-soft);
    box-shadow: 0 8px 24px var(--peach-glow);
    transform: translateY(-2px);
  }
  .pm-t-ava {
    width: 38px; height: 38px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 800; color: white; flex-shrink: 0;
  }
  .pm-t-name { font-size: 14px; font-weight: 700; color: var(--onyx); margin-bottom: 2px; }
  .pm-t-role { font-size: 11.5px; color: var(--muted); font-weight: 500; }

  /* ── Выбор времени и зала (Чипсы) ── */
  .pm-chips-wrap { display: flex; flex-wrap: wrap; gap: 8px; }
  .pm-chip {
    padding: 12px 18px; border: 1.5px solid var(--border); border-radius: 14px;
    font-size: 13.5px; font-weight: 700; color: var(--text2); cursor: pointer;
    background: transparent; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .pm-chip:hover { 
    background: var(--bg); border-color: rgba(26,26,26,0.2); 
    transform: translateY(-2px); 
  }
  .pm-chip.active {
    background: var(--onyx); color: white; border-color: var(--onyx);
    box-shadow: 0 8px 24px rgba(26,26,26,0.2);
    transform: translateY(-2px);
  }

  /* ── Футер и Кнопки ── */
  .pm-footer {
    padding: 24px 36px 32px; background: #FFFFFF;
    border-top: 1px solid rgba(26,26,26,0.04);
    display: flex; justify-content: space-between; align-items: center;
  }
  .pm-btn-cancel {
    height: 52px; padding: 0 24px; border-radius: 14px;
    font-family: var(--font); font-size: 15px; font-weight: 700;
    color: var(--muted); background: transparent; border: none;
    cursor: pointer; transition: all 0.2s;
  }
  .pm-btn-cancel:hover { background: rgba(26,26,26,0.04); color: var(--onyx); }
  
  .pm-btn-submit {
    height: 52px; padding: 0 32px; border-radius: 14px;
    font-family: var(--font); font-size: 15px; font-weight: 700;
    color: white; background: var(--peach); border: none;
    box-shadow: 0 8px 24px -4px rgba(249,160,139,0.4);
    cursor: pointer; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    display: flex; align-items: center; gap: 10px;
  }
  .pm-btn-submit:hover:not(:disabled) {
    transform: translateY(-2px) scale(1.02); 
    box-shadow: 0 16px 40px -6px rgba(249,160,139,0.5);
  }
  .pm-btn-submit:active:not(:disabled) { transform: scale(0.96); box-shadow: none; }
  .pm-btn-submit:disabled { opacity: 0.5; cursor: not-allowed; filter: grayscale(50%); }
  /* ── ПРЕМИУМ KEYPAD МОДАЛКА (НОВОЕ ЗАНЯТИЕ) ── */
  .keypad-modal {
    background: var(--bg-card);
    border-radius: 24px;
    box-shadow: 0 32px 80px rgba(0,0,0,0.15), 0 0 0 1px rgba(26,26,26,0.05);
    width: 640px;
    overflow: hidden;
    animation: modal-in 0.3s cubic-bezier(0.34,1.2,0.64,1);
  }
  .kp-grid {
    display: grid;
    grid-template-columns: 1fr 1.3fr;
    gap: 32px;
    padding: 24px;
  }
  .kp-section-title {
    font-size: 11px;
    font-weight: 800;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 12px;
  }
  .kp-chip {
    padding: 8px 0;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    border: 1.5px solid var(--border);
    background: var(--bg);
    color: var(--onyx);
    transition: all 0.2s cubic-bezier(0.34, 1.5, 0.64, 1);
    text-align: center;
    user-select: none;
  }
  .kp-chip:hover { border-color: var(--peach); color: var(--peach); transform: translateY(-1px); }
  .kp-chip.active { 
    background: var(--peach); color: white; border-color: var(--peach); 
    box-shadow: 0 6px 16px rgba(249,160,139,0.3); 
    transform: translateY(-2px);
  }
`;

// ─── ГЛАВНЫЙ КОМПОНЕНТ ────────────────────────────────────────────────────────
export default function Journal() {
  const today = new Date();
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [activeTrainers, setActiveTrainers] = useState<number[]>([0, 1, 2, 3, 4]);
  const [activeHalls, setActiveHalls] = useState<string[]>(['Зал 1', 'Зал 2', 'Студия', 'Онлайн']);
  const [viewMode, setViewMode] = useState<'trainers' | 'halls'>('trainers');
  const [popupBooking, setPopupBooking] = useState<Booking | null>(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalBooking, setAddModalBooking] = useState<Booking | null>(null);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [bookings, setBookings] = useState<Booking[]>(BOOKINGS);
  const [toast, setToast] = useState<string | null>(null);
  const [newBookingSlot, setNewBookingSlot] = useState<{ trainer: number; time: number } | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({ title: '', hall: 'Зал 1', maxClients: '8' });
  const popupRef = useRef<HTMLDivElement>(null);

  // Закрытие popup при клике вне
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setPopupBooking(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Тост
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // ── Мини-календарь ──
  const changeMonth = (dir: number) => {
    let m = calMonth + dir;
    let y = calYear;
    if (m > 11) { m = 0; y++; }
    if (m < 0) { m = 11; y--; }
    setCalMonth(m);
    setCalYear(y);
  };

  const firstDayOffset = () => {
    const d = new Date(calYear, calMonth, 1).getDay();
    return d === 0 ? 6 : d - 1;
  };
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const hasEventDays = [3, 7, 9, 12, 15, 17, 22, 24, 28];

  // ── Тоггл тренера ──
  const toggleTrainer = (id: number) => {
    setActiveTrainers(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(t => t !== id) : prev) : [...prev, id]
    );
  };

  // ── Тоггл зала ──
  const toggleHall = (h: string) => {
    setActiveHalls(prev =>
      prev.includes(h) ? (prev.length > 1 ? prev.filter(x => x !== h) : prev) : [...prev, h]
    );
  };

  // ── Колонки по режиму ──
  const columns = viewMode === 'trainers'
    ? TRAINERS.filter(t => activeTrainers.includes(t.id))
    : HALLS.filter(h => activeHalls.includes(h));

  // ── Фильтрованные записи ──
  const filteredBookings = bookings.filter(b => {
    if (viewMode === 'trainers') return activeTrainers.includes(b.trainer);
    return activeHalls.includes(b.hall);
  });

  // ── Открыть popup записи ──
  const openBookingPopup = (e: React.MouseEvent, booking: Booking) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(rect.right + 8, window.innerWidth - 296);
    const y = Math.min(rect.top, window.innerHeight - 280);
    setPopupPos({ x, y });
    setPopupBooking(booking);
  };

  // ── Открыть форму нового слота ──
  const openNewSlot = (trainerIdx: number, timeIdx: number) => {
    setNewBookingSlot({ trainer: trainerIdx, time: timeIdx });
    setNewForm({ title: '', hall: 'Зал 1', maxClients: '8' });
    setShowNewForm(true);
  };

  // ── Создать новую запись ──
  const createBooking = () => {
    if (!newBookingSlot || !newForm.title.trim()) return;
    const trainerObj = TRAINERS[newBookingSlot.trainer];
    const nb: Booking = {
      id: `b${Date.now()}`,
      trainer: newBookingSlot.trainer,
      timeStart: newBookingSlot.time,
      timeEnd: newBookingSlot.time + 1,
      title: newForm.title,
      hall: newForm.hall,
      clients: 0,
      maxClients: parseInt(newForm.maxClients) || 8,
      color: trainerObj.color,
      status: 'confirmed',
    };
    setBookings(prev => [...prev, nb]);
    setShowNewForm(false);
    setNewBookingSlot(null);
    showToast('Занятие добавлено');
  };

  // ── Удалить запись ──
  const deleteBooking = (id: string) => {
    setBookings(prev => prev.filter(b => b.id !== id));
    setPopupBooking(null);
    showToast('Занятие удалено');
  };

  // ── Добавить клиента ──
  const openAddClient = (booking: Booking) => {
    setAddModalBooking(booking);
    setSelectedClients([]);
    setSearchQuery('');
    setPopupBooking(null);
    setShowAddModal(true);
  };

  const confirmAddClients = () => {
    if (!addModalBooking) return;
    setBookings(prev => prev.map(b =>
      b.id === addModalBooking.id
        ? { ...b, clients: Math.min(b.clients + selectedClients.length, b.maxClients) }
        : b
    ));
    setShowAddModal(false);
    showToast(`${selectedClients.length} клиент(а) добавлено`);
  };

  // ── Статистика дня ──
  const totalClasses = filteredBookings.length;
  const totalClients = filteredBookings.reduce((s, b) => s + b.clients, 0);
  const avgLoad = filteredBookings.length > 0
    ? Math.round(filteredBookings.reduce((s, b) => s + (b.maxClients > 0 ? b.clients / b.maxClients : 0), 0) / filteredBookings.length * 100)
    : 0;
  const pending = filteredBookings.filter(b => b.status === 'pending').length;

  // ── Поиск клиентов ──
  const filteredClients = CLIENTS_DB.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery)
  );

  // ── Рендер карточки записи ──
  const renderBookingCard = (b: Booking, colIdx: number) => {
    const top = 4;
    const height = (b.timeEnd - b.timeStart) * 72 - 8;
    const fillRatio = b.maxClients > 0 ? b.clients / b.maxClients : 0;
    const isFull = fillRatio >= 1;

    return (
      <div
        key={b.id}
        className={`booking-card ${b.status}`}
        style={{
          top, height,
          background: `${b.color}18`,
          border: `1.5px solid ${b.color}40`,
          color: b.color,
        }}
        onClick={e => openBookingPopup(e, b)}
      >
        <div style={{ fontSize: '11px', fontWeight: 800, lineHeight: 1.2, marginBottom: 3 }}>{b.title}</div>
        {height > 36 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '10px', opacity: 0.75 }}>
            <Icons.Users />
            <span>{b.clients}{b.maxClients > 0 ? `/${b.maxClients}` : ''}</span>
            {isFull && <span style={{ marginLeft: 2, fontSize: 9, fontWeight: 700, background: b.color, color: 'white', borderRadius: 4, padding: '1px 4px' }}>FULL</span>}
          </div>
        )}
        {b.status === 'pending' && height > 48 && (
          <div style={{ fontSize: '9px', fontWeight: 700, opacity: 0.6, marginTop: 2 }}>ожидает</div>
        )}
        {/* Мини прогресс */}
        {b.maxClients > 0 && height > 40 && (
          <div style={{ position: 'absolute', bottom: 6, left: 8, right: 8, height: 2, background: `${b.color}25`, borderRadius: 1 }}>
            <div style={{ height: '100%', width: `${fillRatio * 100}%`, background: b.color, borderRadius: 1, transition: 'width 0.5s ease' }} />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <style>{STYLES}</style>

      <div className="j-root">
        <div className="j-main">

          {/* ── ТУЛБАР ── */}
          <div className="j-toolbar">
            {/* Дата навигация */}
            <button className="btn-icon" onClick={() => setSelectedDay(d => Math.max(1, d - 1))}>
              <Icons.ChevronLeft />
            </button>

            <button
              className="btn-ghost-sm"
              style={{ minWidth: 120, justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'var(--onyx)' }}
            >
              <Icons.Calendar />
              {selectedDay} {MONTH_NAMES[calMonth]} {calYear}
            </button>

            <button className="btn-icon" onClick={() => setSelectedDay(d => Math.min(daysInMonth, d + 1))}>
              <Icons.ChevronRight />
            </button>

            <button
              className="btn-ghost-sm"
              onClick={() => { setSelectedDay(today.getDate()); setCalMonth(today.getMonth()); setCalYear(today.getFullYear()); }}
            >
              <Icons.Today />
              Сегодня
            </button>

            <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

            {/* Вид: тренеры / залы */}
            <div style={{ display: 'flex', gap: 3, background: 'var(--bg2)', borderRadius: 8, padding: 3 }}>
              <button className={`pill-tab ${viewMode === 'trainers' ? 'active' : ''}`} onClick={() => setViewMode('trainers')}>
                <Icons.Users /> Тренеры
              </button>
              <button className={`pill-tab ${viewMode === 'halls' ? 'active' : ''}`} onClick={() => setViewMode('halls')}>
                <Icons.Grid /> Залы
              </button>
            </div>

            <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

            {/* Фильтры тренеров */}
            {viewMode === 'trainers' && (
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                {TRAINERS.map(t => (
                  <button
                    key={t.id}
                    className={`pill-tab ${activeTrainers.includes(t.id) ? 'active' : ''}`}
                    style={activeTrainers.includes(t.id) ? { background: t.color, color: 'white' } : {}}
                    onClick={() => toggleTrainer(t.id)}
                  >
                    {t.initials}
                  </button>
                ))}
              </div>
            )}

            {/* Фильтры залов */}
            {viewMode === 'halls' && (
              <div style={{ display: 'flex', gap: 5 }}>
                {HALLS.map(h => (
                  <button
                    key={h}
                    className={`pill-tab ${activeHalls.includes(h) ? 'active' : ''}`}
                    onClick={() => toggleHall(h)}
                  >
                    {h}
                  </button>
                ))}
              </div>
            )}

            <div style={{ flex: 1 }} />

            <button className="btn-ghost-sm">
              <Icons.Filter /> Фильтры
            </button>

            <button className="btn-primary-sm" onClick={() => { setNewBookingSlot({ trainer: 0, time: 2 }); setNewForm({ title: '', hall: 'Зал 1', maxClients: '8' }); setShowNewForm(true); }}>
              <Icons.Plus />
              Добавить занятие
            </button>
          </div>

          {/* ── СВОДКА ДНЯ ── */}
          <div className="day-stats">
            <div className="ds-item">
              <div className="ds-val">{totalClasses}</div>
              <div className="ds-key">занятий сегодня</div>
            </div>
            <div className="ds-item">
              <div className="ds-val ds-accent">{totalClients}</div>
              <div className="ds-key">записей клиентов</div>
            </div>
            <div className="ds-item">
              <div className="ds-val">{avgLoad}%</div>
              <div className="ds-key">средняя загрузка</div>
            </div>
            <div className="ds-item">
              <div className="ds-val" style={{ color: pending > 0 ? '#e08060' : 'var(--onyx)' }}>{pending}</div>
              <div className="ds-key">ожидает подтв.</div>
            </div>
            <div className="ds-item">
              <div className="ds-val">{TRAINERS.filter(t => activeTrainers.includes(t.id)).length}</div>
              <div className="ds-key">тренеров активно</div>
            </div>
          </div>

          {/* ── СЕТКА ── */}
          <div className="j-layout">
            <div className="j-grid-wrapper">
              <div
                className="j-grid"
                style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(170px, 1fr))` }}
              >
                {/* 🔥 ИСПРАВЛЕННЫЙ ВЕРХНИЙ ЛЕВЫЙ УГОЛ (Теперь он не перекрывает Анну) */}
                <div className="j-top-left-corner" />

                {/* Заголовки колонок */}
                {columns.map((col, ci) => {
                  const isTrainerMode = viewMode === 'trainers';
                  const trainer = isTrainerMode ? (col as typeof TRAINERS[0]) : null;
                  const hallName = !isTrainerMode ? (col as string) : null;
                  const colBookings = filteredBookings.filter(b =>
                    isTrainerMode ? b.trainer === (trainer!.id) : b.hall === hallName
                  );

                  return (
                    <div
                      key={ci}
                      className="j-col-header"
                      style={{
                        borderRight: ci < columns.length - 1 ? '1px solid var(--border)' : 'none',
                        display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center'
                      }}
                    >
                      {trainer ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {/* Роскошный аватар тренера */}
                            <div style={{
                              width: 38, height: 38, borderRadius: '12px',
                              background: `linear-gradient(135deg, ${trainer.color}15, ${trainer.color}05)`,
                              border: `1.5px solid ${trainer.color}30`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 13, fontWeight: 800, color: trainer.color, flexShrink: 0,
                              boxShadow: `0 4px 12px ${trainer.color}15`
                            }}>
                              {trainer.initials}
                            </div>
                            <div>
                              <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--onyx)', letterSpacing: '-0.2px' }}>{trainer.full}</div>
                              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 1 }}>{trainer.role}</div>
                            </div>
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: colBookings.length > 0 ? 'var(--peach)' : 'var(--border)' }} />
                            {colBookings.length} занятий · {colBookings.reduce((s, b) => s + b.clients, 0)} чел.
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--onyx)' }}>{hallName}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{colBookings.length} занятий на сегодня</div>
                        </>
                      )}
                    </div>
                  );
                })}

                {/* Ряды времени */}
                {TIMES.map((t, ti) => (
                  <React.Fragment key={ti}>
                    <div className="j-time-cell">{t}</div>
                    {columns.map((col, ci) => {
                      const isTrainerMode = viewMode === 'trainers';
                      const trainer = isTrainerMode ? (col as typeof TRAINERS[0]) : null;
                      const hallName = !isTrainerMode ? (col as string) : null;

                      const colBookings = filteredBookings.filter(b =>
                        isTrainerMode ? b.trainer === trainer!.id : b.hall === hallName
                      );
                      const booking = colBookings.find(b => b.timeStart === ti);
                      const occupiedBySpan = colBookings.some(b => b.timeStart < ti && b.timeEnd > ti);

                      if (occupiedBySpan) return null;

                      return (
                        <div
                          key={ci}
                          className="j-empty-slot"
                          style={{ borderRight: ci < columns.length - 1 ? '1px solid var(--border2)' : 'none', position: 'relative' }}
                          onClick={(e) => {
                            if (!booking) {
                              e.stopPropagation();
                              const trainerIdx = isTrainerMode ? trainer!.id : 0;
                              openNewSlot(trainerIdx, ti);
                            }
                          }}
                        >
                          {!booking && !occupiedBySpan && (
                            <div className="slot-plus">
                              <Icons.Plus />
                            </div>
                          )}
                          {booking && renderBookingCard(booking, ci)}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* ── ПРАВАЯ ПАНЕЛЬ ── */}
            <div className="j-right">

              {/* Мини-иллюстрация расписания */}
              <div style={{ padding: '14px 16px 8px' }}>
                <ScheduleIllustration />
              </div>

              {/* Мини-календарь */}
              <div className="jr-section">
                <div className="jr-label"><Icons.Calendar /> {MONTH_NAMES[calMonth]}</div>
                <div className="mini-cal">
                  <div className="mc-header">
                    <button className="mc-nav" onClick={() => changeMonth(-1)}><Icons.ChevronLeft /></button>
                    <div className="mc-month">{MONTH_NAMES[calMonth]} {calYear}</div>
                    <button className="mc-nav" onClick={() => changeMonth(1)}><Icons.ChevronRight /></button>
                  </div>
                  <div className="mc-days-grid">
                    {DAY_NAMES_SHORT.map(d => <div key={d} className="mc-day-name">{d}</div>)}
                    {Array.from({ length: firstDayOffset() }).map((_, i) => <div key={`e${i}`} />)}
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                      const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
                      const isSelected = d === selectedDay;
                      const hasEv = hasEventDays.includes(d);
                      return (
                        <div
                          key={d}
                          // Убрали !isToday, теперь классы могут комбинироваться свободно
                          className={`mc-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasEv ? 'has-event' : ''}`}
                          onClick={() => setSelectedDay(d)}
                        >
                          {d}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Залы */}
              <div className="jr-section">
                <div className="jr-label"><Icons.MapPin /> Залы</div>
                {HALLS.map((h, i) => {
                  const colors = ['#F9A08B', '#5BAB72', '#40a8a0', '#7B6CD4'];
                  const counts = [
                    bookings.filter(b => b.hall === h).length,
                  ];
                  return (
                    <div key={h} className={`hall-chip ${activeHalls.includes(h) ? 'active' : ''}`} onClick={() => toggleHall(h)}>
                      <div className="hc-dot" style={{ background: colors[i] }} />
                      <span style={{ flex: 1 }}>{h}</span>
                      <span style={{ fontSize: 10, opacity: 0.6 }}>{bookings.filter(b => b.hall === h).length}</span>
                      {activeHalls.includes(h) && <span style={{ color: 'var(--peach)' }}><Icons.Check /></span>}
                    </div>
                  );
                })}
              </div>

              {/* Загрузка тренеров */}
              <div className="jr-section">
                <div className="jr-label" style={{ justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><LoadingBarsIllustration /></span>
                  <span>Загрузка</span>
                </div>
                <div className="trainer-load">
                  {TRAINERS.map(t => {
                    const tBookings = bookings.filter(b => b.trainer === t.id);
                    const filled = tBookings.reduce((s, b) => s + b.clients, 0);
                    const cap = tBookings.reduce((s, b) => s + b.maxClients, 0);
                    const pct = cap > 0 ? Math.round(filled / cap * 100) : 0;
                    return (
                      <div key={t.id} className="tl-item">
                        <div className="tl-row">
                          <div className="tl-ava" style={{ background: t.color }}>{t.initials}</div>
                          <div className="tl-name">{t.name}</div>
                          <div className="tl-pct">{pct}%</div>
                        </div>
                        <div className="tl-bar-bg">
                          <div className="tl-bar-fill" style={{ width: `${pct}%`, background: t.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Ближайшие записи */}
              <div className="jr-section">
                <div className="jr-label"><Icons.Clock /> Ближайшие</div>
                {filteredBookings.slice(0, 4).map(b => {
                  const trainer = TRAINERS.find(t => t.id === b.trainer);
                  return (
                    <div
                      key={b.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 8px', borderRadius: 8,
                        cursor: 'pointer', marginBottom: 4,
                        border: '1px solid var(--border)',
                        transition: 'background 0.15s',
                      }}
                      onMouseOver={e => (e.currentTarget.style.background = 'var(--bg2)')}
                      onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ width: 4, height: 28, borderRadius: 2, background: b.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--onyx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{TIMES[b.timeStart]} · {trainer?.name}</div>
                      </div>
                      <div style={{ fontSize: 10, color: b.color, fontWeight: 700 }}>{b.clients}/{b.maxClients}</div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* ── POPUP КАРТОЧКИ ЗАПИСИ ── */}
      {popupBooking && (
        <div
          ref={popupRef}
          className="booking-popup"
          style={{ left: popupPos.x, top: popupPos.y }}
        >
          {/* Цветная полоска сверху */}
          <div style={{ height: 4, background: popupBooking.color, opacity: 0.7 }} />
          
          <div className="bp-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--onyx)' }}>{popupBooking.title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {TIMES[popupBooking.timeStart]} – {TIMES[popupBooking.timeEnd]}
                </div>
              </div>
              <div style={{
                padding: '2px 8px', borderRadius: 100, fontSize: 10, fontWeight: 700,
                background: popupBooking.status === 'confirmed' ? 'rgba(91,171,114,0.12)' : 'rgba(224,128,96,0.12)',
                color: popupBooking.status === 'confirmed' ? '#5BAB72' : '#e08060',
              }}>
                {popupBooking.status === 'confirmed' ? 'Подтверждено' : 'Ожидает'}
              </div>
            </div>
          </div>

          <div className="bp-body">
            <div className="bp-row">
              <Icons.Users />
              <span>{popupBooking.clients} из {popupBooking.maxClients} мест занято</span>
            </div>
            <div className="bp-row">
              <Icons.MapPin />
              <span>{popupBooking.hall}</span>
            </div>
            <div className="bp-row">
              <span style={{ width: 13, height: 13, borderRadius: '50%', background: popupBooking.color, display: 'inline-block', flexShrink: 0 }} />
              <span>{TRAINERS.find(t => t.id === popupBooking.trainer)?.full}</span>
            </div>

            {/* Прогресс заполнения */}
            {popupBooking.maxClients > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>
                  <span>Заполненность</span>
                  <span style={{ fontWeight: 700 }}>{Math.round(popupBooking.clients / popupBooking.maxClients * 100)}%</span>
                </div>
                <div style={{ height: 5, background: 'var(--bg2)', borderRadius: 100, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${popupBooking.clients / popupBooking.maxClients * 100}%`, background: popupBooking.color, borderRadius: 100 }} />
                </div>
              </div>
            )}
          </div>

          <div className="bp-actions">
            <button className="bp-btn primary" onClick={(e) => { e.stopPropagation(); openAddClient(popupBooking); }}>
              <Icons.UserPlus /> Добавить
            </button>
            <button className="bp-btn ghost">
              <Icons.Edit /> Изменить
            </button>
            <button className="bp-btn ghost">
              <Icons.Bell />
            </button>
            <button className="bp-btn danger" onClick={() => deleteBooking(popupBooking.id)}>
              <Icons.Trash />
            </button>
          </div>
        </div>
      )}

      {/* ── ФОРМА НОВОГО ЗАНЯТИЯ (PREMIUM KEYPAD) ── */}
      {showNewForm && (
        <div 
          className="modal-overlay open" 
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowNewForm(false);
          }}
        >
          <div className="keypad-modal" onMouseDown={e => e.stopPropagation()}>
            
            {/* ── ШАПКА ── */}
            <div style={{ padding: '24px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(249,160,139,0.12)', color: 'var(--peach)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icons.Plus />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--onyx)', letterSpacing: '-0.3px' }}>Новый слот</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Добавление занятия в сетку</div>
                </div>
              </div>
              <button type="button" className="btn-icon" onClick={() => setShowNewForm(false)}><Icons.X /></button>
            </div>

            {/* ── СЕТКА ДАННЫХ (2 Колонки) ── */}
            <div className="kp-grid">
              
              {/* ЛЕВАЯ КОЛОНКА: Название, Вместимость, Залы */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div>
                  <div className="kp-section-title">Основная инфа</div>
                  <input
                    className="modal-input"
                    style={{ marginBottom: 12, background: 'var(--bg)', border: '1.5px solid var(--border)', height: '44px' }}
                    placeholder="Название (Йога, Пил...)"
                    value={newForm.title}
                    onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
                    autoFocus
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg)', padding: '6px 6px 6px 14px', borderRadius: '12px', border: '1.5px solid var(--border)' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Вместимость чел.</span>
                    <input
                      className="modal-input"
                      type="number" min="1" max="50"
                      style={{ width: 64, height: 32, marginBottom: 0, textAlign: 'center', padding: 0, background: 'white', border: '1.5px solid var(--border)' }}
                      value={newForm.maxClients}
                      onChange={e => setNewForm(f => ({ ...f, maxClients: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <div className="kp-section-title">Помещение</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {HALLS.map(h => (
                      <div
                        key={h}
                        className={`kp-chip ${newForm.hall === h ? 'active' : ''}`}
                        style={newForm.hall === h ? { background: 'var(--onyx)', borderColor: 'var(--onyx)', boxShadow: '0 6px 16px rgba(26,26,26,0.15)' } : {}}
                        onClick={() => setNewForm(f => ({ ...f, hall: h }))}
                      >
                        {h}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ПРАВАЯ КОЛОНКА: Тренеры и Время */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div>
                  <div className="kp-section-title">Тренер</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {TRAINERS.map(t => {
                      const isActive = newBookingSlot?.trainer === t.id;
                      return (
                        <div
                          key={t.id}
                          onClick={() => setNewBookingSlot(s => s ? { ...s, trainer: t.id } : s)}
                          style={{
                            padding: '4px 14px 4px 4px', borderRadius: '100px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            border: `1.5px solid ${isActive ? t.color : 'var(--border)'}`,
                            background: isActive ? t.bg : 'var(--bg)',
                            transition: 'all 0.2s cubic-bezier(0.34, 1.5, 0.64, 1)',
                            boxShadow: isActive ? `0 6px 16px ${t.color}30` : 'none',
                            transform: isActive ? 'translateY(-1px)' : 'none'
                          }}
                        >
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: isActive ? t.color : 'var(--border2)', color: isActive ? 'white' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, transition: 'all 0.2s' }}>{t.initials}</div>
                          <span style={{ fontSize: 12.5, fontWeight: isActive ? 800 : 600, color: isActive ? t.color : 'var(--onyx)' }}>{t.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="kp-section-title">Время старта</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                    {TIMES.map((t, i) => (
                      <div
                        key={i}
                        className={`kp-chip ${newBookingSlot?.time === i ? 'active' : ''}`}
                        style={{ padding: '6px 0', fontSize: 11.5 }}
                        onClick={() => setNewBookingSlot(s => s ? { ...s, time: i } : s)}
                      >
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── ПОДВАЛ ── */}
            <div style={{ padding: '16px 24px', background: '#FDFCFB', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn-ghost-sm" style={{ height: 40, padding: '0 20px', fontSize: 13 }} onClick={() => setShowNewForm(false)}>
                Отмена
              </button>
              <button
                type="button"
                className="btn-primary-sm"
                style={{ height: 40, padding: '0 28px', fontSize: 13 }}
                onClick={(e) => { e.preventDefault(); createBooking(); }}
                disabled={!newForm.title.trim()}
              >
                Создать слот <Icons.Check />
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── МОДАЛКА ДОБАВЛЕНИЯ КЛИЕНТА ── */}
      {showAddModal && addModalBooking && (
        <div className="modal-overlay open" onClick={() => setShowAddModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--onyx)' }}>Добавить клиента</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {addModalBooking.title} · {TIMES[addModalBooking.timeStart]}
                </div>
              </div>
              <button className="btn-icon" onClick={() => setShowAddModal(false)}><Icons.X /></button>
            </div>
            <div className="modal-body">
              {/* Поиск */}
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>
                  <Icons.Search />
                </div>
                <input
                  className="modal-input"
                  style={{ paddingLeft: 34, marginBottom: 0 }}
                  placeholder="Поиск по имени или телефону..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Список клиентов */}
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                {filteredClients.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 32 }}>
                    <EmptyIllustration />
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>Клиенты не найдены</div>
                  </div>
                ) : (
                  filteredClients.map(c => (
                    <div
                      key={c.id}
                      className={`client-row ${selectedClients.includes(c.id) ? 'selected' : ''}`}
                      onClick={() => setSelectedClients(prev =>
                        prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]
                      )}
                    >
                      <div className="client-ava">{c.avatar}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--onyx)' }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.phone} · {c.visits} визитов</div>
                      </div>
                      {selectedClients.includes(c.id) && (
                        <div style={{ color: 'var(--peach)' }}><Icons.Check /></div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {selectedClients.length > 0
                  ? `Выбрано: ${selectedClients.length} клиент(а)`
                  : 'Выберите клиентов из списка'
                }
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-ghost-sm" style={{ height: 38, padding: '0 20px', fontSize: 13 }} onClick={() => setShowAddModal(false)}>
                  Отмена
                </button>
                <button
                  className="btn-primary-sm"
                  style={{ height: 38, padding: '0 24px', fontSize: 13 }}
                  onClick={confirmAddClients}
                  disabled={selectedClients.length === 0}
                >
                  <Icons.UserPlus />
                  Добавить {selectedClients.length > 0 ? `(${selectedClients.length})` : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ТОСТ ── */}
      {toast && (
        <div className="toast">
          <span style={{ color: 'var(--peach)' }}><Icons.Check /></span>
          {toast}
        </div>
      )}
    </>
  );
}