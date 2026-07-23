import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { clientsApi } from '../../api/clients/clients.api';
import { queryClient } from '../../api/queryClient';
import { queryKeys } from '../../api/queryKeys';
import { studioApi } from '../../api/studio/studio.api';
import { servicesApi } from '../../api/studio/services.api';
import { staffApi } from '../../api/staff';
import { scheduleApi } from '../../api/schedule';
import { toDateStr } from '../../pages/dashboard/Journal/utils';
import { fetchBookings } from '../../pages/dashboard/Journal/hooks/useSchedule';

// Префетч данных раздела по hover пункта меню: к клику страница уже из кэша.
// staleTime бережёт от спама — повторный hover свежие данные не перезапрашивает.
// Карта «пункт → ключи» расширяется по мере миграции страниц на Query.
const prefetchCatalog = () => {
  queryClient.prefetchQuery({ queryKey: queryKeys.branches, queryFn: () => studioApi.getBranches() });
  queryClient.prefetchQuery({ queryKey: queryKeys.services, queryFn: () => servicesApi.list() });
};

const prefetchJournal = async () => {
  const [staff, halls] = await Promise.all([
    queryClient.fetchQuery({ queryKey: queryKeys.staff, queryFn: () => staffApi.getList().then(r => r.staff.items) }),
    queryClient.fetchQuery({ queryKey: queryKeys.halls, queryFn: () => scheduleApi.getHalls() }),
  ]);
  const today = toDateStr(new Date());
  // journalLessons хранит уже смапленные Booking[] (не сырые Lesson[]) — маппим
  // тем же fetchBookings, что и сам useSchedule, иначе типы в кэше разъедутся.
  queryClient.prefetchQuery({
    queryKey: queryKeys.journalLessons(today, today),
    queryFn: () => fetchBookings(today, today, staff, halls),
  });
};

export interface SidebarProps {
  role: string | null;           // owner видит все разделы, admin/trainer — только свои
}

// Боковое меню каркаса (стили — классы .sidebar/.nav-item в App.css).
export function Sidebar({ role }: SidebarProps) {
  // Счётчик клиентов для бейджа меню — реальные данные, не хардкод
  const [clientsCount, setClientsCount] = useState<number | null>(null);
  useEffect(() => {
    clientsApi.getCount()
      .then((res) => setClientsCount(res.count))
      .catch(() => setClientsCount(null));
  }, []);

  return (
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

        {role === 'owner' && (
        <NavLink to="/dashboard/staff" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0-3-3.85" /></svg>
          Сотрудники
        </NavLink>
        )}

        {role === 'owner' && (
        <NavLink to="/dashboard/catalog" onMouseEnter={prefetchCatalog} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Каталог
        </NavLink>
        )}

        <NavLink to="/dashboard/clients" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.85" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          Клиенты
          {clientsCount !== null && <span className="nav-badge">{clientsCount}</span>}
        </NavLink>

        {role === 'owner' && (
        <NavLink to="/dashboard/reports" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>
          Отчёты
        </NavLink>
        )}

        {role === 'owner' && (
        <NavLink to="/dashboard/booking" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
          Онлайн-запись
        </NavLink>
        )}

        {role === 'owner' && (
        <NavLink to="/dashboard/finances" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
          Финансы
        </NavLink>
        )}

        {role === 'owner' && (
        <NavLink to="/dashboard/notifications" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          Уведомления
        </NavLink>
        )}

        {role === 'owner' && (
        <NavLink to="/dashboard/loyalty" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          Лояльность
        </NavLink>
        )}

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

        {role === 'owner' && (
        <NavLink to="/dashboard/billing" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
          Тариф и оплата
        </NavLink>
        )}
      </div>

      <div className="sidebar-bottom">
        <NavLink to="/dashboard/journal" onMouseEnter={prefetchJournal} className="sidebar-journal" style={{ textDecoration: 'none' }}>
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
  );
}
