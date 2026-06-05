import React, { useState } from 'react';
import '../App.css';

// --- Types & Interfaces ---
interface SectionTitles {
  [key: string]: [string, string];
}

interface ClientData {
  n: string; i: string; c: string; type: string; badge: string; bl: string; v: number; spent: string; ab: number; abMax: number;
}

interface StaffData {
  name: string; role: string; initials: string; color: string; bg: string; stats: string[];
}

// --- Mock Data ---
const sectionTitles: SectionTitles = {
  dashboard: ['Дашборд', 'Добро пожаловать в Velora CRM'],
  staff: ['Сотрудники', 'Управление командой'],
  clients: ['Клиенты', '142 клиента · 89 активных'],
  reports: ['Отчёты', 'Аналитика и статистика'],
  booking: ['Онлайн-запись', 'Управление каналами записи'],
  finances: ['Финансы', 'Счета, операции, документы'],
  notifications: ['Уведомления', 'Каналы и типы оповещений'],
  loyalty: ['Лояльность', 'Программы и карты клиентов'],
  settings: ['Настройки', 'Конфигурация системы'],
  billing: ['Тариф и оплата', 'Управление подпиской'],
  journal: ['Журнал', 'Расписание занятий'],
  profile: ['Профиль', 'Аккаунт и настройки']
};

const weeks = ['12/5', '19/5', '26/5', '2/6', '9/6', '16/6', '23/6', '30/6'];
const vals = [68, 82, 74, 91, 78, 95, 88, 100];
const svcs: [string, number, string][] = [['Групповой пилатес', 78, '#FCAE91'], ['Индивид. тренировка', 52, '#5BAB72'], ['Йога', 44, '#4A80C4'], ['Стретчинг', 38, '#f0c040']];
const trainers: [string, string, number][] = [['Анна Н.', '#5BAB72', 94], ['Дарья П.', '#e08060', 81], ['Михаил В.', '#40a8a0', 68]];
const clientsData: ClientData[] = [
  { n: 'Мария Коваленко', i: 'МК', c: '#FCAE91', type: 'active-client', badge: 'badge-active', bl: 'Активный', v: 24, spent: '₽48K', ab: 7, abMax: 10 },
  { n: 'Алексей Морозов', i: 'АМ', c: '#f0c040', type: 'vip', badge: 'badge-vip', bl: 'VIP', v: 86, spent: '₽180K', ab: 10, abMax: 10 },
  { n: 'Елена Соколова', i: 'ЕС', c: '#5BAB72', type: 'new-client', badge: 'badge-new', bl: 'Новый', v: 2, spent: '₽4K', ab: 1, abMax: 8 },
  { n: 'Дмитрий Попов', i: 'ДП', c: '#4A80C4', type: 'active-client', badge: 'badge-active', bl: 'Активный', v: 18, spent: '₽32K', ab: 5, abMax: 10 },
  { n: 'Наталья Белова', i: 'НБ', c: '#7b6cd4', type: 'active-client', badge: 'badge-active', bl: 'Активный', v: 11, spent: '₽22K', ab: 3, abMax: 8 },
  { n: 'Светлана Иванова', i: 'СИ', c: '#D88C9A', type: 'vip', badge: 'badge-vip', bl: 'VIP', v: 54, spent: '₽96K', ab: 8, abMax: 10 },
];

const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const mVals = [180, 210, 240, 195, 270, 260, 284, 0, 0, 0, 0, 0];
const ops = [
  ['Оплата абонемента', 'Мария Коваленко', '#5BAB72', '+₽12 000', 'Сегодня, 14:32'],
  ['Возврат средств', 'Иван Петров', '#D88C9A', '-₽2 500', 'Сегодня, 11:15'],
  ['Разовая запись', 'Елена Соколова', '#5BAB72', '+₽1 200', 'Вчера, 18:45'],
  ['Аренда зала', 'Контрагент', '#4A80C4', '-₽8 000', 'Вчера, 10:00'],
  ['Оплата сертификата', 'Алексей Морозов', '#5BAB72', '+₽5 000', '29 июн, 16:20'],
];

const levels = [
  ['Серебро', 'Базовый уровень', 'до ₽10K', '42 клиента', '#B0B0C0'],
  ['Золото', 'Постоянный клиент', '₽10K–50K', '35 клиентов', '#f0c040'],
  ['Платина', 'VIP клиент', 'от ₽50K', '12 клиентов', '#FCAE91']
];
const deps = [['Мария К.', '₽3 200', '#FCAE91'], ['Алексей М.', '₽15 000', '#f0c040'], ['Елена С.', '₽800', '#5BAB72'], ['Дмитрий П.', '₽5 400', '#4A80C4']];

const staffData: Record<string, StaffData> = {
  owner: { name: 'Алексей Морозов', role: 'Владелец студии', initials: 'АМ', color: 'linear-gradient(135deg,#FCAE91,#f5887a)', bg: 'linear-gradient(135deg,rgba(252,174,145,0.15) 0%,rgba(249,160,139,0.08) 100%)', stats: ['284', '₽—', '5.0★', '—'] },
  admin1: { name: 'Ольга Смирнова', role: 'Администратор', initials: 'ОС', color: 'linear-gradient(135deg,#4A80C4,#3a6ab0)', bg: 'linear-gradient(135deg,rgba(74,128,196,0.1) 0%,rgba(74,128,196,0.05) 100%)', stats: ['148', '₽42K', '4.8★', '78%'] },
  admin2: { name: 'Иван Коваль', role: 'Администратор', initials: 'ИК', color: 'linear-gradient(135deg,#7b6cd4,#6050b8)', bg: 'linear-gradient(135deg,rgba(123,108,212,0.1) 0%,rgba(123,108,212,0.05) 100%)', stats: ['96', '₽38K', '4.7★', '62%'] },
  trainer1: { name: 'Анна Новикова', role: 'Тренер пилатеса', initials: 'АН', color: 'linear-gradient(135deg,#5BAB72,#4a9060)', bg: 'linear-gradient(135deg,rgba(91,171,114,0.1) 0%,rgba(91,171,114,0.05) 100%)', stats: ['312', '₽65K', '4.9★', '94%'] },
  trainer2: { name: 'Дарья Петрова', role: 'Тренер йоги', initials: 'ДП', color: 'linear-gradient(135deg,#e08060,#c86040)', bg: 'linear-gradient(135deg,rgba(224,128,96,0.1) 0%,rgba(224,128,96,0.05) 100%)', stats: ['248', '₽58K', '4.8★', '81%'] },
  trainer3: { name: 'Михаил Волков', role: 'Тренер стретчинга', initials: 'МВ', color: 'linear-gradient(135deg,#40a8a0,#2d8880)', bg: 'linear-gradient(135deg,rgba(64,168,160,0.1) 0%,rgba(64,168,160,0.05) 100%)', stats: ['186', '₽48K', '4.7★', '68%'] },
};

const jDays = ['Анна Н.', 'Дарья П.', 'Михаил В.', 'Ольга С.', 'Иван К.', 'Дарья П.2'];
const jTimes = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
const jColors = ['rgba(252,174,145,0.4)', 'rgba(91,171,114,0.35)', 'rgba(64,168,160,0.35)', 'rgba(74,128,196,0.35)', 'rgba(123,108,212,0.35)', 'rgba(224,128,96,0.35)'];
const jBookings: Record<string, string> = {
  '0_2': 'Пилатес', '0_4': 'Пил. advanced', '0_7': 'Персональный', '0_11': 'Вечерний',
  '1_1': 'Йога Хатха', '1_5': 'Флоу', '1_9': 'Аштанга',
  '2_3': 'Стретчинг', '2_6': 'Стретч+', '2_10': 'Вечер',
  '3_0': 'Открытие', '3_8': 'Планёрка',
  '4_2': 'Фитбол', '4_7': 'Роллинг',
  '5_4': 'Детский', '5_9': 'Спина',
};

const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

// --- Component ---
export default function VeloraCRM() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [isTgModalOpen, setTgModalOpen] = useState(false);
  
  // Specific internal states
  const [activeStaff, setActiveStaff] = useState('owner');
  const [activeCat, setActiveCat] = useState('Все (142)');
  const [activeFTab, setActiveFTab] = useState('Счета и кассы');
  
  // Calendar states
  const [calMonth, setCalMonth] = useState(5); // June (0-indexed)
  const [calYear, setCalYear] = useState(2025);

  // Journal Filters State
  const [jFilters, setJFilters] = useState<Record<string, boolean>>({
    'Все тренеры': true, 'Анна Н.': false, 'Дарья П.': false, 'Михаил В.': false
  });
  const [jHalls, setJHalls] = useState<Record<string, boolean>>({
    'Зал 1': true, 'Зал 2': false, 'Студия': false, 'Онлайн': false
  });

  // Notif states
  const [notifs, setNotifs] = useState<Record<string, boolean>>({
    'n1': true, 'n2': true, 'n3': true, 'n4': false, 'n5': true, 'n6': true, 'n7': true, 'n8': false, 'n9': true, 'n10': true, 'n11': false, 'n12': false
  });

  const handlePrimaryBtn = () => alert('Создать новую запись');
  const copyLink = () => alert('Ссылка для Instagram скопирована: https://book.velora.studio/your-studio');
  const showWebSettings = () => alert('Настройки веб-виджета открыты');

  const changeMonth = (dir: number) => {
    let newMonth = calMonth + dir;
    let newYear = calYear;
    if (newMonth > 11) { newMonth = 0; newYear++; }
    if (newMonth < 0) { newMonth = 11; newYear--; }
    setCalMonth(newMonth);
    setCalYear(newYear);
  };

  const toggleJFilter = (name: string) => setJFilters(prev => ({ ...prev, [name]: !prev[name] }));
  const toggleJHall = (name: string) => setJHalls(prev => ({ ...prev, [name]: !prev[name] }));
  const toggleNotif = (key: string) => setNotifs(prev => ({ ...prev, [key]: !prev[key] }));

  // Calendar setup
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const offset = (firstDay === 0) ? 6 : firstDay - 1;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', lineHeight: 1.5 }}>
      
      {/* SIDEBAR */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-name">
            <span className="logo-dot"></span>
            Velora CRM
          </div>
          <div className="logo-sub">Studio Pro · Пилатес центр</div>
        </div>

        <div className="sidebar-nav">
          <div className={`nav-item ${activeSection === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveSection('dashboard')}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
            Дашборд
          </div>
          <div className={`nav-item ${activeSection === 'staff' ? 'active' : ''}`} onClick={() => setActiveSection('staff')}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0-3-3.85" /></svg>
            Сотрудники
          </div>
          <div className={`nav-item ${activeSection === 'clients' ? 'active' : ''}`} onClick={() => setActiveSection('clients')}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.85" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            Клиенты
            <span className="nav-badge">142</span>
          </div>
          <div className={`nav-item ${activeSection === 'reports' ? 'active' : ''}`} onClick={() => setActiveSection('reports')}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>
            Отчёты
          </div>
          <div className={`nav-item ${activeSection === 'booking' ? 'active' : ''}`} onClick={() => setActiveSection('booking')}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
            Онлайн-запись
          </div>
          <div className={`nav-item ${activeSection === 'finances' ? 'active' : ''}`} onClick={() => setActiveSection('finances')}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            Финансы
          </div>
          <div className={`nav-item ${activeSection === 'notifications' ? 'active' : ''}`} onClick={() => setActiveSection('notifications')}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            Уведомления
            <span className="nav-badge">3</span>
          </div>
          <div className={`nav-item ${activeSection === 'loyalty' ? 'active' : ''}`} onClick={() => setActiveSection('loyalty')}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
            Лояльность
          </div>

          <div className="sidebar-divider"></div>
          
          <div className={`nav-item ${activeSection === 'settings' ? 'active' : ''}`} onClick={() => setActiveSection('settings')}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            Настройки
          </div>
          <div className={`nav-item ${activeSection === 'billing' ? 'active' : ''}`} onClick={() => setActiveSection('billing')}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
            Тариф и оплата
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-journal" onClick={() => setActiveSection('journal')}>
            <div className="journal-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            </div>
            <div>
              <div className="journal-text">Журнал</div>
              <div className="journal-sub">Расписание занятий</div>
            </div>
          </div>
          <div className="user-pill" onClick={() => setActiveSection('profile')}>
            <div className="user-avatar">АМ</div>
            <div className="user-email">admin@velora.studio</div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
        </div>
      </nav>

      {/* MAIN */}
      <div className="main">
        <div className="topbar">
          <div>
            <div className="topbar-title">{sectionTitles[activeSection]?.[0]}</div>
            <div className="topbar-subtitle">{sectionTitles[activeSection]?.[1]}</div>
          </div>
          <div className="topbar-spacer"></div>
          <button className="topbar-ghost">Фильтр</button>
          <button className="topbar-btn" onClick={handlePrimaryBtn}>+ Создать</button>
        </div>

        <div className="content">
          
          {/* ===== DASHBOARD ===== */}
          <div className={`section ${activeSection === 'dashboard' ? 'active' : ''}`}>
            <div className="grid-4 mb-20">
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(252,174,145,0.15)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FCAE91" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                </div>
                <div className="stat-label">Выручка за месяц</div>
                <div className="stat-value">₽284K</div>
                <div className="stat-change up">↑ 18.4% vs прошлый мес.</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(163,201,168,0.15)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5BAB72" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                </div>
                <div className="stat-label">Активных клиентов</div>
                <div className="stat-value">142</div>
                <div className="stat-change up">↑ 12 новых</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(100,140,200,0.1)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4A80C4" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                </div>
                <div className="stat-label">Записей сегодня</div>
                <div className="stat-value">37</div>
                <div className="stat-change up">↑ 5 vs вчера</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(216,140,154,0.12)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D88C9A" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                </div>
                <div className="stat-label">Уровень удержания</div>
                <div className="stat-value">87%</div>
                <div className="stat-change up">↑ 3.2%</div>
              </div>
            </div>

            <div className="grid-2 mb-20">
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div><div style={{ fontSize: '14px', fontWeight: 700 }}>Выручка по неделям</div><div style={{ fontSize: '11px', color: 'var(--text3)' }}>Последние 8 недель</div></div>
                  <div className="tabs" style={{ marginBottom: 0 }}>
                    <div className="tab active">Нед.</div><div className="tab">Мес.</div><div className="tab">Год</div>
                  </div>
                </div>
                <div id="dash-chart">
                  <div className="chart-bars">
                    {weeks.map((_, i) => (
                      <div key={i} className={`bar ${i === 7 ? 'active' : ''}`} style={{ height: `${vals[i]}%` }}>
                        <div className="bar-tooltip">₽{(vals[i] * 2.84).toFixed(0)}K</div>
                      </div>
                    ))}
                  </div>
                  <div className="chart-labels">
                    {weeks.map((w, i) => <div key={i} className="chart-label">{w}</div>)}
                  </div>
                </div>
              </div>
              <div className="card">
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Последние события</div>
                <div className="activity-item"><div className="activity-dot" style={{ background: '#FCAE91' }}></div><div><div className="activity-text"><strong>Мария К.</strong> записалась на пилатес у Анны</div><div className="activity-time">2 мин. назад</div></div></div>
                <div className="activity-item"><div className="activity-dot" style={{ background: '#5BAB72' }}></div><div><div className="activity-text"><strong>Оплата ₽3 500</strong> от Елены Соколовой</div><div className="activity-time">14 мин. назад</div></div></div>
                <div className="activity-item"><div className="activity-dot" style={{ background: '#4A80C4' }}></div><div><div className="activity-text"><strong>Дмитрий П.</strong> активировал абонемент на 10 занятий</div><div className="activity-time">38 мин. назад</div></div></div>
                <div className="activity-item"><div className="activity-dot" style={{ background: '#D88C9A' }}></div><div><div className="activity-text"><strong>Отмена записи</strong> — Наталья Б. (18:00)</div><div className="activity-time">1 час назад</div></div></div>
                <div className="activity-item"><div className="activity-dot" style={{ background: '#f0c040' }}></div><div><div className="activity-text"><strong>Новый VIP клиент</strong> — Алексей Морозов</div><div className="activity-time">2 часа назад</div></div></div>
              </div>
            </div>

            <div className="grid-3">
              <div className="card card-sm">
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>Топ услуги</div>
                <div>
                  {svcs.map(([n, p, c], i) => (
                    <div key={i} style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                        <span>{n}</span><span style={{ fontWeight: 700 }}>{p}%</span>
                      </div>
                      <div style={{ height: '4px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px' }}>
                        <div style={{ width: `${p}%`, height: '100%', background: c, borderRadius: '4px', transition: 'width 1s' }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card card-sm">
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>Нагрузка тренеров</div>
                <div>
                  {trainers.map(([n, c, p], i) => (
                    <div key={i} style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                        <span>{n}</span><span style={{ fontWeight: 700 }}>{p}%</span>
                      </div>
                      <div style={{ height: '4px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px' }}>
                        <div style={{ width: `${p}%`, height: '100%', background: c, borderRadius: '4px' }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card card-sm">
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>Кассы (сегодня)</div>
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>Основная касса</div>
                  <div style={{ fontSize: '22px', fontWeight: 800 }}>₽48 200</div>
                </div>
                <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }}></div>
                <div style={{ marginBottom: '6px' }}><div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>Безналичный расчёт</div><div style={{ fontSize: '16px', fontWeight: 700 }}>₽82 400</div></div>
                <div style={{ marginBottom: '6px' }}><div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>Онлайн платежи</div><div style={{ fontSize: '16px', fontWeight: 700 }}>₽34 100</div></div>
                <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }}></div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Итого за день</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--accent2)' }}>₽164 700</div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== STAFF ===== */}
          <div className={`section ${activeSection === 'staff' ? 'active' : ''}`} style={{ height: 'calc(100vh - 56px - 56px)' }}>
            <div className="staff-layout">
              <div className="staff-list-panel">
                <div className="staff-panel-header">Команда · 9 человек</div>
                <div className="staff-list">
                  <div className="role-sep">Владелец</div>
                  <div className={`staff-item ${activeStaff === 'owner' ? 'active' : ''}`} onClick={() => setActiveStaff('owner')}>
                    <div className="staff-ava" style={{ background: 'linear-gradient(135deg,#FCAE91,#f5887a)' }}>АМ</div>
                    <div className="staff-info"><div className="name">Алексей Морозов</div><div className="role">Владелец</div></div>
                  </div>
                  <div className="role-sep">Администраторы</div>
                  <div className={`staff-item ${activeStaff === 'admin1' ? 'active' : ''}`} onClick={() => setActiveStaff('admin1')}>
                    <div className="staff-ava" style={{ background: 'linear-gradient(135deg,#4A80C4,#3a6ab0)' }}>ОС</div>
                    <div className="staff-info"><div className="name">Ольга Смирнова</div><div className="role">Администратор</div></div>
                  </div>
                  <div className={`staff-item ${activeStaff === 'admin2' ? 'active' : ''}`} onClick={() => setActiveStaff('admin2')}>
                    <div className="staff-ava" style={{ background: 'linear-gradient(135deg,#7b6cd4,#6050b8)' }}>ИК</div>
                    <div className="staff-info"><div className="name">Иван Коваль</div><div className="role">Администратор</div></div>
                  </div>
                  <div className="role-sep">Тренеры</div>
                  <div className={`staff-item ${activeStaff === 'trainer1' ? 'active' : ''}`} onClick={() => setActiveStaff('trainer1')}>
                    <div className="staff-ava" style={{ background: 'linear-gradient(135deg,#5BAB72,#4a9060)' }}>АН</div>
                    <div className="staff-info"><div className="name">Анна Новикова</div><div className="role">Тренер пилатеса</div></div>
                  </div>
                  <div className={`staff-item ${activeStaff === 'trainer2' ? 'active' : ''}`} onClick={() => setActiveStaff('trainer2')}>
                    <div className="staff-ava" style={{ background: 'linear-gradient(135deg,#e08060,#c86040)' }}>ДП</div>
                    <div className="staff-info"><div className="name">Дарья Петрова</div><div className="role">Тренер йоги</div></div>
                  </div>
                  <div className={`staff-item ${activeStaff === 'trainer3' ? 'active' : ''}`} onClick={() => setActiveStaff('trainer3')}>
                    <div className="staff-ava" style={{ background: 'linear-gradient(135deg,#40a8a0,#2d8880)' }}>МВ</div>
                    <div className="staff-info"><div className="name">Михаил Волков</div><div className="role">Тренер стретчинга</div></div>
                  </div>
                </div>
              </div>

              <div className="staff-detail">
                <div className="staff-hero">
                  <div className="staff-hero-bg" style={{ background: staffData[activeStaff].bg }}></div>
                  <div className="staff-hero-info">
                    <div className="staff-hero-ava" style={{ background: staffData[activeStaff].color }}>{staffData[activeStaff].initials}</div>
                    <div>
                      <div className="staff-hero-name">{staffData[activeStaff].name}</div>
                      <div className="staff-hero-role">{staffData[activeStaff].role}</div>
                    </div>
                  </div>
                </div>
                <div className="staff-body">
                  <div className="staff-stats">
                    {staffData[activeStaff].stats.map((v, i) => (
                      <div key={i} className="staff-stat">
                        <div className="v">{v}</div>
                        <div className="l">{['Записи', 'Зарплата', 'Рейтинг', 'Загрузка'][i]}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>График работы на неделю</div>
                  <div className="schedule-grid">
                    {['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d, i) => <div key={i} className="sch-head">{d}</div>)}
                    {['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'].map((h, hi) => {
                      const booked = [[1,0,1,1,0,1,0],[0,1,0,1,1,0,0],[1,1,1,0,1,1,0],[0,0,1,1,0,0,1],[1,0,0,1,1,1,0],[0,1,1,0,0,1,0],[1,1,0,1,0,1,1]];
                      return (
                        <React.Fragment key={hi}>
                          <div className="sch-time">{h}</div>
                          {[0, 1, 2, 3, 4, 5, 6].map(d => (
                            <div key={d} className={`sch-cell ${booked[hi][d] ? 'booked' : ''}`}></div>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== CLIENTS ===== */}
          <div className={`section ${activeSection === 'clients' ? 'active' : ''}`}>
            <div className="category-chips">
              {['Все (142)', 'VIP (18)', 'Активные (89)', 'Новые (12)', 'С абонементом (67)', 'Неактивные (23)', 'День рождения 🎂 (3)'].map((cat, i) => (
                <div key={i} className={`cat-chip ${activeCat === cat ? 'active' : ''}`} onClick={() => setActiveCat(cat)}>{cat}</div>
              ))}
            </div>
            <div className="clients-grid">
              {clientsData.map((cl, i) => (
                <div key={i} className={`client-card ${cl.type}`}>
                  <div className="client-card-top">
                    <div className="client-ava" style={{ background: `linear-gradient(135deg,${cl.c},${cl.c}bb)` }}>{cl.i}</div>
                    <div><div className="client-name">{cl.n}</div><div className="client-visits">{cl.v} визитов</div></div>
                    <div className={`client-badge ${cl.badge}`}>{cl.bl}</div>
                  </div>
                  <div className="client-stats">
                    <div className="client-stat"><div className="v">{cl.v}</div><div className="l">Визиты</div></div>
                    <div className="client-stat"><div className="v">{cl.spent}</div><div className="l">Итого</div></div>
                    <div className="client-stat"><div className="v">{cl.ab}/{cl.abMax}</div><div className="l">Абон.</div></div>
                  </div>
                  <div className="abonement-label"><span>Абонемент</span><span>{cl.ab}/{cl.abMax} занятий</span></div>
                  <div className="abonement-bar"><div className="abonement-fill" style={{ width: `${(cl.ab / cl.abMax) * 100}%` }}></div></div>
                  <div className="loyalty-chip">🌟 {cl.v * 12} баллов</div>
                </div>
              ))}
            </div>
          </div>

          {/* ===== REPORTS ===== */}
          <div className={`section ${activeSection === 'reports' ? 'active' : ''}`}>
            <div className="tabs">
              <div className="tab active">Основные</div><div className="tab">По продажам</div><div className="tab">По тренерам</div><div className="tab">По услугам</div><div className="tab">Все</div><div className="tab">События</div>
            </div>
            <div className="report-metrics">
              <div className="stat-card"><div className="stat-label">Выручка (мес.)</div><div className="stat-value" style={{ fontSize: '22px' }}>₽284K</div><div className="stat-change up">↑ 18%</div></div>
              <div className="stat-card"><div className="stat-label">Занятий (мес.)</div><div className="stat-value" style={{ fontSize: '22px' }}>318</div><div className="stat-change up">↑ 24</div></div>
              <div className="stat-card"><div className="stat-label">Средний чек</div><div className="stat-value" style={{ fontSize: '22px' }}>₽1 890</div><div className="stat-change up">↑ 5.2%</div></div>
              <div className="stat-card"><div className="stat-label">Новые клиенты</div><div className="stat-value" style={{ fontSize: '22px' }}>12</div><div className="stat-change down">↓ 2</div></div>
              <div className="stat-card"><div className="stat-label">Отмен занятий</div><div className="stat-value" style={{ fontSize: '22px' }}>4.2%</div><div className="stat-change up">↓ 0.8%</div></div>
            </div>
            <div className="grid-2">
              <div className="card">
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Выручка по месяцам</div>
                <div className="report-bar-outer">
                  {months.map((m, i) => mVals[i] > 0 && (
                    <div key={i} className="rbar" style={{ height: `${(mVals[i] / 284) * 100}%`, background: i === 6 ? 'var(--accent)' : 'rgba(252,174,145,0.3)' }} title={`${m}: ₽${mVals[i]}K`}></div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                  {months.map((m, i) => mVals[i] > 0 && <div key={i} style={{ fontSize: '10px', color: 'var(--text3)', textAlign: 'center', flex: 1 }}>{m}</div>)}
                </div>
              </div>
              <div className="card">
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Структура доходов</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <svg width="140" height="140" viewBox="0 0 140 140">
                    <circle cx="70" cy="70" r="52" fill="none" stroke="rgba(252,174,145,0.15)" strokeWidth="18" />
                    <circle cx="70" cy="70" r="52" fill="none" stroke="#FCAE91" strokeWidth="18" strokeDasharray="196 130" strokeLinecap="round" transform="rotate(-90 70 70)" />
                    <circle cx="70" cy="70" r="52" fill="none" stroke="#5BAB72" strokeWidth="18" strokeDasharray="80 246" strokeLinecap="round" transform="rotate(63 70 70)" />
                    <circle cx="70" cy="70" r="52" fill="none" stroke="#4A80C4" strokeWidth="18" strokeDasharray="50 276" strokeLinecap="round" transform="rotate(152 70 70)" />
                    <text x="70" y="66" textAnchor="middle" fontSize="20" fontWeight="800" fontFamily="Manrope" fill="var(--text)">₽284K</text>
                    <text x="70" y="82" textAnchor="middle" fontSize="10" fill="#999" fontFamily="Manrope">всего</text>
                  </svg>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}><div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#FCAE91' }}></div><div style={{ fontSize: '12px' }}>Абонементы <strong>59%</strong></div></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}><div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#5BAB72' }}></div><div style={{ fontSize: '12px' }}>Разовые <strong>24%</strong></div></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}><div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#4A80C4' }}></div><div style={{ fontSize: '12px' }}>Доп. услуги <strong>15%</strong></div></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#f0c040' }}></div><div style={{ fontSize: '12px' }}>Товары <strong>2%</strong></div></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== BOOKING ===== */}
          <div className={`section ${activeSection === 'booking' ? 'active' : ''}`}>
            <div className="grid-2 mb-20" style={{ gridTemplateColumns: '340px 1fr', gap: '28px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px', color: 'var(--text2)' }}>Превью страницы записи</div>
                <div className="booking-preview float-anim">
                  <div className="booking-preview-header">
                    <div className="bp-logo">Pilates Studio</div>
                    <div className="bp-sub">Выберите услугу и время</div>
                  </div>
                  <div className="bp-services">
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Услуги</div>
                    <div className="bp-service"><div className="bp-service-dot" style={{ background: '#FCAE91' }}></div><div className="bp-service-name">Групповой пилатес</div><div className="bp-service-price">₽1 200</div></div>
                    <div className="bp-service"><div className="bp-service-dot" style={{ background: '#5BAB72' }}></div><div className="bp-service-name">Индивидуальное занятие</div><div className="bp-service-price">₽2 500</div></div>
                    <div className="bp-service"><div className="bp-service-dot" style={{ background: '#4A80C4' }}></div><div className="bp-service-name">Стретчинг</div><div className="bp-service-price">₽900</div></div>
                    <button style={{ width: '100%', marginTop: '8px', padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 700, fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)' }}>Записаться →</button>
                  </div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px', color: 'var(--text2)' }}>Каналы подключения</div>
                <div className="grid-3 mb-20">
                  <div className="channel-card" onClick={() => setTgModalOpen(true)}>
                    <div className="channel-icon">✈️</div><div className="channel-name">Telegram-бот</div><div className="channel-desc">Автоматическая запись через бота</div>
                  </div>
                  <div className="channel-card" onClick={copyLink}>
                    <div className="channel-icon">📸</div><div className="channel-name">Instagram</div><div className="channel-desc">Ссылка для bio и сторис</div>
                  </div>
                  <div className="channel-card" onClick={showWebSettings}>
                    <div className="channel-icon">🌐</div><div className="channel-name">Веб-сайт</div><div className="channel-desc">Виджет или отдельная страница</div>
                  </div>
                </div>
                <div className="card">
                  <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>Настройки онлайн-записи</div>
                  <div className="settings-row"><div><div className="label">Предоплата</div><div className="sub">Требовать оплату при записи</div></div><label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label></div>
                  <div className="settings-row"><div><div className="label">Подтверждение тренером</div><div className="sub">Запись ожидает одобрения</div></div><label className="toggle-switch"><input type="checkbox" /><span className="toggle-slider"></span></label></div>
                  <div className="settings-row"><div><div className="label">Напоминание клиенту</div><div className="sub">За 24 и 2 часа до занятия</div></div><label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label></div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== FINANCES ===== */}
          <div className={`section ${activeSection === 'finances' ? 'active' : ''}`}>
            <div className="finance-tabs-big">
              {['Счета и кассы', 'Операции', 'Контрагенты', 'Документы', 'Онлайн-платежи', 'Методы оплаты', 'Отчёты'].map((t, i) => (
                <div key={i} className={`ftab ${activeFTab === t ? 'active' : ''}`} onClick={() => setActiveFTab(t)}>{t}</div>
              ))}
            </div>
            <div className="finance-illus">
              <svg width="100" height="100" viewBox="0 0 100 100" className="donut-svg" style={{ position: 'absolute', right: '30px' }}>
                <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(252,174,145,0.2)" strokeWidth="10" />
                <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(252,174,145,0.5)" strokeWidth="10" strokeDasharray="142 98" strokeLinecap="round" transform="rotate(-90 50 50)" />
                <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(91,171,114,0.4)" strokeWidth="10" strokeDasharray="56 184" strokeLinecap="round" transform="rotate(56 50 50)" />
              </svg>
              <div style={{ textAlign: 'center', zIndex: 1 }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Баланс всех счетов</div>
                <div style={{ fontSize: '44px', fontWeight: 800, letterSpacing: '-2px', color: 'var(--text)' }}>₽2.4M</div>
                <div style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '4px' }}>Обновлено только что</div>
              </div>
            </div>
            <div className="grid-3 mb-20">
              <div className="card card-sm">
                <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, marginBottom: '4px' }}>ОСНОВНАЯ КАССА</div>
                <div style={{ fontSize: '24px', fontWeight: 800, marginBottom: '2px' }}>₽485 200</div>
                <div style={{ fontSize: '11px', color: '#5BAB72', fontWeight: 600 }}>↑ +₽48 200 сегодня</div>
              </div>
              <div className="card card-sm">
                <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, marginBottom: '4px' }}>РАСЧЁТНЫЙ СЧЁТ</div>
                <div style={{ fontSize: '24px', fontWeight: 800, marginBottom: '2px' }}>₽1 840 000</div>
                <div style={{ fontSize: '11px', color: '#5BAB72', fontWeight: 600 }}>↑ +₽82 400 сегодня</div>
              </div>
              <div className="card card-sm">
                <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, marginBottom: '4px' }}>ОНЛАЙН-КОШЕЛЁК</div>
                <div style={{ fontSize: '24px', fontWeight: 800, marginBottom: '2px' }}>₽94 100</div>
                <div style={{ fontSize: '11px', color: '#5BAB72', fontWeight: 600 }}>↑ +₽34 100 сегодня</div>
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Последние финансовые операции</div>
              <div>
                {ops.map(([t, n, c, a, d], i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: `${c}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: c, fontWeight: 700 }}>
                      {a.startsWith('+') ? '↑' : '↓'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{t}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{n}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: c }}>{a}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ===== NOTIFICATIONS ===== */}
          <div className={`section ${activeSection === 'notifications' ? 'active' : ''}`}>
            <div className="grid-2">
              <div>
                <div className="section-title" style={{ fontSize: '15px', marginBottom: '12px' }}>Каналы уведомлений</div>
                <div className="notif-channel"><div className="channel-icon-sm" style={{ background: 'rgba(100,149,237,0.1)' }}>✈️</div><div><div style={{ fontSize: '13px', fontWeight: 600 }}>Telegram</div><div style={{ fontSize: '11px', color: 'var(--text3)' }}>Бот @VeloraNotifyBot</div></div><label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label></div>
                <div className="notif-channel"><div className="channel-icon-sm" style={{ background: 'rgba(252,174,145,0.1)' }}>📸</div><div><div style={{ fontSize: '13px', fontWeight: 600 }}>Instagram</div><div style={{ fontSize: '11px', color: 'var(--text3)' }}>Direct сообщения</div></div><label className="toggle-switch"><input type="checkbox" /><span className="toggle-slider"></span></label></div>
                <div className="notif-channel"><div className="channel-icon-sm" style={{ background: 'rgba(91,171,114,0.1)' }}>💬</div><div><div style={{ fontSize: '13px', fontWeight: 600 }}>WhatsApp</div><div style={{ fontSize: '11px', color: 'var(--text3)' }}>+7 (999) 123-45-67</div></div><label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label></div>
                <div className="notif-channel"><div className="channel-icon-sm" style={{ background: 'rgba(74,128,196,0.1)' }}>📧</div><div><div style={{ fontSize: '13px', fontWeight: 600 }}>Email</div><div style={{ fontSize: '11px', color: 'var(--text3)' }}>admin@velora.studio</div></div><label className="toggle-switch"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label></div>
                <div className="notif-channel"><div className="channel-icon-sm" style={{ background: 'rgba(200,150,200,0.1)' }}>📱</div><div><div style={{ fontSize: '13px', fontWeight: 600 }}>SMS</div><div style={{ fontSize: '11px', color: 'var(--text3)' }}>через МТС Коннект</div></div><label className="toggle-switch"><input type="checkbox" /><span className="toggle-slider"></span></label></div>
              </div>
              <div>
                <div className="section-title" style={{ fontSize: '15px', marginBottom: '12px' }}>Типы уведомлений</div>
                <div className="card">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '6px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)' }}>СОБЫТИЕ</div><div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textAlign: 'center' }}>ТГ / WA</div>
                  </div>
                  {[
                    { bg: '#FCAE91', t: 'Новая запись', s: 'Клиент записался на занятие', keys: ['n1', 'n2'] },
                    { bg: '#D88C9A', t: 'Отмена записи', s: 'Клиент отменил занятие', keys: ['n3', 'n4'] },
                    { bg: '#4A80C4', t: 'Напоминание', s: 'За 24 часа до занятия', keys: ['n5', 'n6'] },
                    { bg: '#5BAB72', t: 'Оплата получена', s: 'Подтверждение платежа', keys: ['n7', 'n8'] },
                    { bg: '#f0c040', t: 'Абонемент заканчивается', s: 'Осталось 2 занятия', keys: ['n9', 'n10'] },
                    { bg: '#e08060', t: 'День рождения', s: 'Поздравление клиента', keys: ['n11', 'n12'] }
                  ].map((row, i) => (
                    <div key={i} className="notif-type-row">
                      <div className="notif-dot" style={{ background: row.bg }}></div>
                      <div className="notif-desc"><div className="t">{row.t}</div><div className="s">{row.s}</div></div>
                      <div className="notif-checks">
                        <div className={`mini-check ${notifs[row.keys[0]] ? 'on' : ''}`} onClick={() => toggleNotif(row.keys[0])}>{notifs[row.keys[0]] ? '✓' : ''}</div>
                        <div className={`mini-check ${notifs[row.keys[1]] ? 'on' : ''}`} onClick={() => toggleNotif(row.keys[1])}>{notifs[row.keys[1]] ? '✓' : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ===== LOYALTY ===== */}
          <div className={`section ${activeSection === 'loyalty' ? 'active' : ''}`}>
            <div className="grid-4 mb-20">
              <div className="loyalty-card" style={{ background: 'linear-gradient(135deg,rgba(252,174,145,0.08) 0%,rgba(249,160,139,0.04) 100%)', borderColor: 'rgba(252,174,145,0.3)' }}>
                <div className="loyalty-card-icon" style={{ background: 'rgba(252,174,145,0.15)' }}>🏆</div>
                <div className="loyalty-card-title">Карты лояльности</div><div className="loyalty-card-desc">Накопительная система баллов</div><div className="loyalty-card-count">89 <span>клиентов</span></div>
              </div>
              <div className="loyalty-card">
                <div className="loyalty-card-icon" style={{ background: 'rgba(91,171,114,0.15)' }}>💰</div>
                <div className="loyalty-card-title">Скидки и кэшбэк</div><div className="loyalty-card-desc">Персональные предложения</div><div className="loyalty-card-count">18 <span>активных</span></div>
              </div>
              <div className="loyalty-card">
                <div className="loyalty-card-icon" style={{ background: 'rgba(74,128,196,0.15)' }}>🎫</div>
                <div className="loyalty-card-title">Сертификаты</div><div className="loyalty-card-desc">Подарочные и именные</div><div className="loyalty-card-count">34 <span>продано</span></div>
              </div>
              <div className="loyalty-card">
                <div className="loyalty-card-icon" style={{ background: 'rgba(216,140,154,0.15)' }}>📦</div>
                <div className="loyalty-card-title">Абонементы</div><div className="loyalty-card-desc">На 8, 10, 20 занятий</div><div className="loyalty-card-count">67 <span>активных</span></div>
              </div>
            </div>
            <div className="grid-2 mb-20">
              <div className="card">
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Уровни лояльности</div>
                <div>
                  {levels.map(([n, d, r, c, col], i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: `${col}15`, borderRadius: 'var(--radius-sm)', marginBottom: '8px', border: `1px solid ${col}30` }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: col, flexShrink: 0 }}></div>
                      <div style={{ flex: 1 }}><div style={{ fontSize: '13px', fontWeight: 700 }}>{n}</div><div style={{ fontSize: '11px', color: 'var(--text3)' }}>{d} · {r}</div></div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text2)' }}>{c}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Депозиты на счетах</div>
                <div>
                  {deps.map(([n, a, c], i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{n}</div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: c }}>{a}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Реферальная программа</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px' }}>
                <div style={{ background: 'rgba(252,174,145,0.08)', borderRadius: 'var(--radius)', padding: '16px', border: '1px solid rgba(252,174,145,0.2)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Приведи друга</div><div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--accent2)' }}>₽500</div><div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '4px' }}>Бонус за каждого нового клиента</div>
                </div>
                <div style={{ background: 'rgba(91,171,114,0.08)', borderRadius: 'var(--radius)', padding: '16px', border: '1px solid rgba(91,171,114,0.2)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Получено рефералов</div><div style={{ fontSize: '28px', fontWeight: 800, color: '#5BAB72' }}>24</div><div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '4px' }}>За последние 3 месяца</div>
                </div>
                <div style={{ background: 'rgba(74,128,196,0.08)', borderRadius: 'var(--radius)', padding: '16px', border: '1px solid rgba(74,128,196,0.2)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Выплачено бонусов</div><div style={{ fontSize: '28px', fontWeight: 800, color: '#4A80C4' }}>₽12K</div><div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '4px' }}>Реферальных выплат</div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== SETTINGS ===== */}
          <div className={`section ${activeSection === 'settings' ? 'active' : ''}`}>
            <div className="grid-2">
              <div className="card">
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Общие настройки</div>
                <div className="settings-row"><div><div className="label">Название компании</div><div className="sub">Pilates & Wellness Studio</div></div><button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button></div>
                <div className="settings-row"><div><div className="label">Timezone</div><div className="sub">Europe/Moscow (UTC+3)</div></div><button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button></div>
                <div className="settings-row"><div><div className="label">Валюта</div><div className="sub">RUB — Российский рубль</div></div><button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button></div>
                <div className="settings-row"><div><div className="label">Язык интерфейса</div><div className="sub">Русский</div></div><button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button></div>
              </div>
              <div className="card">
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Рабочие часы</div>
                <div className="settings-row"><div><div className="label">Будни</div><div className="sub">08:00 — 22:00</div></div><button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button></div>
                <div className="settings-row"><div><div className="label">Суббота</div><div className="sub">09:00 — 20:00</div></div><button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button></div>
                <div className="settings-row"><div><div className="label">Воскресенье</div><div className="sub">10:00 — 18:00</div></div><button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button></div>
                <div className="settings-row"><div><div className="label">Длительность слота</div><div className="sub">60 минут</div></div><button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button></div>
              </div>
            </div>
          </div>

          {/* ===== BILLING ===== */}
          <div className={`section ${activeSection === 'billing' ? 'active' : ''}`}>
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>Текущий тариф</div>
            <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '20px' }}>У вас тариф <strong>Pro</strong>. Следующее списание — 15 июля 2025</div>
            <div className="grid-3 mb-20">
              <div className="plan-card">
                <div className="plan-name">Старт</div><div className="plan-price">₽990 <span>/ мес.</span></div>
                <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }}></div>
                <div className="plan-feature"><span className="plan-check">✓</span> До 3 сотрудников</div><div className="plan-feature"><span className="plan-check">✓</span> До 100 клиентов</div><div className="plan-feature"><span className="plan-check">✓</span> Онлайн-запись</div><div className="plan-feature" style={{ opacity: 0.3 }}>✗ Аналитика</div><div className="plan-feature" style={{ opacity: 0.3 }}>✗ API</div>
              </div>
              <div className="plan-card selected">
                <div className="plan-badge">Текущий</div>
                <div className="plan-name">Pro</div><div className="plan-price">₽2 490 <span>/ мес.</span></div>
                <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }}></div>
                <div className="plan-feature"><span className="plan-check">✓</span> До 20 сотрудников</div><div className="plan-feature"><span className="plan-check">✓</span> Неограниченно клиентов</div><div className="plan-feature"><span className="plan-check">✓</span> Полная аналитика</div><div className="plan-feature"><span className="plan-check">✓</span> Лояльность и CRM</div><div className="plan-feature" style={{ opacity: 0.5 }}>✗ White-label</div>
              </div>
              <div className="plan-card">
                <div className="plan-name">Business</div><div className="plan-price">₽5 990 <span>/ мес.</span></div>
                <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }}></div>
                <div className="plan-feature"><span className="plan-check">✓</span> Неограниченно всё</div><div className="plan-feature"><span className="plan-check">✓</span> White-label</div><div className="plan-feature"><span className="plan-check">✓</span> API-доступ</div><div className="plan-feature"><span className="plan-check">✓</span> Мультифилиалы</div><div className="plan-feature"><span className="plan-check">✓</span> Приоритетная поддержка</div>
              </div>
            </div>
          </div>

          {/* ===== JOURNAL ===== */}
          <div className={`section ${activeSection === 'journal' ? 'active' : ''}`} style={{ height: 'calc(100vh - 56px - 56px)' }}>
            <div className="journal-layout">
              <div className="journal-main">
                <div className="journal-toolbar">
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>Журнал · Сегодня</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
                    {['Все тренеры', 'Анна Н.', 'Дарья П.', 'Михаил В.'].map(f => (
                      <div key={f} className={`filter-pill ${jFilters[f] ? 'active' : ''}`} onClick={() => toggleJFilter(f)}>{f}</div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {['Зал 1', 'Зал 2', 'Студия'].map(f => (
                      <div key={f} className={`filter-pill ${jHalls[f] ? 'active' : ''}`} onClick={() => toggleJHall(f)}>{f}</div>
                    ))}
                  </div>
                </div>
                <div className="journal-grid-area">
                  <div className="journal-grid">
                    <div className="jg-head"></div>
                    {jDays.map((d, i) => <div key={i} className="jg-head" style={{ fontSize: '10px' }}>{d}</div>)}
                    {jTimes.map((t, ti) => (
                      <React.Fragment key={ti}>
                        <div className="jg-time">{t}</div>
                        {[0, 1, 2, 3, 4, 5].map(d => {
                          const key = `${d}_${ti}`;
                          return jBookings[key] ? (
                            <div key={d} className="jg-cell booked" style={{ background: jColors[d], color: 'var(--text)', fontWeight: 600 }}>{jBookings[key]}</div>
                          ) : (
                            <div key={d} className="jg-cell empty"></div>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
              <div className="journal-right">
                <div className="mini-cal">
                  <div className="mini-cal-header">
                    <button className="mc-btn" onClick={() => changeMonth(-1)}>‹</button>
                    <div className="mc-title">{monthNames[calMonth]} {calYear}</div>
                    <button className="mc-btn" onClick={() => changeMonth(1)}>›</button>
                  </div>
                  <div className="mini-cal-days">
                    <div className="mcd">Пн</div><div className="mcd">Вт</div><div className="mcd">Ср</div><div className="mcd">Чт</div><div className="mcd">Пт</div><div className="mcd">Сб</div><div className="mcd">Вс</div>
                    <div style={{ gridColumn: '1/-1', display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px' }}>
                      {Array.from({ length: offset }).map((_, i) => <div key={`empty-${i}`}></div>)}
                      {calendarDays.map(d => {
                        const isToday = (d === 30 && calMonth === 5 && calYear === 2025);
                        const hasEvent = [3, 8, 12, 17, 24, 28].includes(d);
                        return (
                          <div key={d} className={`mcday ${isToday ? 'today' : ''} ${hasEvent && !isToday ? 'has-event' : ''}`}>
                            {d}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div style={{ height: '1px', background: 'var(--border)', margin: '14px 0' }}></div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Залы</div>
                <div className="hall-select">
                  {['Зал 1', 'Зал 2', 'Студия', 'Онлайн'].map(f => (
                    <div key={f} className={`hall-chip ${jHalls[f] ? 'active' : ''}`} onClick={() => toggleJHall(f)}>{f}</div>
                  ))}
                </div>
                <div style={{ height: '1px', background: 'var(--border)', margin: '14px 0' }}></div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Загрузка тренеров</div>
                <div>
                  {[['АН', '#5BAB72', 'Анна Н.', 94], ['ДП', '#e08060', 'Дарья П.', 81], ['МВ', '#40a8a0', 'Михаил В.', 68], ['ОС', '#4A80C4', 'Ольга С.', 45]].map(([i, c, n, p], idx) => (
                    <div key={idx} className="staff-load-item">
                      <div className="sli-top"><div className="sli-ava" style={{ background: c as string }}>{i}</div><div className="sli-name">{n}</div><div className="sli-pct">{p}%</div></div>
                      <div className="sli-bar"><div className="sli-fill" style={{ width: `${p}%`, background: c as string }}></div></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ===== PROFILE ===== */}
          <div className={`section ${activeSection === 'profile' ? 'active' : ''}`}>
            <div style={{ maxWidth: '480px' }}>
              <div className="card mb-20">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                  <div className="user-avatar" style={{ width: '60px', height: '60px', fontSize: '18px' }}>АМ</div>
                  <div><div style={{ fontSize: '17px', fontWeight: 700 }}>Алексей Морозов</div><div style={{ fontSize: '13px', color: 'var(--text3)' }}>admin@velora.studio</div></div>
                </div>
                <div className="settings-row"><div><div className="label">Email</div><div className="sub">admin@velora.studio</div></div><button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button></div>
                <div className="settings-row"><div><div className="label">Телефон</div><div className="sub">+7 (999) 123-45-67</div></div><button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Изменить</button></div>
                <div className="settings-row"><div><div className="label">Пароль</div><div className="sub">Последнее изменение: 30 дней назад</div></div><button className="topbar-ghost" style={{ fontSize: '11px', padding: '5px 10px' }}>Сменить</button></div>
              </div>
              <div className="card">
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>Сменить аккаунт</div>
                <div className="staff-item" style={{ padding: '10px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent)', background: 'rgba(252,174,145,0.06)' }}>
                  <div className="staff-ava" style={{ background: 'linear-gradient(135deg,#FCAE91,#f5887a)' }}>АМ</div>
                  <div className="staff-info"><div className="name">Алексей Морозов</div><div className="role">admin@velora.studio</div></div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>Активен</div>
                </div>
                <div className="staff-item" style={{ cursor: 'pointer', marginTop: '4px' }}>
                  <div className="staff-ava" style={{ background: 'linear-gradient(135deg,#4A80C4,#3a6ab0)' }}>ОС</div>
                  <div className="staff-info"><div className="name">Ольга Смирнова</div><div className="role">olga@velora.studio</div></div>
                </div>
                <button className="topbar-ghost" style={{ width: '100%', marginTop: '8px', justifyContent: 'center' }}>+ Добавить аккаунт</button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* TG MODAL */}
      <div className={`tg-modal-overlay ${isTgModalOpen ? 'open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setTgModalOpen(false) }}>
        <div className="tg-modal">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div className="modal-title">Подключить Telegram-бота</div>
            <button onClick={() => setTgModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text3)' }}>×</button>
          </div>
          <div className="modal-sub">Вставьте токен вашего Telegram-бота</div>
          <input className="input-field" type="text" placeholder="123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ" />
          <button className="topbar-btn" style={{ width: '100%', justifyContent: 'center', padding: '11px' }}>Подключить бота</button>
          <div className="instruction-box">
            <div className="ins-title">📖 Как получить токен?</div>
            <ol>
              <li>Откройте Telegram и найдите <strong>@BotFather</strong></li>
              <li>Отправьте команду <code>/newbot</code></li>
              <li>Придумайте имя и username для бота</li>
              <li>Скопируйте токен из ответа BotFather</li>
              <li>Вставьте токен в поле выше и нажмите «Подключить»</li>
            </ol>
          </div>
        </div>
      </div>

    </div>
  );
}