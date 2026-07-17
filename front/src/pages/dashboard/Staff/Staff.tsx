import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import './Staff.css';
import type { Employee, ScheduleMatrix, SchedulesMap, RoleCard } from './types';
import { TIME_OPTIONS, DAYS_KEYS, ROLE_CARDS } from './constants';
import { useStaffList } from './hooks/useStaffList';
import { useStaffProfile } from './hooks/useStaffProfile';
import { useStaffFilters } from './hooks/useStaffFilters';
import { StaffList }  from './components/StaffList';
import { StaffStats } from './components/StaffStats';
import { AddEmployeeModal }  from './components/modals/AddEmployeeModal';
import EditStaffModal from '../../../components/modals/EditStaffModal';
import { DeleteConfirmModal } from './components/modals/DeleteConfirmModal';
import { useToast } from '../../../components/ui/Toast';
import { ApiError, resolveImageUrl } from '../../../api/client';
import { settingsApi } from '../../../api/settings/settings.api';
import { getCurrencySymbol } from '../../../components/UI';
import type { StaffListItem, StaffWorkingHoursItem, StaffProfile } from '../../../api/staff/staff.types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FALLBACK_GRADIENT = 'linear-gradient(135deg,#FCAE91,#f5887a)';

function toEmployee(item: StaffListItem): Employee {
  return {
    id: item.id,
    name: item.name,
    last_name: item.last_name ?? undefined,
    email: item.email,
    phone: item.phone ?? undefined,
    role: item.role,
    department: item.department,
    is_online: item.is_online,
    photo_url: item.photo_url ?? undefined,
    avatar_gradient: item.avatar_gradient ?? undefined,
    stats: { total_bookings: 0, total_attended: 0, load_percent: 0, total_revenue: 0 },
  };
}

function scheduleToWorkingHours(
  schedule: Record<string, { enabled: boolean; from: string; to: string }> | undefined
): StaffWorkingHoursItem[] {
  if (!schedule) return [];
  return DAYS_KEYS.map((key, dayOfWeek) => ({
    day_of_week: dayOfWeek,
    is_open: schedule[key]?.enabled ?? false,
    open_time: schedule[key]?.from ?? '09:00',
    close_time: schedule[key]?.to ?? '18:00',
  }));
}

function workingHoursToSchedule(
  hours: StaffWorkingHoursItem[]
): Record<string, { enabled: boolean; from: string; to: string }> {
  const byDay = new Map(hours.map(wh => [wh.day_of_week, wh]));
  const schedule: Record<string, { enabled: boolean; from: string; to: string }> = {};
  DAYS_KEYS.forEach((key, dayOfWeek) => {
    const wh = byDay.get(dayOfWeek);
    schedule[key] = {
      enabled: wh?.is_open ?? false,
      from: wh?.open_time ?? '09:00',
      to: wh?.close_time ?? '18:00',
    };
  });
  return schedule;
}

function hoursToMatrix(hours: StaffWorkingHoursItem[]): ScheduleMatrix {
  const matrix: ScheduleMatrix = Array.from({ length: TIME_OPTIONS.length }, () => Array(7).fill(0));
  for (const wh of hours) {
    if (!wh.is_open) continue;
    for (let ti = 0; ti < TIME_OPTIONS.length; ti++) {
      if (TIME_OPTIONS[ti] >= wh.open_time && TIME_OPTIONS[ti] < wh.close_time) {
        matrix[ti][wh.day_of_week] = 1;
      }
    }
  }
  return matrix;
}

// ─── Local state types ────────────────────────────────────────────────────────

interface ActionModal {
  isOpen: boolean;
  title: string;
  sub: string;
  type?: 'PROMPT_MESSAGE' | 'PROMPT_CALL';
  phone?: string;
  email?: string;
  onConfirm?: () => void;
}

interface DeleteModal {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  showDontAsk?: boolean;
  onConfirm: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Staff() {
  const { t, i18n } = useTranslation(['staff', 'common']);

  // ── API hooks ─────────────────────────────────────────────────────────────
  const { rawStaff, isLoading: listLoading, create, update, deleteStaff } = useStaffList();
  const [activeStaffId, setActiveStaffId] = useState<number | null>(() => {
    const saved = localStorage.getItem('staff_active_id');
    return saved ? Number(saved) : null;
  });
  const { profile, monthData, isLoading: profileLoading, refetchProfile, fetchMonth, cancelLesson, createLesson } = useStaffProfile(activeStaffId);

  // Создаем "Подготовленные данные для интерфейса" (ViewModel)
  const adaptedStaff = useMemo(() => rawStaff.map(item => {
    const emp = toEmployee(item);
    
    // Определяем сырой ключ отдела (если его нет, берем роль)
    const rawGroup = emp.role;

    return {
      ...emp,
      // 🔥 Вот твоя идея в действии! Переводим заранее:
      _translatedRole: t(`staff:roles.${emp.role}`, { defaultValue: emp.role }),
      _resolvedGroupKey: rawGroup, // Оставляем сырой ключ для логики React (key)
      _translatedGroup: t(`staff:roles.${rawGroup}`, { defaultValue: rawGroup })
    };
  }), [rawStaff, t]); // t в зависимостях: при смене языка массив пересоберется сам!

  const ownerCount = rawStaff.filter(s => s.role === 'owner').length;

  const selectStaff = (id: number | null) => {
    if (id != null) localStorage.setItem('staff_active_id', String(id));
    else localStorage.removeItem('staff_active_id');
    setActiveStaffId(id);
  };

  useEffect(() => {
    if (rawStaff.length === 0) return;
    if (activeStaffId && rawStaff.some(s => s.id === activeStaffId)) return;
    const fallback = rawStaff.find(s => s.role === 'owner') ?? rawStaff[0];
    setActiveStaffId(fallback.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawStaff]);

  // ── Filters (search, groups) ──────────────────────────────────────────────
  const { staffList, searchQuery, setSearchQuery, activeGroup, setActiveGroup, availableGroups } =
    useStaffFilters(adaptedStaff);

  // ── Core UI state ─────────────────────────────────────────────────────────
  const toast = useToast();
  const [dontAskDelete, setDontAskDelete] = useState(false);
  const [scheduleView,  setScheduleView]  = useState<'week' | 'month'>('week');
  const [currency, setCurrency] = useState<string>();

  useEffect(() => {
    settingsApi.getGeneral().then(s => setCurrency(s.currency)).catch(() => {});
  }, []);

  // ── Employee modals ───────────────────────────────────────────────────────
  const [isAddModalOpen,  setIsAddModalOpen]  = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // ── Action modal (non-destructive: write / call) ──────────────────────────
  const [actionModal, setActionModal] = useState<ActionModal>({ isOpen: false, title: '', sub: '' });
  const closeActionModal = () => setActionModal(m => ({ ...m, isOpen: false }));

  // ── Delete confirmation modal ─────────────────────────────────────────────
  const [deleteModal, setDeleteModal] = useState<DeleteModal>({
    isOpen: false, title: '', message: '', onConfirm: () => {},
  });
  const closeDeleteModal = () => setDeleteModal(m => ({ ...m, isOpen: false }));

  // ── Add-event modal (создание занятия для сотрудника) ─────────────────────
  const [addEvent, setAddEvent] = useState<{
    name: string; time: string; duration: string; hallId: number | null; spots: string; price: string;
  } | null>(null);
  const [addEventBusy, setAddEventBusy] = useState(false);

  // ── Schedule local state (initialized from profile) ───────────────────────
  const [schedules, setSchedules] = useState<SchedulesMap>({});

  useEffect(() => {
    if (profile && activeStaffId) {
      setSchedules(prev => ({
        ...prev,
        [activeStaffId]: hoursToMatrix(profile.week_working_hours),
      }));
    }
  }, [profile?.id]);

  // Fetch month data when switching to month view
  useEffect(() => {
    if (scheduleView === 'month' && activeStaffId) {
      fetchMonth();
    }
  }, [scheduleView, activeStaffId]);

  // ── Today's events from profile ───────────────────────────────────────────
  const activeUpcoming = profile?.today_schedule ?? [];

  // ─── Derived from profile ─────────────────────────────────────────────────
  const isOwner = profile?.role === 'owner';
  const loadValue = profile?.stats.load_percent ?? 0;

  const heroInitials = profile
    ? [profile.name, profile.last_name].filter(Boolean).map(n => n![0]).join('').toUpperCase()
    : '';
  const heroGradient = profile?.avatar_gradient ?? FALLBACK_GRADIENT;
  const heroPhotoUrl = resolveImageUrl(profile?.photo_url);

  const roleCards: RoleCard[] = profile
    ? (ROLE_CARDS[profile.role] ?? ROLE_CARDS['default'] ?? [])
    : [];

  const hasLoadCard = roleCards.some(c => c.id === 'load');

  function resolveCardValue(card: RoleCard, p: StaffProfile): string {
    const currencySymbol = getCurrencySymbol(currency);
    if (!card.field) return '—';
    const statsVal = (p.stats as unknown as Record<string, number | undefined>)[card.field];
    if (statsVal !== undefined) {
      if (card.format === 'currency') return `${currencySymbol}${(statsVal / 1000).toFixed(0)}K`;
      if (card.format === 'percent')  return `${statsVal}%`;
      return String(statsVal);
    }
    const empVal = (p as unknown as Record<string, unknown>)[card.field];
    if (empVal == null) return '—';
    if (card.format === 'rating')   return `${empVal}★`;
    if (card.format === 'currency') return `${currencySymbol}${((empVal as number) / 1000).toFixed(0)}K`;
    if (card.format === 'percent')  return `${empVal}%`;
    return String(empVal);
  }

  // ─── Schedule period labels ───────────────────────────────────────────────
  const weekLabel = useMemo(() => {
    const locale = i18n.language;
    const now = new Date();
    const day = now.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const mon = new Date(now); mon.setDate(now.getDate() + diffToMon);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' });
    const fmtYear = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });
    if (mon.getMonth() === sun.getMonth()) {
      return `${mon.getDate()}–${fmtYear.format(sun)}`;
    }
    return `${fmt.format(mon)} – ${fmtYear.format(sun)}`;
  }, [i18n.language]);

  const monthLabel = useMemo(() => {
    return new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(new Date());
  }, [i18n.language]);

  const showToast = toast.success;

  const deleteEvent = (i: number) => {
    const lesson = activeUpcoming[i];
    const doCancel = async () => {
      try {
        if (lesson?.id) await cancelLesson(lesson.id);
        showToast(t('staff:toasts.lessonCanceled'));
      } catch {
        showToast(t('staff:toasts.errorCancel'));
      }
    };
    if (dontAskDelete) { doCancel(); return; }
    setDeleteModal({
      isOpen: true,
      title: t('staff:deleteModal.cancelLesson'),
      message: `${lesson.name} · ${lesson.start_time}`,
      showDontAsk: true,
      onConfirm: () => { doCancel(); closeDeleteModal(); },
    });
  };

  const openAddEvent = () => {
    setAddEvent({
      name: '',
      time: '10:00',
      duration: '60',
      hallId: profile?.halls[0]?.id ?? null,
      spots: '8',
      price: '0',
    });
  };

  const submitAddEvent = async () => {
    if (!addEvent || !activeStaffId || addEventBusy) return;
    if (!addEvent.name.trim() || !/^\d{1,2}:\d{2}$/.test(addEvent.time)) return;
    setAddEventBusy(true);
    try {
      // start_time — сегодня в выбранное время (локально), как ISO без TZ-сдвига.
      const now = new Date();
      const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const startIso = `${ymd}T${addEvent.time.padStart(5, '0')}:00`;
      await createLesson({
        name: addEvent.name.trim(),
        teacher_id: activeStaffId,
        hall_id: addEvent.hallId,
        start_time: startIso,
        duration_min: parseInt(addEvent.duration) || 60,
        total_spots: parseInt(addEvent.spots) || 8,
        price: parseInt(addEvent.price) || 0,
        level: '',
        equipment: '',
      });
      setAddEvent(null);
      showToast(t('staff:toasts.lessonAdded'));
    } catch {
      showToast(t('staff:toasts.errorAdd'));
    } finally {
      setAddEventBusy(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ height: 'calc(100vh - 56px - 56px)', display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'hidden' }}>

      {/* ── SUMMARY STATS ─────────────────────────────────────────────────── */}
      <StaffStats staff={adaptedStaff} />

      {/* ── MAIN LAYOUT ───────────────────────────────────────────────────── */}
      <div className="staff-layout" style={{ flex: 1, minHeight: 0 }}>

        {/* LEFT PANEL */}
        <StaffList
          staffList={staffList}
          activeStaffId={activeStaffId}
          onSelect={selectStaff}
          searchQuery={searchQuery}
          onSearch={setSearchQuery}
          activeGroup={activeGroup}
          onGroupChange={setActiveGroup}
          availableGroups={availableGroups}
          onAddClick={() => setIsAddModalOpen(true)}
        />

        {/* RIGHT PANEL: PROFILE */}
        <div className="premium-right">
          {(listLoading || (profileLoading && !profile)) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: '14px' }}>
              {t('common:status.loading')}
            </div>
          )}

          {profile && (
            <>
              <div className="premium-hero">
                <div className="hero-bg" style={{ background: 'rgba(252,174,145,0.08)' }} />

                <div className="hero-actions">
                  <button
                    className="h-btn"
                    onClick={() => setActionModal({
                      isOpen: true, title: t('staff:actionModal.writeTitle', { name: profile.name }),
                      sub: t('staff:actionModal.writeSub'), type: 'PROMPT_MESSAGE',
                      email: profile.email ?? undefined,
                      onConfirm: () => {
                        const el = document.getElementById('staff-msg-body') as HTMLTextAreaElement | null;
                        const body = el?.value.trim();
                        const email = profile.email;
                        if (!email) { showToast(t('staff:toasts.messageSent')); closeActionModal(); return; }
                        window.location.href = `mailto:${email}${body ? `?body=${encodeURIComponent(body)}` : ''}`;
                        closeActionModal();
                      },
                    })}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    {t('staff:profile.write')}
                  </button>
                  <button
                    className="h-btn"
                    onClick={() => setActionModal({
                      isOpen: true, title: t('staff:actionModal.callTitle', { name: profile.name }),
                      sub: t('staff:actionModal.callSub'), type: 'PROMPT_CALL',
                      phone: profile.phone ?? undefined,
                    })}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.92 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    {t('staff:profile.call')}
                  </button>

                  {!isOwner && (
                    <button
                      onClick={() => setIsEditModalOpen(true)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 20px', background: '#FFFFFF', color: '#1A1A1A',
                        border: '1px solid rgba(26,26,26,0.1)', borderRadius: '12px',
                        fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                        transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                        fontFamily: "'Manrope', sans-serif",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.2)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'; e.currentTarget.style.borderColor = 'rgba(26,26,26,0.1)'; }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                      {t('common:buttons.edit')}
                    </button>
                  )}
                </div>

                <div className="hero-info">
                  <div
                    className="hero-ava"
                    style={{
                      background: heroPhotoUrl ? `url(${heroPhotoUrl}) center/cover no-repeat` : heroGradient,
                    }}
                  >
                    {!heroPhotoUrl && heroInitials}
                    {profile.is_online && <div className="badge-online" />}
                  </div>
                  <div>
                    <div className="hero-name">{profile.name} {profile.last_name}</div>
                    <div className="hero-role">
                      {t(`staff:roles.${profile.role}`, { defaultValue: profile.role })}{' '}
                      {profile.is_online
                        ? <span style={{ color: '#5BAB72', fontWeight: 700 }}>{t('staff:profile.online')}</span>
                        : t('staff:profile.offline')}
                    </div>
                  </div>
                </div>
              </div>

              <div className="premium-body fade-in" key={profile.id}>

                {/* Stats cards — JSON-driven per role */}
                <div className="stats-row" style={{ gridTemplateColumns: `repeat(${roleCards.length}, 1fr)` }}>
                  {roleCards.map((card) => (
                    <div key={card.id} className="stat-card">
                      <div className="stat-v">{resolveCardValue(card, profile)}</div>
                      <div className="stat-l">
                        {t(`staff:cards.${profile.role}.${card.id}`, { defaultValue: t(`staff:cards.default.${card.id}`, { defaultValue: card.id }) })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Info chips */}
                <div className="info-row">
                  <div className="chip status-on">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    {t('common:status.active')}
                  </div>
                  <div className="chip" onClick={() => showToast(t('staff:toasts.emailCopied'))}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    {profile.email}
                  </div>
                  {profile.phone && (
                    <div className="chip" onClick={() => showToast(t('staff:toasts.ringing'))}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.92 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      {profile.phone}
                    </div>
                  )}
                </div>

                {/* Owner card */}
                {isOwner && (
                  <div className="owner-card">
                    <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      {t('staff:profile.fullAccess')}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '2px' }}>{t('staff:profile.ownerAccess')}</div>
                    <div className="owner-perm">
                      {(['finance', 'staff', 'reports', 'clients', 'settings'] as const).map(key => (
                        <span key={key} className="perm-badge">{t(`staff:permissions.${key}`)}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Load bar */}
                {hasLoadCard && loadValue > 0 && (
                  <div className="load-bar-wrap" style={{ marginTop: '4px' }}>
                    <div className="load-bar-top">
                      <span className="load-bar-label">{t('staff:profile.loadBar')}</span>
                      <span className="load-bar-pct">{loadValue}%</span>
                    </div>
                    <div className="load-bar-bg">
                      <div
                        className="load-bar-fill"
                        style={{ width: `${loadValue}%`, background: loadValue > 85 ? '#5BAB72' : loadValue > 60 ? '#FCAE91' : '#D88C9A' }}
                      />
                    </div>
                  </div>
                )}

                {/* Schedule grid */}
                {!isOwner && activeStaffId && schedules[activeStaffId] && (
                  <>
                    <div className="sec-title">
                      <span>{t('staff:profile.weekSchedule')}</span>
                    </div>

                    <div className="sch-wrap">
                      <div className="sch-top">
                        <div className="day-tabs">
                          <button className={`day-tab ${scheduleView === 'week' ? 'active' : ''}`} onClick={() => setScheduleView('week')}>{t('staff:schedule.week')}</button>
                          <button className={`day-tab ${scheduleView === 'month' ? 'active' : ''}`} onClick={() => setScheduleView('month')}>{t('staff:schedule.month')}</button>
                        </div>
                        <span className="week-label">{scheduleView === 'week' ? weekLabel : monthLabel}</span>
                      </div>

                      {scheduleView === 'week' ? (
                        <>
                          <div className="sch-grid">
                            <div className="sch-head" />
                            {DAYS_KEYS.map((dayKey, i) => <div key={i} className="sch-head">{t(`common:days.short.${dayKey}`)}</div>)}
                            {TIME_OPTIONS.map((timeString, ti) => (
                              <React.Fragment key={ti}>
                                <div className="sch-time">{timeString}</div>
                                {[0,1,2,3,4,5,6].map(di => {
                                  const booked = activeStaffId ? schedules[activeStaffId]?.[ti]?.[di] : 0;
                                  return (
                                    <div
                                      key={di}
                                      className={`sch-cell ${booked ? 'booked' : ''}`}
                                    />
                                  );
                                })}
                              </React.Fragment>
                            ))}
                          </div>

                          <div className="sch-legend">
                            <div className="leg">
                              <div className="leg-dot" style={{ background: 'var(--accent)' }} />
                              {t('staff:schedule.working')}
                            </div>
                            <div className="leg">
                              <div className="leg-dot" style={{ background: 'rgba(252,174,145,.12)', border: '1px solid var(--border2)' }} />
                              {t('staff:schedule.free')}
                            </div>
                          </div>

                          {(profile?.halls.length ?? 0) > 0 && (
                            <div className="sch-legend" style={{ marginTop: '8px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)' }}>
                                {t('staff:profile.staffHalls')}
                              </span>
                              {profile!.halls.map(h => (
                                <div key={h.id} className="leg">
                                  <div className="leg-dot" style={{ background: h.color ?? '#F9A08B' }} />
                                  {h.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ padding: '8px 10px 10px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
                            {DAYS_KEYS.map(dayKey => (
                              <div key={dayKey} style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text3)', textAlign: 'center', padding: '3px 0' }}>
                                {t(`common:days.short.${dayKey}`)}
                              </div>
                            ))}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                            {(() => {
                              const cells: React.ReactNode[] = [];
                              const now = new Date();
                              const year = now.getFullYear();
                              const month = now.getMonth();
                              const daysInMonth = new Date(year, month + 1, 0).getDate();
                              const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
                              for (let i = 0; i < firstDow; i++) {
                                cells.push(<div key={`e${i}`} style={{ height: '28px', borderRadius: '5px', background: 'rgba(26,26,26,0.02)' }} />);
                              }
                              for (let day = 1; day <= daysInMonth; day++) {
                                const dayLessons = monthData?.lessons.filter(l => {
                                  const d = new Date(l.start_time);
                                  return d.getDate() === day;
                                }).length ?? 0;
                                const opacity = 0.06 + (dayLessons / 5) * 0.64;
                                cells.push(
                                  <div key={day} style={{
                                    height: '28px', borderRadius: '5px', position: 'relative',
                                    background: `rgba(252,174,145,${Math.min(opacity, 0.70).toFixed(2)})`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'default',
                                  }}>
                                    <span style={{ fontSize: '9px', fontWeight: 600, color: dayLessons > 3 ? '#a05040' : 'var(--text3)' }}>{day}</span>
                                  </div>
                                );
                              }
                              return cells;
                            })()}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <div style={{ width: '24px', height: '8px', borderRadius: '3px', background: 'rgba(252,174,145,0.06)' }} />
                              <span style={{ fontSize: '9px', color: 'var(--text3)' }}>{t('staff:schedule.free')}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <div style={{ width: '24px', height: '8px', borderRadius: '3px', background: 'rgba(252,174,145,0.70)' }} />
                              <span style={{ fontSize: '9px', color: 'var(--text3)' }}>{t('staff:schedule.busy')}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Upcoming events */}
                {activeUpcoming.length > 0 && (
                  <>
                    <div className="sec-title" style={{ marginTop: '24px' }}>
                      <span>{t('staff:profile.todaySchedule')}</span>
                      <button className="sch-action-btn btn-add-event" onClick={openAddEvent}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '4px' }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        {t('common:buttons.add')}
                      </button>
                    </div>
                    <div className="upcoming-list">
                      {activeUpcoming.map((u, i) => {
                        const hallColor = u.hall?.color ?? '#888888';
                        return (
                          <div key={u.id} className="upcoming-item">
                            <div className="up-time">
                              <div className="up-time-h">{u.start_time}</div>
                              <div className="up-time-m">{u.duration_min} {t('staff:profile.minutesSuffix')}</div>
                            </div>
                            <div className="up-dot" style={{ background: hallColor }} />
                            <div className="up-info">
                              <div className="up-name">{u.name}</div>
                              <div className="up-sub">{u.booked_count > 0 ? `${u.booked_count} ${t('staff:profile.clientsSuffix')} · ` : ''}{u.hall?.name ?? ''}</div>
                            </div>
                            <div className="up-hall" style={{ background: `${hallColor}18`, color: hallColor }}>{u.hall?.name ?? t('staff:profile.hall')}</div>
                            <div className="up-actions">
                              <button className="up-icon-btn del" onClick={() => deleteEvent(i)}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

              </div>
            </>
          )}
        </div>
      </div>

      {/* ── ACTION MODAL (write / call) ───────────────────────────────────── */}
      {actionModal.isOpen && createPortal(
        <div
          onClick={closeActionModal}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(26,26,26,0.3)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.2s ease forwards', padding: '20px', boxSizing: 'border-box',
          }}
        >
          <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}} @keyframes scaleUp{from{opacity:0;transform:scale(.95) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#FFFFFF', width: '100%', maxWidth: '420px',
              borderRadius: '24px', padding: '32px',
              boxShadow: '0 24px 48px -12px rgba(26,26,26,0.15), 0 0 0 1px rgba(26,26,26,0.04)',
              animation: 'scaleUp 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards',
              display: 'flex', flexDirection: 'column', gap: '24px',
              fontFamily: "'Manrope', sans-serif",
            }}
          >
            <div>
              <div style={{ width:'48px',height:'48px',borderRadius:'14px',marginBottom:'20px',background:'rgba(74,128,196,0.15)',color:'#4A80C4',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              </div>
              <div style={{ fontSize:'20px',fontWeight:800,color:'#1A1A1A',letterSpacing:'-0.3px',marginBottom:'8px' }}>{actionModal.title}</div>
              <div style={{ fontSize:'14px',color:'#666',lineHeight:1.5 }}>{actionModal.sub}</div>
            </div>

            {actionModal.type === 'PROMPT_MESSAGE' && (
              <textarea
                id="staff-msg-body"
                placeholder={t('staff:actionModal.messagePlaceholder')}
                autoFocus
                style={{ width:'100%',height:'100px',padding:'16px',background:'#FDFCFB',border:'1.5px solid rgba(26,26,26,0.1)',borderRadius:'12px',fontSize:'14px',color:'#1A1A1A',outline:'none',resize:'none',fontFamily:'inherit',boxSizing:'border-box' }}
              />
            )}

            {actionModal.type === 'PROMPT_CALL' && (
              <div style={{ display:'flex',flexDirection:'column',gap:'8px' }}>
                <div onClick={() => { const p = actionModal.phone?.replace(/\s/g, ''); closeActionModal(); if (p) window.location.href = `tel:${p}`; else showToast(t('staff:toasts.calling')); }} style={{ display:'flex',alignItems:'center',gap:'16px',padding:'16px',background:'#FDFCFB',border:'1.5px solid rgba(26,26,26,0.06)',borderRadius:'16px',cursor:'pointer',transition:'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(74,128,196,0.3)'; e.currentTarget.style.background='#FFF'; }} onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(26,26,26,0.06)'; e.currentTarget.style.background='#FDFCFB'; }}>
                  <div style={{ width:'40px',height:'40px',borderRadius:'10px',background:'rgba(74,128,196,0.1)',color:'#4A80C4',display:'flex',alignItems:'center',justifyContent:'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.92 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'15px',fontWeight:800,color:'#1A1A1A' }}>{t('staff:actionModal.regularCall')}</div>
                    <div style={{ fontSize:'13px',color:'#666' }}>{actionModal.phone}</div>
                  </div>
                </div>
                <div onClick={() => { const d = actionModal.phone?.replace(/\D/g, ''); closeActionModal(); if (d) window.open(`https://wa.me/${d}`, '_blank', 'noopener'); else showToast(t('staff:toasts.openingWhatsapp')); }} style={{ display:'flex',alignItems:'center',gap:'16px',padding:'16px',background:'#FDFCFB',border:'1.5px solid rgba(26,26,26,0.06)',borderRadius:'16px',cursor:'pointer',transition:'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(91,171,114,0.3)'; e.currentTarget.style.background='#FFF'; }} onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(26,26,26,0.06)'; e.currentTarget.style.background='#FDFCFB'; }}>
                  <div style={{ width:'40px',height:'40px',borderRadius:'10px',background:'rgba(91,171,114,0.12)',color:'#5BAB72',display:'flex',alignItems:'center',justifyContent:'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'15px',fontWeight:800,color:'#1A1A1A' }}>{t('staff:actionModal.writeWhatsapp')}</div>
                    <div style={{ fontSize:'13px',color:'#666' }}>{t('staff:actionModal.toMessenger')}</div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display:'flex',gap:'12px' }}>
              <button onClick={closeActionModal} style={{ flex:1,padding:'12px',background:'#FDFCFB',color:'#1A1A1A',border:'1.5px solid rgba(26,26,26,0.1)',borderRadius:'12px',fontSize:'14px',fontWeight:700,cursor:'pointer',transition:'all 0.2s',fontFamily:'inherit' }} onMouseEnter={e=>e.currentTarget.style.background='rgba(26,26,26,0.02)'} onMouseLeave={e=>e.currentTarget.style.background='#FDFCFB'}>
                {t('common:buttons.cancel')}
              </button>
              {actionModal.onConfirm && (
                <button onClick={actionModal.onConfirm} style={{ flex:1,padding:'12px',background:'#1A1A1A',color:'#FFFFFF',border:'none',borderRadius:'12px',fontSize:'14px',fontWeight:700,cursor:'pointer',transition:'all 0.2s',fontFamily:'inherit',boxShadow:'0 8px 24px rgba(26,26,26,0.15)' }} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.filter='brightness(1.05)'}} onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.filter='none'}}>
                  {t('common:buttons.send')}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── ADD EVENT MODAL (создание занятия для сотрудника) ─────────────── */}
      {addEvent && createPortal(
        <div
          onClick={() => setAddEvent(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(26,26,26,0.3)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.2s ease forwards', padding: '20px', boxSizing: 'border-box',
          }}
        >
          <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}} @keyframes scaleUp{from{opacity:0;transform:scale(.95) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#FFFFFF', width: '100%', maxWidth: '440px',
              borderRadius: '24px', padding: '32px',
              boxShadow: '0 24px 48px -12px rgba(26,26,26,0.15), 0 0 0 1px rgba(26,26,26,0.04)',
              animation: 'scaleUp 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards',
              display: 'flex', flexDirection: 'column', gap: '24px',
              fontFamily: "'Manrope', sans-serif",
            }}
          >
            <div>
              <div style={{ width:'48px',height:'48px',borderRadius:'14px',marginBottom:'20px',background:'rgba(249,160,139,0.15)',color:'#F9A08B',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </div>
              <div style={{ fontSize:'20px',fontWeight:800,color:'#1A1A1A',letterSpacing:'-0.3px',marginBottom:'8px' }}>{t('staff:addEvent.title')}</div>
              <div style={{ fontSize:'14px',color:'#666',lineHeight:1.5 }}>{t('staff:addEvent.sub', { name: profile?.name ?? '' })}</div>
            </div>

            <input
              autoFocus
              placeholder={t('staff:addEvent.namePlaceholder')}
              value={addEvent.name}
              onChange={e => setAddEvent(s => s && { ...s, name: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') submitAddEvent(); }}
              style={{ width:'100%',padding:'14px 16px',background:'#FDFCFB',border:'1.5px solid rgba(26,26,26,0.1)',borderRadius:'12px',fontSize:'14px',color:'#1A1A1A',outline:'none',fontFamily:'inherit',boxSizing:'border-box' }}
            />

            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px' }}>
              <label style={{ display:'flex',flexDirection:'column',gap:'6px',fontSize:'12px',fontWeight:700,color:'#666' }}>
                {t('staff:addEvent.time')}
                <input type="time" value={addEvent.time} onChange={e => setAddEvent(s => s && { ...s, time: e.target.value })}
                  style={{ padding:'12px 14px',background:'#FDFCFB',border:'1.5px solid rgba(26,26,26,0.1)',borderRadius:'10px',fontSize:'14px',color:'#1A1A1A',outline:'none',fontFamily:'inherit',boxSizing:'border-box' }} />
              </label>
              <label style={{ display:'flex',flexDirection:'column',gap:'6px',fontSize:'12px',fontWeight:700,color:'#666' }}>
                {t('staff:addEvent.duration')}
                <input type="number" min="15" step="15" value={addEvent.duration} onChange={e => setAddEvent(s => s && { ...s, duration: e.target.value })}
                  style={{ padding:'12px 14px',background:'#FDFCFB',border:'1.5px solid rgba(26,26,26,0.1)',borderRadius:'10px',fontSize:'14px',color:'#1A1A1A',outline:'none',fontFamily:'inherit',boxSizing:'border-box' }} />
              </label>
              <label style={{ display:'flex',flexDirection:'column',gap:'6px',fontSize:'12px',fontWeight:700,color:'#666' }}>
                {t('staff:addEvent.spots')}
                <input type="number" min="1" max="50" value={addEvent.spots} onChange={e => setAddEvent(s => s && { ...s, spots: e.target.value })}
                  style={{ padding:'12px 14px',background:'#FDFCFB',border:'1.5px solid rgba(26,26,26,0.1)',borderRadius:'10px',fontSize:'14px',color:'#1A1A1A',outline:'none',fontFamily:'inherit',boxSizing:'border-box' }} />
              </label>
              <label style={{ display:'flex',flexDirection:'column',gap:'6px',fontSize:'12px',fontWeight:700,color:'#666' }}>
                {t('staff:addEvent.price')}
                <input type="number" min="0" value={addEvent.price} onChange={e => setAddEvent(s => s && { ...s, price: e.target.value })}
                  style={{ padding:'12px 14px',background:'#FDFCFB',border:'1.5px solid rgba(26,26,26,0.1)',borderRadius:'10px',fontSize:'14px',color:'#1A1A1A',outline:'none',fontFamily:'inherit',boxSizing:'border-box' }} />
              </label>
            </div>

            {(profile?.halls.length ?? 0) > 0 && (
              <div style={{ display:'flex',flexDirection:'column',gap:'8px' }}>
                <div style={{ fontSize:'12px',fontWeight:700,color:'#666' }}>{t('staff:addEvent.hall')}</div>
                <div style={{ display:'flex',flexWrap:'wrap',gap:'8px' }}>
                  {profile!.halls.map(h => {
                    const active = addEvent.hallId === h.id;
                    const color = h.color ?? '#F9A08B';
                    return (
                      <button key={h.id} onClick={() => setAddEvent(s => s && { ...s, hallId: h.id })}
                        style={{ padding:'8px 14px',borderRadius:'10px',fontSize:'13px',fontWeight:700,cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s',
                          border:`1.5px solid ${active ? color : 'rgba(26,26,26,0.1)'}`,
                          background: active ? `${color}18` : '#FDFCFB',
                          color: active ? color : '#1A1A1A' }}>
                        {h.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display:'flex',gap:'12px' }}>
              <button onClick={() => setAddEvent(null)} style={{ flex:1,padding:'12px',background:'#FDFCFB',color:'#1A1A1A',border:'1.5px solid rgba(26,26,26,0.1)',borderRadius:'12px',fontSize:'14px',fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>
                {t('common:buttons.cancel')}
              </button>
              <button onClick={submitAddEvent} disabled={!addEvent.name.trim() || addEventBusy}
                style={{ flex:1,padding:'12px',background:'#1A1A1A',color:'#FFFFFF',border:'none',borderRadius:'12px',fontSize:'14px',fontWeight:700,cursor: (!addEvent.name.trim() || addEventBusy) ? 'not-allowed' : 'pointer',opacity: (!addEvent.name.trim() || addEventBusy) ? 0.5 : 1,fontFamily:'inherit',boxShadow:'0 8px 24px rgba(26,26,26,0.15)' }}>
                {t('staff:addEvent.create')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── DELETE CONFIRM ────────────────────────────────────────────────── */}
      <DeleteConfirmModal
        isOpen={deleteModal.isOpen}
        title={deleteModal.title}
        message={deleteModal.message}
        confirmText={deleteModal.confirmText}
        dontAsk={deleteModal.showDontAsk ? dontAskDelete : undefined}
        onDontAskChange={deleteModal.showDontAsk ? setDontAskDelete : undefined}
        onConfirm={deleteModal.onConfirm}
        onClose={closeDeleteModal}
      />

      {/* ── ADD EMPLOYEE MODAL ───────────────────────────────────────────── */}
      <AddEmployeeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={async (data) => {
          try {
            const result = await create({
              name: data.name,
              last_name: data.last_name || undefined,
              email: data.email,
              phone: data.phone || undefined,
              password: data.password,
              role: data.role,
              salary: data.salary ? Number(data.salary) : undefined,
              rate_type: (data.rate_type as 'fixed' | 'percent' | 'hourly') || undefined,
              service_ids: data.serviceIds,
              schedule: scheduleToWorkingHours(data.schedule),
            });
            if (result?.staff?.id) setActiveStaffId(result.staff.id);
            setIsAddModalOpen(false);
            showToast(t('staff:toasts.employeeAdded', { name: data.name }));
          } catch (err) {
            // 402 (лимит тарифа) уже показан глобальной модалкой апселла — закрываем молча.
            if (err instanceof ApiError && err.status === 402) {
              setIsAddModalOpen(false);
              return;
            }
            toast.error(err instanceof ApiError ? err.message : t('staff:toasts.errorSave'));
            throw err;
          }
        }}
      />

      {/* ── EDIT EMPLOYEE MODAL ──────────────────────────────────────────── */}
      <EditStaffModal
        isOpen={isEditModalOpen}
        staff={isEditModalOpen && profile ? {
          id: profile.id,
          name: profile.name,
          last_name: profile.last_name ?? undefined,
          phone: profile.phone ?? '',
          email: profile.email,
          role: profile.role,
          avatar_gradient: profile.avatar_gradient ?? undefined,
          is_online: profile.is_online,
          rate: profile.rate ?? undefined,
          rate_type: profile.rate_type ?? '',
          service_ids: profile.services.map(s => s.id),
          photo_url: profile.photo_url ?? undefined,
          schedule: workingHoursToSchedule(profile.week_working_hours),
        } : null}
        onClose={() => setIsEditModalOpen(false)}
        onSave={async (updated) => {
          if (!activeStaffId) return;
          try {
            await update(activeStaffId, {
              name: updated.name,
              last_name: updated.last_name,
              email: updated.email,
              phone: updated.phone || undefined,
              role: updated.role,
              rate: updated.rate,
              rate_type: (updated.rate_type as 'fixed' | 'percent' | 'hourly') || undefined,
              service_ids: updated.service_ids ?? [],
              photo_url: updated.photo_url,
              schedule: scheduleToWorkingHours(updated.schedule),
            });
            refetchProfile();
            setIsEditModalOpen(false);
            showToast(t('staff:toasts.changesSaved'));
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('staff:toasts.errorSave'));
            throw err;
          }
        }}
        ownerCount={ownerCount}
        onDelete={async (id) => {
          try {
            await deleteStaff(id);
            selectStaff(null);
            showToast(t('staff:toasts.employeeDeleted'));
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('staff:toasts.errorDelete'));
          }
        }}
      />

    </div>
  );
}
